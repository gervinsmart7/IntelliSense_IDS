from firebase_admin import firestore
from services.firebase import get_db
from fastapi import Request
from datetime import datetime

db = get_db()

async def track_admin_activity(request: Request, call_next):
    """
    Middleware that updates admin last_active
    timestamp on every authenticated request
    """
    response = await call_next(request)

    try:
        auth_header = request.headers.get('Authorization')
        if auth_header and auth_header.startswith('Bearer '):
            token = auth_header.split(' ')[1]

            from services.auth import decode_token
            payload = decode_token(token)

            if payload and payload.get('admin_id'):
                db.collection('admins').document(
                    payload['admin_id']
                ).update({
                    'last_active': firestore.SERVER_TIMESTAMP,
                    'is_online': True
                })
    except Exception:
        pass

    return response
