from fastapi import APIRouter, HTTPException, Request, Depends
from firebase_admin import firestore
from services.firebase import get_db
from services.auth import get_current_admin, require_permission
from services.audit import log_action
from services.notifications import NotificationService
from pydantic import BaseModel
from typing import Optional
import uuid
import secrets
import hashlib
import bcrypt

router = APIRouter(prefix="/api/organisations", tags=["Organisations"])
db = get_db()

# ─────────────────────────────────────────
# REQUEST MODELS
# ─────────────────────────────────────────

class RegisterOrganisationRequest(BaseModel):
    name: str
    type: str
    country: str
    city: str
    domain: str
    phone: str
    admin_name: str
    admin_email: str
    password: str

class UpdateOrganisationRequest(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    country: Optional[str] = None
    city: Optional[str] = None
    domain: Optional[str] = None

# ─────────────────────────────────────────
# HELPER FUNCTIONS
# ─────────────────────────────────────────

def generate_org_code(name: str) -> str:
    """
    Generates a unique human readable org code
    e.g. GCB Bank -> GCB-AF3C
    """
    prefix = name[:3].upper().replace(" ", "")
    suffix = secrets.token_hex(2).upper()
    return f"{prefix}-{suffix}"

def generate_api_key() -> tuple:
    """
    Generates a raw API key and its hash
    Returns (raw_key, hashed_key)
    """
    raw_key = f"ids_sk_{secrets.token_urlsafe(32)}"
    hashed_key = hashlib.sha256(raw_key.encode()).hexdigest()
    return raw_key, hashed_key

def hash_password(password: str) -> str:
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password.encode('utf-8'), salt)
    return hashed.decode('utf-8')

# ─────────────────────────────────────────
# ENDPOINTS
# ─────────────────────────────────────────

@router.post("/register")
async def register_organisation(
    payload: RegisterOrganisationRequest,
    request: Request
):
    # Check if email already exists
    existing_admin = db.collection('admins').where(
        filter=firestore.FieldFilter(
            'email', '==', payload.admin_email.lower()
        )
    ).get()

    if existing_admin:
        raise HTTPException(
            status_code=400,
            detail="An account with this email already exists"
        )

    # Check if domain already registered
    existing_org = db.collection('organisations').where(
        filter=firestore.FieldFilter(
            'domain', '==', payload.domain.lower()
        )
    ).get()

    if existing_org:
        raise HTTPException(
            status_code=400,
            detail="An organisation with this domain already exists"
        )

    # Generate unique identifiers
    org_id = str(uuid.uuid4())
    admin_id = str(uuid.uuid4())
    org_code = generate_org_code(payload.name)
    raw_api_key, hashed_api_key = generate_api_key()

    # Create organisation record
    organisation = {
        'org_id': org_id,
        'org_code': org_code,
        'name': payload.name,
        'type': payload.type,
        'country': payload.country,
        'city': payload.city,
        'domain': payload.domain.lower(),
        'phone': payload.phone,
        'api_key_hash': hashed_api_key,
        'raw_api_key_temp': raw_api_key,
        'status': 'pending_verification',
        'agent_status': 'not_installed',
        'model_version': None,
        'pending_model_version': None,
        'last_sync': None,
        'created_at': firestore.SERVER_TIMESTAMP
    }

    # Create org admin account
    admin_account = {
        'admin_id': admin_id,
        'full_name': payload.admin_name,
        'email': payload.admin_email.lower(),
        'password_hash': hash_password(payload.password),
        'role': 'org_admin',
        'org_id': org_id,
        'org_code': org_code,
        'is_active': False,
        'is_locked': False,
        'failed_attempts': 0,
        'known_ips': [],
        'created_by': 'system',
        'created_at': firestore.SERVER_TIMESTAMP,
        'last_login': None
    }

    # Save to Firestore
    db.collection('organisations').document(org_id).set(organisation)
    db.collection('admins').document(admin_id).set(admin_account)

    # Generate verification token
    verification_token = secrets.token_urlsafe(32)
    db.collection('verification_tokens').document(
        verification_token
    ).set({
        'org_id': org_id,
        'admin_id': admin_id,
        'email': payload.admin_email.lower(),
        'raw_api_key': raw_api_key,
        'created_at': firestore.SERVER_TIMESTAMP
    })

    # Send verification email
    from services.email import send_verification_email
    send_verification_email(
        email=payload.admin_email,
        org_name=payload.name,
        org_code=org_code,
        verification_token=verification_token
    )

    log_action(
        admin_id='system',
        admin_email='system',
        admin_role='system',
        action_type='ORGANISATION_REGISTERED',
        action_detail='New organisation: ' + payload.name + ' (' + org_code + ')',
        ip_address=request.client.host,
        target_org_id=org_id,
        target_org_code=org_code,
        status='success'
    )

    try:
        NotificationService.create_new_org_registration_alert(
            org_name=payload.name,
            org_email=payload.admin_email,
            contact_person=payload.admin_name
        )
    except Exception:
        pass

    return {
        "status": "success",
        "message": "Registration successful. Check your email to verify your account.",
        "data": {
            "org_id": org_id,
            "org_code": org_code,
            "admin_email": payload.admin_email
        }
    }


