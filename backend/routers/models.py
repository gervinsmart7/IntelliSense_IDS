from fastapi import APIRouter, HTTPException, Request, Depends
from firebase_admin import firestore
from services.firebase import get_db
from services.auth import get_current_admin, require_permission
from services.audit import log_action
from pydantic import BaseModel
from typing import Optional

router = APIRouter(prefix="/api/model", tags=["Model Management"])
db = get_db()

class RetrainRequest(BaseModel):
    reason: Optional[str] = "Manual trigger"

class PushModelRequest(BaseModel):
    version: str

@router.get("/versions")
async def get_model_versions(
    current_admin: dict = Depends(
        require_permission('trigger_retrain')
    )
):
    versions = db.collection('model_versions')\
                 .order_by(
                     'created_at',
                     direction=firestore.Query.DESCENDING
                 ).get()

    result = [v.to_dict() for v in versions]

    return {
        "status": "success",
        "data": result,
        "total": len(result)
    }

@router.get("/production")
async def get_production_model(
    current_admin: dict = Depends(get_current_admin)
):
    models = db.collection('model_versions').where(
        filter=firestore.FieldFilter('is_production', '==', True)
    ).get()

    if not models:
        return {
            "status": "success",
            "data": None,
            "message": "No production model yet"
        }

    return {
        "status": "success",
        "data": models[0].to_dict()
    }

@router.post("/retrain")
async def trigger_retrain(
    payload: RetrainRequest,
    request: Request,
    current_admin: dict = Depends(
        require_permission('trigger_retrain')
    )
):
    import threading

    def run_retrain():
        from ml.retrain import run_retraining_pipeline
        run_retraining_pipeline(
            triggered_by='manual',
            admin_id=current_admin['admin_id']
        )

    thread = threading.Thread(target=run_retrain, daemon=True)
    thread.start()

    log_action(
        admin_id=current_admin['admin_id'],
        admin_email=current_admin['email'],
        admin_role=current_admin['role'],
        action_type='MODEL_RETRAIN_TRIGGERED',
        action_detail=f"Manual retrain triggered: {payload.reason}",
        ip_address=request.client.host,
        status='success'
    )

    return {
        "status": "success",
        "message": "Retraining started in background"
    }

@router.post("/push/{version}")
async def push_model(
    version: str,
    request: Request,
    current_admin: dict = Depends(
        require_permission('approve_model')
    )
):
    from ml.retrain import push_model_to_all_agents

    model_doc = db.collection('model_versions')\
                  .document(version).get()

    if not model_doc.exists:
        raise HTTPException(
            status_code=404,
            detail=f"Model version {version} not found"
        )

    model_data = model_doc.to_dict()
    push_model_to_all_agents(version, model_data)

    log_action(
        admin_id=current_admin['admin_id'],
        admin_email=current_admin['email'],
        admin_role=current_admin['role'],
        action_type='MODEL_PUSHED',
        action_detail=f"Model {version} pushed to all agents",
        ip_address=request.client.host,
        status='success'
    )

    return {
        "status": "success",
        "message": f"Model {version} pushed to all agents"
    }

@router.post("/rollback/{version}")
async def rollback_model(
    version: str,
    request: Request,
    current_admin: dict = Depends(
        require_permission('rollback_model')
    )
):
    model_doc = db.collection('model_versions')\
                  .document(version).get()

    if not model_doc.exists:
        raise HTTPException(
            status_code=404,
            detail=f"Model version {version} not found"
        )

    # Mark current production as not production
    current = db.collection('model_versions').where(
        filter=firestore.FieldFilter('is_production', '==', True)
    ).get()

    for doc in current:
        doc.reference.update({'is_production': False})

    # Set selected version as production
    db.collection('model_versions')\
      .document(version)\
      .update({'is_production': True})

    # Push to all agents
    model_data = model_doc.to_dict()
    from ml.retrain import push_model_to_all_agents
    push_model_to_all_agents(version, model_data)

    log_action(
        admin_id=current_admin['admin_id'],
        admin_email=current_admin['email'],
        admin_role=current_admin['role'],
        action_type='MODEL_ROLLED_BACK',
        action_detail=f"Model rolled back to {version}",
        ip_address=request.client.host,
        status='success'
    )

    return {
        "status": "success",
        "message": f"Rolled back to model {version}"
    }

@router.get("/retrain/jobs")
async def get_retrain_jobs(
    current_admin: dict = Depends(
        require_permission('trigger_retrain')
    )
):
    jobs = db.collection('retrain_jobs')\
             .order_by(
                 'started_at',
                 direction=firestore.Query.DESCENDING
             ).limit(20).get()

    return {
        "status": "success",
        "data": [j.to_dict() for j in jobs]
    }
