cat > ~/IntelliSense_IDS/backend/services/firebase.py << 'EOF'
import firebase_admin
from firebase_admin import credentials, firestore
import os
import json

_db = None

def init_firebase():
    global _db
    if firebase_admin._apps:
        _db = firestore.client()
        return _db

    # Try JSON string from environment variable first
    # This is how Render (and any cloud host) provides it
    creds_json = os.getenv('FIREBASE_CREDENTIALS_JSON')

    if creds_json:
        try:
            cred_dict = json.loads(creds_json)
            cred = credentials.Certificate(cred_dict)
            print("Firebase initialized from environment variable")
        except Exception as e:
            raise RuntimeError(
                f"Failed to parse FIREBASE_CREDENTIALS_JSON: {e}"
            )
    else:
        # Fall back to file path for local development
        key_path = os.getenv(
            'FIREBASE_KEY_PATH',
            'intellisense-ids-firebase-adminsdk-fbsvc-57bca2774b.json'
        )
        if not os.path.exists(key_path):
            raise RuntimeError(
                f"Firebase key file not found: {key_path}\n"
                f"Set FIREBASE_CREDENTIALS_JSON environment variable "
                f"or place the key file at {key_path}"
            )
        cred = credentials.Certificate(key_path)
        print(f"Firebase initialized from file: {key_path}")

    firebase_admin.initialize_app(cred)
    _db = firestore.client()
    return _db

def get_db():
    global _db
    if _db is None:
        init_firebase()
    return _db
EOF