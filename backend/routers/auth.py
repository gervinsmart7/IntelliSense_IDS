from fastapi import APIRouter, HTTPException, Request, Depends
from firebase_admin import firestore
from services.firebase import get_db
from services.auth import (
    verify_password,
    generate_token,
    decode_token,
    get_current_admin,
    hash_password
)
from services.audit import log_action
from services.notifications import NotificationService
from services.email import send_password_reset_email
from pydantic import BaseModel
import os
import secrets
from datetime import datetime, timedelta

router = APIRouter(prefix="/api/auth", tags=["Authentication"])


def get_firestore_db():
    return get_db()

# ─────────────────────────────────────────
# REQUEST MODELS
# ─────────────────────────────────────────

class LoginRequest(BaseModel):
    email: str
    password: str

class ForgotPasswordRequest(BaseModel):
    email: str

class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str

class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str

# ─────────────────────────────────────────
# ENDPOINTS
# ─────────────────────────────────────────

@router.post("/forgot-password")
async def forgot_password(payload: ForgotPasswordRequest, request: Request):
    try:
        db = get_firestore_db()
    except Exception as exc:
        raise HTTPException(status_code=503, detail="Authentication service is temporarily unavailable") from exc

    email = payload.email.lower().strip()

    admins = db.collection('admins').where(
        filter=firestore.FieldFilter('email', '==', email)
    ).get()

    if admins:
        admin = admins[0].to_dict()
        if admin.get('is_active'):
            token = secrets.token_urlsafe(32)
            db.collection('password_reset_tokens').document(token).set({
                'admin_id': admin['admin_id'],
                'email': email,
                'created_at': datetime.utcnow(),
                'expires_at': datetime.utcnow() + timedelta(hours=1)
            })
            send_password_reset_email(email=email, reset_token=token)

    return {
        "status": "success",
        "message": "If an account exists, password reset instructions have been sent."
    }


@router.post("/reset-password")
async def reset_password(payload: ResetPasswordRequest):
    try:
        db = get_firestore_db()
    except Exception as exc:
        raise HTTPException(status_code=503, detail="Authentication service is temporarily unavailable") from exc

    token_doc = db.collection('password_reset_tokens').document(payload.token).get()

    if not token_doc.exists:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")

    token_data = token_doc.to_dict()
    expires_at = token_data.get('expires_at')

    if expires_at and expires_at < datetime.utcnow():
        db.collection('password_reset_tokens').document(payload.token).delete()
        raise HTTPException(status_code=400, detail="Reset token has expired")

    admin_id = token_data.get('admin_id')
    if not admin_id:
        raise HTTPException(status_code=400, detail="Invalid reset token")

    db.collection('admins').document(admin_id).update({
        'password_hash': hash_password(payload.new_password)
    })
    db.collection('password_reset_tokens').document(payload.token).delete()

    return {
        "status": "success",
        "message": "Password updated successfully"
    }