@router.post("/verify-email/{token}")
async def verify_email(token: str, request: Request):
    token_doc = db.collection('verification_tokens').document(token).get()

    if not token_doc.exists:
        raise HTTPException(
            status_code=400,
            detail="Invalid verification token"
        )

    token_data = token_doc.to_dict()

    # Activate organisation
    db.collection('organisations').document(
        token_data['org_id']
    ).update({'status': 'active'})

    # Activate admin
    db.collection('admins').document(
        token_data['admin_id']
    ).update({'is_active': True})

    # Delete token
    db.collection('verification_tokens').document(token).delete()

    # Send welcome email with API key
    raw_api_key = token_data.get('raw_api_key', '')
    org = db.collection('organisations').document(
        token_data['org_id']
    ).get().to_dict()

    from services.email import send_welcome_email
    send_welcome_email(
        email=token_data['email'],
        org_name=org.get('name', ''),
        org_code=org.get('org_code', ''),
        api_key=raw_api_key
    )

    return {
        "status": "success",
        "message": "Email verified. Check your email for your API key."
    }

@router.get("")
async def get_all_organisations(
    current_admin: dict = Depends(require_permission('view_all_orgs'))
):
    """
    Returns all organisations
    Super Admin and Platform Admin only
    """
    orgs = db.collection('organisations').get()

    result = []
    for org in orgs:
        data = org.to_dict()
        # Remove sensitive fields
        data.pop('api_key_hash', None)
        result.append(data)

    return {
        "status": "success",
        "data": result,
        "total": len(result)
    }


@router.get("/{org_id}")
async def get_organisation(
    org_id: str,
    current_admin: dict = Depends(get_current_admin)
):
    """
    Returns a single organisation
    Org Admin can only view their own
    """
    # Org admin can only view their own org
    if current_admin['role'] == 'org_admin':
        if current_admin['org_id'] != org_id:
            raise HTTPException(
                status_code=403,
                detail="You can only view your own organisation"
            )

    org_doc = db.collection('organisations').document(org_id).get()

    if not org_doc.exists:
        raise HTTPException(
            status_code=404,
            detail="Organisation not found"
        )

    data = org_doc.to_dict()
    data.pop('api_key_hash', None)

    return {
        "status": "success",
        "data": data
    }


@router.put("/{org_id}")
async def update_organisation(
    org_id: str,
    payload: UpdateOrganisationRequest,
    request: Request,
    current_admin: dict = Depends(get_current_admin)
):
    """
    Updates organisation details
    """
    # Org admin can only update their own org
    if current_admin['role'] == 'org_admin':
        if current_admin['org_id'] != org_id:
            raise HTTPException(
                status_code=403,
                detail="You can only update your own organisation"
            )

    org_doc = db.collection('organisations').document(org_id).get()

    if not org_doc.exists:
        raise HTTPException(
            status_code=404,
            detail="Organisation not found"
        )

    # Only update provided fields
    update_data = {k: v for k, v in payload.dict().items() if v is not None}

    db.collection('organisations').document(org_id).update(update_data)

    log_action(
        admin_id=current_admin['admin_id'],
        admin_email=current_admin['email'],
        admin_role=current_admin['role'],
        action_type='ORGANISATION_UPDATED',
        action_detail=f"Organisation {org_id} updated",
        ip_address=request.client.host,
        target_org_id=org_id,
        status='success'
    )

    return {
        "status": "success",
        "message": "Organisation updated successfully"
    }


