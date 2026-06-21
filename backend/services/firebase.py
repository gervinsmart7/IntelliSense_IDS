import firebase_admin
from firebase_admin import credentials, firestore
import os

# Initialize Firebase only once
if not firebase_admin._apps:
    cred = credentials.Certificate(
        os.getenv('FIREBASE_CREDENTIALS_PATH', 'intellisense-ids-firebase-adminsdk-fbsvc-57bca2774b.json')
    )
    firebase_admin.initialize_app(cred)

# Get Firestore client
db = firestore.client()

def get_db():
    return db
