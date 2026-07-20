from fastapi import APIRouter, HTTPException, Request, Depends
from firebase_admin import firestore
from services.firebase import get_db
from services.auth import get_current_admin, require_permission
from services.audit import log_action
from services.notifications import NotificationService
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timedelta
import uuid
import secrets
import hashlib
import random
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

class VerifyTokenRequest(BaseModel):
    token: str
    email: str

class ResendEmailRequest(BaseModel):
    email: str

# ─────────────────────────────────────────
# HELPER FUNCTIONS
# ─────────────────────────────────────────

def generate_org_code(name: str) -> str:
    prefix = name[:3].upper().replace(" ", "")
    suffix = secrets.token_hex(2).upper()
    return f"{prefix}-{suffix}"

def generate_api_key() -> tuple:
    raw_key = f"ids_sk_{secrets.token_urlsafe(32)}"
    hashed_key = hashlib.sha256(raw_key.encode()).hexdigest()
    return raw_key, hashed_key

def hash_password(password: str) -> str:
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password.encode('utf-8'), salt)
    return hashed.decode('utf-8')

def generate_verification_token() -> str:
    """Generates a 6-digit numeric verification code"""
    return str(random.randint(100000, 999999))

# ─────────────────────────────────────────
# REGISTER
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
        'phone': payload.phone,
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

    # ─────────────────────────────────────
    # Generate 6-digit verification token
    # ─────────────────────────────────────
    verification_token = generate_verification_token()

    db.collection('verification_tokens').document(
        verification_token
    ).set({
        'org_id': org_id,
        'admin_id': admin_id,
        'email': payload.admin_email.lower(),
        'phone': payload.phone,
        'raw_api_key': raw_api_key,
        'created_at': firestore.SERVER_TIMESTAMP,
        'expires_at': (
            datetime.utcnow() + timedelta(hours=24)
        ).isoformat()
    })

    # ─────────────────────────────────────
    # Send 6-digit code via SendGrid email
    # ─────────────────────────────────────
    try:
        from services.email import send_verification_email
        result = send_verification_email(
            to_email=payload.admin_email,
            org_name=payload.name,
            token=verification_token
        )
        if result['status'] == 'success':
            print(f"Verification email sent to {payload.admin_email}")
        else:
            print(f"Email failed: {result.get('message')}")
    except Exception as email_error:
        print(f"Email error (non-fatal): {email_error}")

    # Always log token for local debugging
    print(
        f"[DEV] Verification token for "
        f"{payload.admin_email}: {verification_token}"
    )

    log_action(
        admin_id='system',
        admin_email='system',
        admin_role='system',
        action_type='ORGANISATION_REGISTERED',
        action_detail=(
            'New organisation: ' +
            payload.name + ' (' + org_code + ')'
        ),
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
        "message": (
            "Registration successful. "
            "A 6-digit verification code has been "
            "sent to your email address."
        ),
        "data": {
            "org_id": org_id,
            "org_code": org_code,
            "admin_email": payload.admin_email
        }
    }


# ─────────────────────────────────────────
# VERIFY EMAIL TOKEN
# ─────────────────────────────────────────

