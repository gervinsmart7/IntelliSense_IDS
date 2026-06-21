from fastapi import APIRouter, Depends, HTTPException
from firebase_admin import firestore
from services.firebase import get_db
from services.auth import get_current_admin, require_permission

router = APIRouter(prefix="/api/audit-logs", tags=["Audit Logs"])
db = get_db()

@router.get("/my-activity")
async def get_my_activity(
    current_admin: dict = Depends(get_current_admin)
):
    """
    Returns audit logs
    Super Admin and Platform Admin see all logs
    Others see only their own
    """
    try:
        if current_admin['role'] in ['super_admin', 'platform_admin']:
            logs = db.collection('audit_logs')\
                     .order_by('timestamp',
                               direction=firestore.Query.DESCENDING)\
                     .limit(500)\
                     .get()
        else:
            logs = db.collection('audit_logs')\
                     .where(
                         filter=firestore.FieldFilter(
                             'admin_id', '==',
                             current_admin['admin_id']
                         )
                     )\
                     .order_by('timestamp',
                               direction=firestore.Query.DESCENDING)\
                     .limit(200)\
                     .get()

        result = []
        for log in logs:
            data = log.to_dict()
            data['id'] = log.id
            result.append(data)

        return {"status": "success", "data": result}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/export")
async def export_audit_logs(
    current_admin: dict = Depends(
        require_permission('export_audit_logs')
    )
):
    """
    Exports all audit logs
    Super Admin only
    """
    try:
        logs = db.collection('audit_logs')\
                 .order_by('timestamp',
                           direction=firestore.Query.DESCENDING)\
                 .get()

        result = [log.to_dict() for log in logs]
        return {"status": "success", "data": result}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
