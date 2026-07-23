from fastapi import APIRouter, HTTPException, Request, Depends
from firebase_admin import firestore
from services.firebase import get_db
from services.auth import require_permission, hash_password
from services.audit import log_action
from services.email import send_admin_invite_email
import secrets
import uuid

router = APIRouter(prefix="/api/admins", tags=["Admin Management"])
db = get_db()

@router.get("")
async def get_all_admins(
    current_admin: dict = Depends(require_permission('delete_admin'))
):
    admins = db.collection('admins').get()
    result = []
    for admin in admins:
        data = admin.to_dict()
        data.pop('password_hash', None)
        result.append(data)
    return {"status": "success", "data": result}

@router.post("/invite")
async def invite_platform_admin(
    payload: dict,
    request: Request,
    current_admin: dict = Depends(require_permission('create_platform_admin'))
):
    email = payload.get('email')
    full_name = payload.get('full_name')

    if not email or not full_name:
        raise HTTPException(status_code=400, detail="Email and full name required")

    token = secrets.token_urlsafe(32)

    db.collection('invitations').add({
        'token': token,
        'email': email,
        'full_name': full_name,
        'role': 'platform_admin',
        'invited_by': current_admin['admin_id'],
        'status': 'pending',
        'created_at': firestore.SERVER_TIMESTAMP
    })

    email_result = send_admin_invite_email(
        to_email=email,
        full_name=full_name,
        inviter_name=current_admin.get('full_name', current_admin.get('email', 'Admin')),
        token=token
    )

    if email_result.get('status') != 'success':
        raise HTTPException(
            status_code=500,
            detail=f"Invitation email failed to send: {email_result.get('message', 'unknown error')}"
        )

    log_action(
        admin_id=current_admin['admin_id'],
        admin_email=current_admin['email'],
        admin_role=current_admin['role'],
        action_type='PLATFORM_ADMIN_INVITED',
        action_detail='Invitation sent to ' + email,
        ip_address=request.client.host,
        status='success'
    )

    return {
        "status": "success",
        "message": "Invitation sent to " + email,
        "data": {"token": token}
    }

@router.post("/{admin_id}/lock")
async def lock_admin(
    admin_id: str,
    request: Request,
    current_admin: dict = Depends(require_permission('delete_admin'))
):
    admins = db.collection('admins').where(
        filter=firestore.FieldFilter('admin_id', '==', admin_id)
    ).get()

    if not admins:
        raise HTTPException(status_code=404, detail="Admin not found")

    target = admins[0].to_dict()

    # Platform admin can only lock org admins
    if current_admin['role'] == 'platform_admin' and target.get('role') != 'org_admin':
        raise HTTPException(
            status_code=403,
            detail="Platform admins can only lock org admins"
        )

    admins[0].reference.update({'is_locked': True})

    log_action(
        admin_id=current_admin['admin_id'],
        admin_email=current_admin['email'],
        admin_role=current_admin['role'],
        action_type='ADMIN_LOCKED',
        action_detail='Admin ' + admin_id + ' locked',
        ip_address=request.client.host,
        status='success'
    )

    return {"status": "success", "message": "Admin locked"}

@router.post("/{admin_id}/unlock")
async def unlock_admin(
    admin_id: str,
    request: Request,
    current_admin: dict = Depends(require_permission('delete_admin'))
):
    admins = db.collection('admins').where(
        filter=firestore.FieldFilter('admin_id', '==', admin_id)
    ).get()

    if not admins:
        raise HTTPException(status_code=404, detail="Admin not found")

    target = admins[0].to_dict()

    # Platform admin can only unlock org admins
    if current_admin['role'] == 'platform_admin' and target.get('role') != 'org_admin':
        raise HTTPException(
            status_code=403,
            detail="Platform admins can only unlock org admins"
        )

    admins[0].reference.update({
        'is_locked': False,
        'failed_attempts': 0
    })

    log_action(
        admin_id=current_admin['admin_id'],
        admin_email=current_admin['email'],
        admin_role=current_admin['role'],
        action_type='ADMIN_UNLOCKED',
        action_detail='Admin ' + admin_id + ' unlocked',
        ip_address=request.client.host,
        status='success'
    )

    return {"status": "success", "message": "Admin unlocked"}

@router.delete("/{admin_id}")
async def delete_admin(
    admin_id: str,
    request: Request,
    current_admin: dict = Depends(require_permission('delete_admin'))
):
    admins = db.collection('admins').where(
        filter=firestore.FieldFilter('admin_id', '==', admin_id)
    ).get()

    if not admins:
        raise HTTPException(status_code=404, detail="Admin not found")

    admin_data = admins[0].to_dict()

    if admin_data.get('role') == 'super_admin':
        raise HTTPException(status_code=403, detail="Cannot delete Super Admin")

    # Platform admin can only delete org admins
    if current_admin['role'] == 'platform_admin' and admin_data.get('role') != 'org_admin':
        raise HTTPException(
            status_code=403,
            detail="Platform admins can only delete org admins"
        )

    admins[0].reference.delete()

    log_action(
        admin_id=current_admin['admin_id'],
        admin_email=current_admin['email'],
        admin_role=current_admin['role'],
        action_type='ADMIN_DELETED',
        action_detail='Admin ' + admin_data.get('email') + ' deleted',
        ip_address=request.client.host,
        status='success'
    )

    return {"status": "success", "message": "Admin deleted"}

