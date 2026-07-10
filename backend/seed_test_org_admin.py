import os
import uuid
import bcrypt
from firebase_admin import firestore
from services.firebase import get_db


def hash_password(password: str) -> str:
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password.encode('utf-8'), salt)
    return hashed.decode('utf-8')


def seed_test_org_admin():
    db = get_db()

    email = "orgadmin@test.com"
    password = "TestOrg123!"
    org_name = "Test Organisation"
    org_code = "TEST-ORG"
    org_id = "test-org-001"
    admin_id = "test-org-admin-001"

    existing_admin = db.collection('admins').where(
        filter=firestore.FieldFilter('email', '==', email)
    ).get()

    if existing_admin:
        print("Test org admin already exists")
        print(f"Email: {email}")
        return

    org_doc = {
        'org_id': org_id,
        'org_code': org_code,
        'name': org_name,
        'type': 'Test',
        'country': 'Ghana',
        'city': 'Accra',
        'domain': 'testorg.local',
        'phone': '+233000000000',
        'api_key_hash': 'test-only-api-key-hash',
        'raw_api_key_temp': 'test-only-api-key',
        'status': 'active',
        'agent_status': 'not_installed',
        'model_version': None,
        'pending_model_version': None,
        'last_sync': None,
        'created_at': firestore.SERVER_TIMESTAMP
    }

    admin_doc = {
        'admin_id': admin_id,
        'full_name': 'Test Org Admin',
        'email': email,
        'password_hash': hash_password(password),
        'role': 'org_admin',
        'org_id': org_id,
        'org_code': org_code,
        'is_active': True,
        'is_locked': False,
        'failed_attempts': 0,
        'known_ips': [],
        'created_by': 'system',
        'created_at': firestore.SERVER_TIMESTAMP,
        'last_login': None
    }

    db.collection('organisations').document(org_id).set(org_doc)
    db.collection('admins').document(admin_id).set(admin_doc)

    print("=" * 45)
    print("Test org admin created successfully")
    print("=" * 45)
    print(f"Email:    {email}")
    print(f"Password: {password}")
    print(f"Role:     org_admin")
    print(f"Org ID:   {org_id}")
    print("=" * 45)


if __name__ == "__main__":
    seed_test_org_admin()
