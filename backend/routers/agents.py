from fastapi import APIRouter, HTTPException, Request, Depends, UploadFile, File, Header
from firebase_admin import firestore
from services.firebase import get_db
from services.audit import log_action
from services.notifications import NotificationService
from services.s3 import upload_file, generate_presigned_url
from pydantic import BaseModel
from typing import Optional
import hashlib
import tempfile
import os
from datetime import datetime

router = APIRouter(prefix="/api/agent", tags=["Agent"])
db = get_db()

# ─────────────────────────────────────────
# HELPER FUNCTIONS
# ─────────────────────────────────────────

def verify_api_key(api_key: str):
    if not api_key:
        return None

    incoming_hash = hashlib.sha256(api_key.encode()).hexdigest()

    orgs = db.collection('organisations').where(
        filter=firestore.FieldFilter('api_key_hash', '==', incoming_hash)
    ).get()

    if not orgs:
        return None

    org = orgs[0].to_dict()

    if org.get('status') != 'active':
        return None

    return org

async def get_agent_org(x_api_key: str = Header(None)):
    if not x_api_key:
        raise HTTPException(
            status_code=401,
            detail="API key required — include X-API-Key header"
        )

    org = verify_api_key(x_api_key)

    if not org:
        raise HTTPException(
            status_code=401,
            detail="Invalid or inactive API key"
        )

    return org

# ─────────────────────────────────────────
# REQUEST MODELS
# ─────────────────────────────────────────

class AuthenticateRequest(BaseModel):
    api_key: str

class HeartbeatRequest(BaseModel):
    org_id: str
    model_version: Optional[str] = None
    status: str = 'online'
    last_sync: Optional[str] = None
    interface: Optional[str] = None
    flows_captured: Optional[int] = 0
    flows_uploaded: Optional[int] = 0

class UpdateConfirmRequest(BaseModel):
    org_id: str
    version: str
    status: str

# ─────────────────────────────────────────
# ENDPOINTS
# ─────────────────────────────────────────

@router.post("/authenticate")
async def authenticate_agent(
    payload: AuthenticateRequest,
    request: Request
):
    org = verify_api_key(payload.api_key)

    if not org:
        log_action(
            admin_id='agent',
            admin_email='agent',
            admin_role='agent',
            action_type='AGENT_AUTH_FAILED',
            action_detail=f"Failed agent authentication from {request.client.host}",
            ip_address=request.client.host,
            status='failed'
        )
        raise HTTPException(
            status_code=401,
            detail="Invalid API key"
        )

    # Get current production model
    production_models = db.collection('model_versions').where(
        filter=firestore.FieldFilter('is_production', '==', True)
    ).get()

    current_model = None
    model_url = None

    if production_models:
        model_data = production_models[0].to_dict()
        current_model = model_data.get('version')
        model_url = generate_presigned_url(
            model_data.get('s3_key', ''),
            expiry=3600
        )

    # Update agent status to online
    db.collection('organisations').document(org['org_id']).update({
        'agent_status': 'online',
        'agent_ip': request.client.host,
        'last_seen': firestore.SERVER_TIMESTAMP
    })

    try:
        NotificationService.create_agent_online_alert(
            org_id=org['org_id'],
            agent_id=org['org_id'],
            agent_name=org['name']
        )
    except Exception:
        pass

    log_action(
        admin_id='agent',
        admin_email=org['org_code'],
        admin_role='agent',
        action_type='AGENT_AUTHENTICATED',
        action_detail=f"Agent authenticated for {org['name']} ({org['org_code']})",
        ip_address=request.client.host,
        target_org_id=org['org_id'],
        target_org_code=org['org_code'],
        status='success'
    )

    return {
        "status": "success",
        "data": {
            "org_id": org['org_id'],
            "org_code": org['org_code'],
            "org_name": org['name'],
            "current_model_version": current_model,
            "model_url": model_url
        }
    }


@router.post("/heartbeat")
async def agent_heartbeat(
    payload: HeartbeatRequest,
    request: Request,
    org: dict = Depends(get_agent_org)
):
    org_fresh = db.collection('organisations')\
                  .document(org['org_id']).get().to_dict()

    previous_status = org_fresh.get('agent_status')

    db.collection('organisations').document(org['org_id']).update({
        'agent_status': payload.status,
        'model_version': payload.model_version,
        'last_seen': firestore.SERVER_TIMESTAMP,
        'flows_captured': payload.flows_captured,
        'flows_uploaded': payload.flows_uploaded
    })

    # If agent was offline and is now reporting online, fire reconnect notification
    if previous_status == 'offline' and payload.status == 'online':
        try:
            NotificationService.create_agent_online_alert(
                org_id=org['org_id'],
                agent_id=org['org_id'],
                agent_name=org['name']
            )
        except Exception:
            pass

    org_fresh = db.collection('organisations')\
                  .document(org['org_id']).get().to_dict()

    pending_version = org_fresh.get('pending_model_version')
    pending_url = org_fresh.get('pending_model_url')

    response_data = {
        "status": "acknowledged",
        "has_update": False
    }

    if pending_version and pending_version != payload.model_version:
        response_data['has_update'] = True
        response_data['pending_version'] = pending_version
        response_data['model_url'] = pending_url

    return {
        "status": "success",
        "data": response_data
    }


