import firebase_admin
from firebase_admin import credentials, firestore
import bcrypt
import uuid
import os
from dotenv import load_dotenv

load_dotenv()

# Initialize Firebase
if not firebase_admin._apps:
    cred = credentials.Certificate(
        os.getenv('FIREBASE_CREDENTIALS_PATH', 'intellisense-ids-firebase-adminsdk-fbsvc-57bca2774b.json')
    )
    firebase_admin.initialize_app(cred)

db = firestore.client()

def hash_password(password: str) -> str:
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password.encode('utf-8'), salt)
    return hashed.decode('utf-8')

def seed_super_admin():
    # Check if super admin already exists
    existing = db.collection('admins').where(
        filter=firestore.FieldFilter('role', '==', 'super_admin')
    ).get()

    if existing:
        print("Super Admin already exists, skipping")
        print(f"Email: {existing[0].to_dict()['email']}")
        return

    # Super Admin details
    SUPER_ADMIN_EMAIL = "gervinsmart@gmail.com"
    SUPER_ADMIN_PASSWORD = "Goodlove1355"
    SUPER_ADMIN_NAME = "Central Admin"

    admin_id = str(uuid.uuid4())

    super_admin = {
        'admin_id': admin_id,
        'email': SUPER_ADMIN_EMAIL,
        'full_name': SUPER_ADMIN_NAME,
        'role': 'super_admin',
        'org_id': None,
        'org_code': None,
        'password_hash': hash_password(SUPER_ADMIN_PASSWORD),
        'is_active': True,
        'is_locked': False,
        'failed_attempts': 0,
        'known_ips': [],
        'created_by': 'system',
        'created_at': firestore.SERVER_TIMESTAMP,
        'last_login': None
    }

    db.collection('admins').document(admin_id).set(super_admin)

    print("=" * 45)
    print("Super Admin created successfully")
    print("=" * 45)
    print(f"Email:    {SUPER_ADMIN_EMAIL}")
    print(f"Password: {SUPER_ADMIN_PASSWORD}")
    print(f"Role:     super_admin")
    print(f"ID:       {admin_id}")
    print("=" * 45)
    print("Change your password")
    print("after your first login")
    print("=" * 45)

def seed_system_config():
    config_ref = db.collection('system_config').document('main')

    if config_ref.get().exists:
        print("System config already exists,  skipped")
        return

    config_ref.set({
        'retrain_interval_days': 7,
        'min_log_threshold': 1000,
        'confidence_threshold': 0.75,
        'alert_email_enabled': False,
        'smtp_email': 'gervinsmart@gmail.com',
        'created_at': firestore.SERVER_TIMESTAMP
    })

    print("System config created successfully")

if __name__ == "__main__":
    print("Seeding database...")
    seed_super_admin()
    seed_system_config()
    print("Database seeding complete")