@router.post("/login")
async def login(payload: LoginRequest, request: Request):
    try:
        db = get_firestore_db()
    except Exception as exc:
        raise HTTPException(status_code=503, detail="Authentication service is temporarily unavailable") from exc

    email = payload.email.lower().strip()
    password = payload.password
    ip_address = request.client.host if request.client else 'unknown'

    # Find admin by email
    admins = db.collection('admins').where(
        filter=firestore.FieldFilter('email', '==', email)
    ).get()

    if not admins:
        # Log failed attempt
        log_action(
            admin_id='unknown',
            admin_email=email,
            admin_role='unknown',
            action_type='LOGIN_FAILED',
            action_detail=f"Login attempt with unknown email: {email}",
            ip_address=ip_address,
            status='failed'
        )
        raise HTTPException(
            status_code=401,
            detail="Invalid email or password"
        )

    admin = admins[0].to_dict()

    # Check if account is locked
    if admin.get('is_locked'):
        log_action(
            admin_id=admin['admin_id'],
            admin_email=email,
            admin_role=admin['role'],
            action_type='LOGIN_BLOCKED',
            action_detail=f"Login attempt on locked account from {ip_address}",
            ip_address=ip_address,
            status='denied'
        )
        raise HTTPException(
            status_code=403,
            detail="Account is locked — contact your administrator"
        )

    # Check if account is active
    if not admin.get('is_active'):
        raise HTTPException(
            status_code=403,
            detail="Account is not active — verify your email first"
        )

    # Verify password
    if not verify_password(password, admin['password_hash']):
        # Increment failed attempts
        failed_attempts = admin.get('failed_attempts', 0) + 1

        update_data = {'failed_attempts': failed_attempts}

        # Lock account after 5 failed attempts
        if failed_attempts >= 5:
            update_data['is_locked'] = True
            lock_message = f"Account locked after {failed_attempts} failed attempts"
        else:
            remaining = 5 - failed_attempts
            lock_message = f"Invalid password — {remaining} attempts remaining"

        db.collection('admins').document(admin['admin_id']).update(update_data)

        log_action(
            admin_id=admin['admin_id'],
            admin_email=email,
            admin_role=admin['role'],
            action_type='LOGIN_FAILED',
            action_detail=f"Wrong password from {ip_address} — attempt {failed_attempts}",
            ip_address=ip_address,
            status='failed'
        )

        if failed_attempts >= 3:
            try:
                NotificationService.create_failed_login_alert(
                    email=email,
                    failed_attempts=failed_attempts,
                    org_id=admin.get('org_id')
                )
            except Exception:
                pass

        raise HTTPException(status_code=401, detail=lock_message)

    # Reset failed attempts on successful login
    db.collection('admins').document(admin['admin_id']).update({
        'failed_attempts': 0,
        'last_login': firestore.SERVER_TIMESTAMP
    })

    # Check for new IP address
    known_ips = admin.get('known_ips', [])
    if ip_address not in known_ips:
        known_ips.append(ip_address)
        db.collection('admins').document(admin['admin_id']).update({
            'known_ips': known_ips
        })

    # Generate JWT token
    token = generate_token({
        'admin_id': admin['admin_id'],
        'email': admin['email'],
        'role': admin['role'],
        'org_id': admin.get('org_id'),
        'org_code': admin.get('org_code'),
        'full_name': admin['full_name']
    })

    # Determine redirect route based on role
    role_routes = {
        'super_admin': '/dashboard/super',
        'platform_admin': '/dashboard/platform',
        'org_admin': '/dashboard/organisation'
    }

    # Log successful login
    log_action(
        admin_id=admin['admin_id'],
        admin_email=email,
        admin_role=admin['role'],
        action_type='LOGIN_SUCCESS',
        action_detail=f"Successful login from {ip_address}",
        ip_address=ip_address,
        status='success'
    )

    return {
        "status": "success",
        "data": {
            "token": token,
            "role": admin['role'],
            "full_name": admin['full_name'],
            "email": admin['email'],
            "org_id": admin.get('org_id'),
            "org_code": admin.get('org_code'),
            "redirect_to": role_routes.get(admin['role'], '/login')
        }
    }


@router.post("/logout")
async def logout(
    request: Request,
    current_admin: dict = Depends(get_current_admin)
):
    log_action(
        admin_id=current_admin['admin_id'],
        admin_email=current_admin['email'],
        admin_role=current_admin['role'],
        action_type='LOGOUT',
        action_detail="Admin logged out",
        ip_address=request.client.host,
        status='success'
    )

    return {
        "status": "success",
        "message": "Logged out successfully"
    }


@router.get("/me")
async def get_me(current_admin: dict = Depends(get_current_admin)):
    return {
        "status": "success",
        "data": {
            "admin_id": current_admin['admin_id'],
            "email": current_admin['email'],
            "role": current_admin['role'],
            "full_name": current_admin['full_name'],
            "org_id": current_admin.get('org_id'),
            "org_code": current_admin.get('org_code')
        }
    }


@router.post("/change-password")
async def change_password(
    payload: ChangePasswordRequest,
    request: Request,
    current_admin: dict = Depends(get_current_admin)
):
    import bcrypt

    try:
        db = get_firestore_db()
    except Exception as exc:
        raise HTTPException(status_code=503, detail="Authentication service is temporarily unavailable") from exc

    # Get fresh admin data from Firestore
    admin_doc = db.collection('admins')\
                  .document(current_admin['admin_id']).get()
    admin = admin_doc.to_dict()

    # Verify current password
    if not verify_password(payload.current_password, admin['password_hash']):
        raise HTTPException(
            status_code=401,
            detail="Current password is incorrect"
        )

    # Hash new password
    salt = bcrypt.gensalt()
    new_hash = bcrypt.hashpw(
        payload.new_password.encode('utf-8'), salt
    ).decode('utf-8')

    # Update password
    db.collection('admins').document(current_admin['admin_id']).update({
        'password_hash': new_hash
    })

    log_action(
        admin_id=current_admin['admin_id'],
        admin_email=current_admin['email'],
        admin_role=current_admin['role'],
        action_type='PASSWORD_CHANGED',
        action_detail="Password changed successfully",
        ip_address=request.client.host,
        status='success'
    )

    return {
        "status": "success",
        "message": "Password changed successfully"
    }