@router.post("/{org_id}/suspend")
async def suspend_organisation(
    org_id: str,
    request: Request,
    current_admin: dict = Depends(require_permission('suspend_org'))
):
    org_doc = db.collection('organisations').document(org_id).get()

    if not org_doc.exists:
        raise HTTPException(
            status_code=404,
            detail="Organisation not found"
        )

    org_data = org_doc.to_dict()

    # Save current status before suspending
    # so we can restore it when reinstating
    db.collection('organisations').document(org_id).update({
        'status': 'suspended',
        'status_before_suspension': org_data.get('status', 'active')
    })

    log_action(
        admin_id=current_admin['admin_id'],
        admin_email=current_admin['email'],
        admin_role=current_admin['role'],
        action_type='ORGANISATION_SUSPENDED',
        action_detail=f"Organisation {org_id} suspended",
        ip_address=request.client.host,
        target_org_id=org_id,
        status='success'
    )

    return {
        "status": "success",
        "message": "Organisation suspended successfully"
    }


@router.post("/{org_id}/reinstate")
async def reinstate_organisation(
    org_id: str,
    request: Request,
    current_admin: dict = Depends(require_permission('suspend_org'))
):
    org_doc = db.collection('organisations').document(org_id).get()

    if not org_doc.exists:
        raise HTTPException(
            status_code=404,
            detail="Organisation not found"
        )

    org_data = org_doc.to_dict()

    # Restore the status that existed before suspension
    # not just blindly setting to active
    previous_status = org_data.get(
        'status_before_suspension',
        'pending_verification'
    )

    db.collection('organisations').document(org_id).update({
        'status': previous_status,
        'status_before_suspension': firestore.DELETE_FIELD
    })

    log_action(
        admin_id=current_admin['admin_id'],
        admin_email=current_admin['email'],
        admin_role=current_admin['role'],
        action_type='ORGANISATION_REINSTATED',
        action_detail=f"Organisation {org_id} reinstated to {previous_status}",
        ip_address=request.client.host,
        target_org_id=org_id,
        status='success'
    )

    return {
        "status": "success",
        "message": f"Organisation reinstated to {previous_status}"
    }

@router.delete("/{org_id}")
async def delete_organisation(
    org_id: str,
    request: Request,
    current_admin: dict = Depends(require_permission('delete_org'))
):
    """
    Deletes an organisation
    Super Admin only
    """
    org_doc = db.collection('organisations').document(org_id).get()

    if not org_doc.exists:
        raise HTTPException(
            status_code=404,
            detail="Organisation not found"
        )

    org_data = org_doc.to_dict()

    # Delete organisation
    db.collection('organisations').document(org_id).delete()

    # Delete associated admin account
    admins = db.collection('admins').where(
        filter=firestore.FieldFilter('org_id', '==', org_id)
    ).get()

    for admin in admins:
        admin.reference.delete()

    log_action(
        admin_id=current_admin['admin_id'],
        admin_email=current_admin['email'],
        admin_role=current_admin['role'],
        action_type='ORGANISATION_DELETED',
        action_detail=f"Organisation {org_data['name']} ({org_data['org_code']}) deleted",
        ip_address=request.client.host,
        target_org_id=org_id,
        target_org_code=org_data['org_code'],
        status='success'
    )

    return {
        "status": "success",
        "message": "Organisation deleted successfully"
    }


@router.post("/{org_id}/regenerate-key")
async def regenerate_api_key(
    org_id: str,
    request: Request,
    current_admin: dict = Depends(get_current_admin)
):
    """
    Regenerates the API key for an organisation
    Org Admin can regenerate their own key
    Super Admin can regenerate any key
    """
    # Org admin can only regenerate their own key
    if current_admin['role'] == 'org_admin':
        if current_admin['org_id'] != org_id:
            raise HTTPException(
                status_code=403,
                detail="You can only regenerate your own API key"
            )

    org_doc = db.collection('organisations').document(org_id).get()

    if not org_doc.exists:
        raise HTTPException(
            status_code=404,
            detail="Organisation not found"
        )

    # Generate new API key
    raw_api_key, hashed_api_key = generate_api_key()

    db.collection('organisations').document(org_id).update({
        'api_key_hash': hashed_api_key,
        'agent_status': 'key_regenerated'
    })

    log_action(
        admin_id=current_admin['admin_id'],
        admin_email=current_admin['email'],
        admin_role=current_admin['role'],
        action_type='API_KEY_REGENERATED',
        action_detail=f"API key regenerated for org {org_id}",
        ip_address=request.client.host,
        target_org_id=org_id,
        status='success'
    )

    return {
        "status": "success",
        "message": "API key regenerated successfully. Update your agent with the new key.",
        "data": {
            "api_key": raw_api_key
        }
    }
