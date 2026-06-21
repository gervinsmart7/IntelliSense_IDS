from fastapi import HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
import bcrypt
from datetime import datetime, timedelta
from services.firebase import get_db
import os
from dotenv import load_dotenv

load_dotenv()

db = get_db()

# JWT Settings
JWT_SECRET = os.getenv('JWT_SECRET', 'your-secret-key')
JWT_ALGORITHM = os.getenv('JWT_ALGORITHM', 'HS256')
JWT_EXPIRY_HOURS = int(os.getenv('JWT_EXPIRY_HOURS', 8))

# HTTP Bearer scheme
security = HTTPBearer()

# ─────────────────────────────────────────
# PASSWORD FUNCTIONS
# ─────────────────────────────────────────

def hash_password(password: str) -> str:
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password.encode('utf-8'), salt)
    return hashed.decode('utf-8')

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(
        plain_password.encode('utf-8'),
        hashed_password.encode('utf-8')
    )

# ─────────────────────────────────────────
# JWT TOKEN FUNCTIONS
# ─────────────────────────────────────────

def generate_token(data: dict) -> str:
    payload = data.copy()
    expire = datetime.utcnow() + timedelta(hours=JWT_EXPIRY_HOURS)
    payload.update({"exp": expire})
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def decode_token(token: str) -> dict:
    try:
        payload = jwt.decode(
            token,
            JWT_SECRET,
            algorithms=[JWT_ALGORITHM]
        )
        return payload
    except JWTError:
        return None

# ─────────────────────────────────────────
# GET CURRENT ADMIN DEPENDENCY
# ─────────────────────────────────────────

async def get_current_admin(
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    token = credentials.credentials
    payload = decode_token(token)

    if not payload:
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired token"
        )

    # Verify admin still exists and is active
    admin_doc = db.collection('admins')\
                  .document(payload['admin_id']).get()

    if not admin_doc.exists:
        raise HTTPException(
            status_code=401,
            detail="Admin account not found"
        )

    admin = admin_doc.to_dict()

    if not admin.get('is_active'):
        raise HTTPException(
            status_code=403,
            detail="Account is not active"
        )

    if admin.get('is_locked'):
        raise HTTPException(
            status_code=403,
            detail="Account is locked"
        )

    return payload

# ─────────────────────────────────────────
# ROLE PERMISSION CHECKER
# ─────────────────────────────────────────

ROLE_PERMISSIONS = {
    'super_admin': [
        'view_all_orgs', 'edit_org', 'suspend_org', 'delete_org',
        'view_all_logs', 'export_logs', 'delete_logs',
        'trigger_retrain', 'approve_model', 'force_push_model',
        'rollback_model', 'change_schedule',
        'create_platform_admin', 'create_org_admin',
        'edit_admin', 'delete_admin', 'change_role',
        'view_all_audit_logs', 'export_audit_logs',
        'system_config', 'view_all_alerts', 'system_health', 'edit_audit_logs'
    ],
    'platform_admin': [
        'view_all_orgs', 'edit_org', 'approve_org',
        'suspend_org', 'delete_org',
        'view_all_logs', 'export_logs',
        'trigger_retrain', 'approve_model',
        'create_org_admin', 'delete_admin',
        'view_all_alerts', 'view_all_audit_logs', 'system_health',
        'system_health', 'change_alert_thresholds'
    ],
    'org_admin': [
        'view_own_org', 'edit_own_org',
        'view_own_logs', 'export_own_logs',
        'view_own_alerts', 'dismiss_own_alerts',
        'view_own_agent_status',
        'regenerate_own_api_key',
        'view_own_audit_logs'
    ]
}

def has_permission(role: str, permission: str) -> bool:
    return permission in ROLE_PERMISSIONS.get(role, [])

def require_permission(permission: str):
    async def permission_checker(
        current_admin: dict = Depends(get_current_admin)
    ):
        if not has_permission(current_admin['role'], permission):
            raise HTTPException(
                status_code=403,
                detail="You do not have permission to perform this action"
            )
        return current_admin
    return permission_checker