@router.post("/verify-sms")
async def verify_token(
    payload: VerifyTokenRequest,
    request: Request
):
    """
    Verifies organisation registration via 6-digit code
    sent to the admin's email address via SendGrid
    """
    try:
        token = payload.token.strip()

        # Look up the token document
        token_doc = db.collection('verification_tokens')\
                      .document(token).get()

        if not token_doc.exists:
            raise HTTPException(
                status_code=400,
                detail="Invalid verification code. Please check and try again."
            )

        token_data = token_doc.to_dict()

        # Verify email matches this token
        if token_data.get('email') != payload.email.lower().strip():
            raise HTTPException(
                status_code=400,
                detail="Email does not match this verification code."
            )

        # Check expiry
        expires_at = token_data.get('expires_at')
        if expires_at:
            try:
                expiry = datetime.fromisoformat(expires_at)
                if datetime.utcnow() > expiry:
                    raise HTTPException(
                        status_code=400,
                        detail=(
                            "Verification code has expired. "
                            "Please request a new one."
                        )
                    )
            except ValueError:
                pass

        org_id = token_data.get('org_id')
        admin_id = token_data.get('admin_id')
        raw_api_key = token_data.get('raw_api_key', '')

        # Get org details
        org_doc = db.collection('organisations')\
                    .document(org_id).get()
        org_data = org_doc.to_dict() if org_doc.exists else {}

        # Activate organisation
        db.collection('organisations').document(org_id).update({
            'status': 'active',
            'verified_at': firestore.SERVER_TIMESTAMP
        })

        # Activate admin account
        db.collection('admins').document(admin_id).update({
            'is_active': True,
            'email_verified': True,
            'verified_at': firestore.SERVER_TIMESTAMP
        })

        # Delete used token — cannot be reused
        db.collection('verification_tokens').document(token).delete()

        # ─────────────────────────────────
        # Send welcome email with API key
        # via SendGrid
        # ─────────────────────────────────
        try:
            from services.email import send_welcome_email
            send_welcome_email(
                to_email=token_data.get('email', ''),
                org_name=org_data.get('name', ''),
                org_code=org_data.get('org_code', ''),
                api_key=raw_api_key
            )
            print(
                f"Welcome email sent to "
                f"{token_data.get('email')}"
            )
        except Exception as email_error:
            print(f"Welcome email error (non-fatal): {email_error}")

        log_action(
            admin_id=admin_id,
            admin_email=payload.email,
            admin_role='org_admin',
            action_type='ACCOUNT_VERIFIED',
            action_detail=f"Organisation {org_id} verified via email code",
            ip_address=request.client.host,
            target_org_id=org_id,
            status='success'
        )

        return {
            "status": "success",
            "message": (
                "Account verified successfully. "
                "Your API key has been sent to your email. "
                "You can now log in."
            ),
            "data": {
                "org_id": org_id,
                "org_code": org_data.get('org_code', '')
            }
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─────────────────────────────────────────
# RESEND VERIFICATION CODE
# ─────────────────────────────────────────

@router.post("/resend-sms")
async def resend_verification(
    payload: ResendEmailRequest,
    request: Request
):
    """
    Generates a new 6-digit token and resends
    it via SendGrid email
    """
    try:
        # Find admin by email
        admins = db.collection('admins').where(
            filter=firestore.FieldFilter(
                'email', '==', payload.email.lower().strip()
            )
        ).get()

        if not admins:
            raise HTTPException(
                status_code=404,
                detail="No account found with this email"
            )

        admin_doc = admins[0]
        admin_data = admin_doc.to_dict()
        org_id = admin_data.get('org_id')

        # Get org name
        org_doc = db.collection('organisations')\
                    .document(org_id).get()
        org_data = org_doc.to_dict() if org_doc.exists else {}
        org_name = org_data.get('name', 'your organisation')

        # Delete any existing tokens for this email
        existing_tokens = db.collection('verification_tokens').where(
            filter=firestore.FieldFilter(
                'email', '==', payload.email.lower().strip()
            )
        ).get()

        for doc in existing_tokens:
            doc.reference.delete()

        # Generate fresh 6-digit token
        new_token = generate_verification_token()

        # Save new token to Firestore
        db.collection('verification_tokens').document(new_token).set({
            'org_id': org_id,
            'admin_id': admin_doc.id,
            'email': payload.email.lower().strip(),
            'phone': admin_data.get('phone', ''),
            'raw_api_key': admin_data.get('raw_api_key_temp', ''),
            'created_at': firestore.SERVER_TIMESTAMP,
            'expires_at': (
                datetime.utcnow() + timedelta(hours=24)
            ).isoformat()
        })

        # ─────────────────────────────────
        # Send new code via SendGrid email
        # ─────────────────────────────────
        try:
            from services.email import send_verification_email
            send_verification_email(
                to_email=payload.email.lower().strip(),
                org_name=org_name,
                token=new_token
            )
            print(
                f"Resent verification code to "
                f"{payload.email}"
            )
        except Exception as email_error:
            print(f"Resend email error: {email_error}")

        # Log token for debugging
        print(
            f"[DEV] Resent token for "
            f"{payload.email}: {new_token}"
        )

        return {
            "status": "success",
            "message": (
                f"New verification code sent to "
                f"{payload.email}"
            )
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─────────────────────────────────────────
# LEGACY ENDPOINT — kept for old links
# ─────────────────────────────────────────

@router.post("/verify-email/{token}")
async def verify_email_legacy(token: str, request: Request):
    return {
        "status": "info",
        "message": (
            "Please use the 6-digit code "
            "sent to your email address."
        )
    }


# ─────────────────────────────────────────
# STANDARD ENDPOINTS
# ─────────────────────────────────────────

@router.get("")
async def get_all_organisations(
    current_admin: dict = Depends(require_permission('view_all_orgs'))
):
    orgs = db.collection('organisations').get()
    result = []
    for org in orgs:
        data = org.to_dict()
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

    return {"status": "success", "data": data}


@router.put("/{org_id}")
async def update_organisation(
    org_id: str,
    payload: UpdateOrganisationRequest,
    request: Request,
    current_admin: dict = Depends(get_current_admin)
):
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

    update_data = {
        k: v for k, v in payload.dict().items()
        if v is not None
    }

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
        action_detail=(
            f"Organisation {org_id} "
            f"reinstated to {previous_status}"
        ),
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
    org_doc = db.collection('organisations').document(org_id).get()

    if not org_doc.exists:
        raise HTTPException(
            status_code=404,
            detail="Organisation not found"
        )

    org_data = org_doc.to_dict()

    db.collection('organisations').document(org_id).delete()

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
        action_detail=(
            f"Organisation {org_data['name']} "
            f"({org_data['org_code']}) deleted"
        ),
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
        "message": (
            "API key regenerated successfully. "
            "Update your agent with the new key."
        ),
        "data": {"api_key": raw_api_key}
    }