@router.post("/logs/upload")
async def upload_logs(
    request: Request,
    file: UploadFile = File(...),
    org: dict = Depends(get_agent_org)
):
    org_id = org['org_id']
    org_code = org['org_code']

    if not file.filename.endswith('.csv'):
        raise HTTPException(
            status_code=400,
            detail="Only CSV files are accepted"
        )

    with tempfile.NamedTemporaryFile(
        delete=False,
        suffix='.csv'
    ) as tmp_file:
        content = await file.read()
        tmp_file.write(content)
        tmp_path = tmp_file.name

    try:
        date_str = datetime.utcnow().strftime('%Y-%m-%d')
        timestamp = datetime.utcnow().strftime('%H%M%S')
        s3_key = f"logs/{org_id}/{date_str}/{timestamp}_{file.filename}"

        result = upload_file(tmp_path, s3_key)

        if result['status'] != 'success':
            raise HTTPException(
                status_code=500,
                detail="Failed to upload logs to storage"
            )

        db.collection('organisations').document(org_id).update({
            'last_sync': firestore.SERVER_TIMESTAMP
        })

        return {
            "status": "success",
            "message": "Logs uploaded successfully",
            "data": {
                "s3_key": s3_key,
                "org_id": org_id,
                "org_code": org_code
            }
        }

    finally:
        os.unlink(tmp_path)


@router.get("/model/download-url")
async def get_model_download_url(
    version: str,
    request: Request,
    org: dict = Depends(get_agent_org)
):
    model_doc = db.collection('model_versions').document(version).get()

    if not model_doc.exists:
        raise HTTPException(
            status_code=404,
            detail=f"Model version {version} not found"
        )

    model_data = model_doc.to_dict()
    s3_key = model_data.get('s3_key')

    if not s3_key:
        raise HTTPException(
            status_code=404,
            detail="Model file not found in storage"
        )

    url = generate_presigned_url(s3_key, expiry=3600)

    if not url:
        raise HTTPException(
            status_code=500,
            detail="Failed to generate download URL"
        )

    return {
        "status": "success",
        "data": {
            "url": url,
            "version": version,
            "checksum": model_data.get('checksum', ''),
            "expires_in": 3600
        }
    }


@router.post("/update/confirm")
async def confirm_model_update(
    payload: UpdateConfirmRequest,
    request: Request,
    org: dict = Depends(get_agent_org)
):
    org_id = org['org_id']

    if payload.status == 'success':
        db.collection('organisations').document(org_id).update({
            'model_version': payload.version,
            'update_status': 'success',
            'last_updated': firestore.SERVER_TIMESTAMP,
            'pending_model_version': firestore.DELETE_FIELD,
            'pending_model_url': firestore.DELETE_FIELD
        })

        log_action(
            admin_id='agent',
            admin_email=org['org_code'],
            admin_role='agent',
            action_type='AGENT_MODEL_UPDATED',
            action_detail=f"Agent updated to model {payload.version}",
            ip_address=request.client.host,
            target_org_id=org_id,
            target_org_code=org['org_code'],
            status='success'
        )

    else:
        db.collection('organisations').document(org_id).update({
            'update_status': payload.status,
            'last_updated': firestore.SERVER_TIMESTAMP
        })

        log_action(
            admin_id='agent',
            admin_email=org['org_code'],
            admin_role='agent',
            action_type='AGENT_MODEL_UPDATE_FAILED',
            action_detail=f"Agent model update failed — {payload.status}",
            ip_address=request.client.host,
            target_org_id=org_id,
            target_org_code=org['org_code'],
            status='failed'
        )

    return {
        "status": "success",
        "message": f"Update status recorded: {payload.status}"
    }


@router.get("/status/{org_id}")
async def get_agent_status(
    org_id: str,
    org: dict = Depends(get_agent_org)
):
    org_doc = db.collection('organisations').document(org_id).get()

    if not org_doc.exists:
        raise HTTPException(
            status_code=404,
            detail="Organisation not found"
        )

    data = org_doc.to_dict()

    return {
        "status": "success",
        "data": {
            "agent_status": data.get('agent_status'),
            "model_version": data.get('model_version'),
            "last_seen": data.get('last_seen'),
            "last_sync": data.get('last_sync'),
            "pending_model_version": data.get('pending_model_version'),
            "update_status": data.get('update_status')
        }
    }

@router.get("/download/info")
async def get_agent_download_info(
    org: dict = Depends(get_agent_org)
):
    """
    Returns download instructions and links
    for the IDS agent
    """
    return {
        "status": "success",
        "data": {
            "org_name": org['name'],
            "org_code": org['org_code'],
            "platforms": {
                "linux": {
                    "filename": "intellisense-ids-agent",
                    "instructions": [
                        "Download the agent file",
                        "Open terminal in download location",
                        "Run: chmod +x intellisense-ids-agent",
                        "Run: ./intellisense-ids-agent --setup",
                        "Enter your API key when prompted",
                        "Select your network interface",
                        "Agent will start automatically"
                    ]
                },
                "windows": {
                    "filename": "intellisense-ids-agent.exe",
                    "instructions": [
                        "Download the agent file",
                        "Double click intellisense-ids-agent.exe",
                        "Enter your API key when prompted",
                        "Select your network interface",
                        "Click Start",
                        "Agent will run in background"
                    ]
                }
            }
        }
    }
