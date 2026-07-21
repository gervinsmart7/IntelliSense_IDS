from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from fastapi import Depends, HTTPException, Header
from services.firebase import get_db
import os
import bcrypt

db = get_db()

JWT_SECRET_KEY = os.getenv('JWT_SECRET_KEY', '1014aeef41d802d87bab4eb71da95a1d5cb6d724b8def0f504ce30b564d6e2c6')
ALGORITHM = 'HS256'
ACCESS_TOKEN_EXPIRE_MINUTES = 60        # 1 hour
REFRESH_TOKEN_EXPIRE_DAYS = 7           # 7 days

# ─────────────────────────────────────────
# ROLE PERMISSIONS
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

# ─────────────────────────────────────────
# TOKEN CREATION
# ─────────────────────────────────────────

def create_access_token(data: dict) -> str:
    """
    Creates a short-lived access token (1 hour)
    Used for API authentication on every request
    """
    payload = data.copy()
    payload['exp'] = datetime.utcnow() + timedelta(
        minutes=ACCESS_TOKEN_EXPIRE_MINUTES
    )
    payload['type'] = 'access'
    return jwt.encode(payload, JWT_SECRET_KEY, algorithm=ALGORITHM)


def create_refresh_token(data: dict) -> str:
    """
    Creates a long-lived refresh token (7 days)
    Used to get a new access token without re-login
    """
    payload = data.copy()
    payload['exp'] = datetime.utcnow() + timedelta(
        days=REFRESH_TOKEN_EXPIRE_DAYS
    )
    payload['type'] = 'refresh'
    return jwt.encode(payload, JWT_SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> dict:
    """Decodes and validates a JWT token"""
    try:
        payload = jwt.decode(
            token,
            JWT_SECRET_KEY,
            algorithms=[ALGORITHM]
        )
        return payload
    except JWTError as e:
        raise HTTPException(
            status_code=401,
            detail=f"Invalid or expired token: {str(e)}"
        )

# ─────────────────────────────────────────
# PASSWORD HELPERS
# ─────────────────────────────────────────

def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(
        plain.encode('utf-8'),
        hashed.encode('utf-8')
    )

def hash_password(password: str) -> str:
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password.encode('utf-8'), salt)
    return hashed.decode('utf-8')

# ─────────────────────────────────────────
# AUTH DEPENDENCIES
# ─────────────────────────────────────────

async def get_current_admin(
    authorization: Optional[str] = Header(None)
) -> dict:
    """
    FastAPI dependency — extracts and validates
    the access token from Authorization header
    Returns the admin document
    """
    if not authorization:
        raise HTTPException(
            status_code=401,
            detail="Authorization header missing"
        )

    if not authorization.startswith('Bearer '):
        raise HTTPException(
            status_code=401,
            detail="Invalid authorization format. Use: Bearer <token>"
        )

    token = authorization[7:]

    try:
        payload = decode_token(token)
    except HTTPException:
        raise

    # Verify it is an access token not a refresh token
    if payload.get('type') != 'access':
        raise HTTPException(
            status_code=401,
            detail="Invalid token type. Access token required."
        )

    admin_id = payload.get('admin_id')
    if not admin_id:
        raise HTTPException(
            status_code=401,
            detail="Invalid token payload"
        )

    # Fetch admin from Firestore
    admin_doc = db.collection('admins').document(admin_id).get()

    if not admin_doc.exists:
        raise HTTPException(
            status_code=401,
            detail="Admin account not found"
        )

    admin_data = admin_doc.to_dict()

    if not admin_data.get('is_active', False):
        raise HTTPException(
            status_code=403,
            detail="Account is not active"
        )

    if admin_data.get('is_locked', False):
        raise HTTPException(
            status_code=403,
            detail="Account is locked"
        )

    return {
        'admin_id': admin_id,
        'email': admin_data.get('email'),
        'role': admin_data.get('role'),
        'org_id': admin_data.get('org_id'),
        'org_code': admin_data.get('org_code'),
        'full_name': admin_data.get('full_name')
    }


def require_permission(permission: str):
    """
    FastAPI dependency factory
    Checks the admin has a specific permission
    Usage: Depends(require_permission('delete_org'))
    """
    async def checker(
        current_admin: dict = Depends(get_current_admin)
    ):
        role = current_admin.get('role')
        allowed = ROLE_PERMISSIONS.get(role, [])
        if permission not in allowed:
            raise HTTPException(
                status_code=403,
                detail=f"Permission denied: {permission} required"
            )
        return current_admin
    return checker


async def get_agent_org(
    x_api_key: Optional[str] = Header(None)
) -> dict:
    """
    FastAPI dependency for agent endpoints
    Validates the agent API key
    """
    if not x_api_key:
        raise HTTPException(
            status_code=401,
            detail="X-API-Key header missing"
        )

    import hashlib
    key_hash = hashlib.sha256(x_api_key.encode()).hexdigest()

    orgs = db.collection('organisations').where(
        filter=__import__('firebase_admin').firestore.FieldFilter(
            'api_key_hash', '==', key_hash
        )
    ).get()

    if not orgs:
        raise HTTPException(
            status_code=401,
            detail="Invalid API key"
        )

    org_data = orgs[0].to_dict()

    if org_data.get('status') not in ['active']:
        raise HTTPException(
            status_code=403,
            detail="Organisation is not active"
        )

    return org_data