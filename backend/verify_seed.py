import firebase_admin
from firebase_admin import credentials, firestore
import os
from dotenv import load_dotenv

load_dotenv()

if not firebase_admin._apps:
    cred = credentials.Certificate(
        os.getenv('FIREBASE_CREDENTIALS_PATH', 'intellisense-ids-firebase-adminsdk-fbsvc-57bca2774b.json')
    )
    firebase_admin.initialize_app(cred)

db = firestore.client()

# Check super admin
admins = db.collection('admins').get()
print(f"Total admins: {len(admins)}")
for admin in admins:
    data = admin.to_dict()
    print(f"Name:  {data['full_name']}")
    print(f"Email: {data['email']}")
    print(f"Role:  {data['role']}")
    print(f"Active: {data['is_active']}")

# Check system config
config = db.collection('system_config').document('main').get()
print("\nSystem Config:")
print(config.to_dict())