@router.get("/online")
async def get_online_admins(
    current_admin: dict = Depends(
        require_permission('delete_admin')
    )
):
    """
    Returns admins active in the last 5 minutes
    Super Admin only
    """
    from datetime import datetime, timedelta

    try:
        threshold = datetime.utcnow() - timedelta(minutes=5)

        admins = db.collection('admins').get()

        online = []
        for admin in admins:
            data = admin.to_dict()
            data.pop('password_hash', None)

            last_active = data.get('last_active')
            if last_active:
                try:
                    last_dt = last_active.replace(tzinfo=None)
                    if last_dt >= threshold:
                        data['is_online'] = True
                        online.append(data)
                except Exception:
                    pass

        return {"status": "success", "data": online}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/accept-invite")
async def accept_invite(payload: dict):
    token = payload.get('token')
    email = payload.get('email')
    password = payload.get('password')
    full_name = payload.get('full_name')

    if not token or not email or not password or not full_name:
        raise HTTPException(status_code=400, detail="Token, email, full name and password are required")

    invite_docs = db.collection('invitations').where(
        filter=firestore.FieldFilter('token', '==', token)
    ).get()

    if not invite_docs:
        raise HTTPException(status_code=404, detail="Invitation not found")

    invite_doc = invite_docs[0]
    invite_data = invite_doc.to_dict()

    if invite_data.get('email', '').lower() != email.lower():
        raise HTTPException(status_code=400, detail="Email does not match the invitation")

    if invite_data.get('status') == 'accepted':
        raise HTTPException(status_code=400, detail="Invitation already accepted")

    existing = db.collection('admins').where(
        filter=firestore.FieldFilter('email', '==', email.lower())
    ).get()

    if existing:
        raise HTTPException(status_code=400, detail="An account with this email already exists")

    admin_id = str(uuid.uuid4())
    admin_data = {
        'admin_id': admin_id,
        'full_name': full_name,
        'email': email.lower(),
        'password_hash': hash_password(password),
        'role': 'platform_admin',
        'is_active': True,
        'is_locked': False,
        'failed_attempts': 0,
        'known_ips': [],
        'created_by': invite_data.get('invited_by', 'system'),
        'created_at': firestore.SERVER_TIMESTAMP,
        'last_login': None
    }

    db.collection('admins').document(admin_id).set(admin_data)
    invite_doc.reference.update({'status': 'accepted', 'accepted_at': firestore.SERVER_TIMESTAMP})

    return {
        "status": "success",
        "message": "Invitation accepted. You can now log in.",
        "data": {
            "admin_id": admin_id,
            "email": email.lower(),
            "full_name": full_name,
            "role": "platform_admin"
        }
    }


@router.post("/create-platform-admin")
async def create_platform_admin(
    payload: dict,
    request: Request,
    current_admin: dict = Depends(
        require_permission('create_platform_admin')
    )
):
    import bcrypt
    import uuid

    email = payload.get('email')
    full_name = payload.get('full_name')
    password = payload.get('password')

    if not email or not full_name or not password:
        raise HTTPException(
            status_code=400,
            detail="Email, full name and password are required"
        )

    existing = db.collection('admins').where(
        filter=firestore.FieldFilter(
            'email', '==', email.lower()
        )
    ).get()

    if existing:
        raise HTTPException(
            status_code=400,
            detail="An account with this email already exists"
        )

    admin_id = str(uuid.uuid4())

    password_hash = bcrypt.hashpw(
        password.encode('utf-8'),
        bcrypt.gensalt()
    ).decode('utf-8')

    admin_data = {
        'admin_id': admin_id,
        'full_name': full_name,
        'email': email.lower(),
        'password_hash': password_hash,
        'role': 'platform_admin',
        'is_active': True,
        'is_locked': False,
        'failed_attempts': 0,
        'known_ips': [],
        'created_by': current_admin['admin_id'],
        'created_at': firestore.SERVER_TIMESTAMP,
        'last_login': None
    }

    db.collection('admins').document(admin_id).set(admin_data)

    log_action(
        admin_id=current_admin['admin_id'],
        admin_email=current_admin['email'],
        admin_role=current_admin['role'],
        action_type='PLATFORM_ADMIN_CREATED',
        action_detail='Platform Admin created: ' + email,
        ip_address=request.client.host,
        status='success'
    )

    return {
        "status": "success",
        "message": "Platform Admin account created for " + email,
        "data": {
            "admin_id": admin_id,
            "email": email.lower(),
            "full_name": full_name,
            "role": "platform_admin"
        }
    }
