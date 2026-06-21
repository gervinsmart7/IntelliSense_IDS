from firebase_admin import firestore
from services.firebase import get_db
import uuid

db = get_db()

def log_action(
    admin_id: str,
    admin_email: str,
    admin_role: str,
    action_type: str,
    action_detail: str,
    ip_address: str = None,
    target_org_id: str = None,
    target_org_code: str = None,
    status: str = 'success'
):
    try:
        log_entry = {
            'log_id': str(uuid.uuid4()),
            'admin_id': admin_id,
            'admin_email': admin_email,
            'admin_role': admin_role,
            'action_type': action_type,
            'action_detail': action_detail,
            'target_org_id': target_org_id,
            'target_org_code': target_org_code,
            'ip_address': ip_address,
            'status': status,
            'timestamp': firestore.SERVER_TIMESTAMP
        }

        db.collection('audit_logs').add(log_entry)

    except Exception as e:
        print(f"Audit log error: {e}")
