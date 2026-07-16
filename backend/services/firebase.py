import firebase_admin
from firebase_admin import credentials, firestore
import os
import json
from pathlib import Path

_db = None


def _candidate_key_paths():
    configured_path = os.getenv('FIREBASE_KEY_PATH')
    default_file = 'intellisense-ids-firebase-adminsdk-fbsvc-57bca2774b.json'

    candidates = []
    if configured_path:
        candidates.append(configured_path)

    base_dir = Path(__file__).resolve().parent.parent
    candidates.extend([
        default_file,
        str(base_dir / default_file),
        str(base_dir / 'backend' / default_file),
        str(Path.cwd() / default_file),
        str(Path.cwd() / 'backend' / default_file),
    ])

    seen = set()
    for candidate in candidates:
        if candidate and candidate not in seen:
            seen.add(candidate)
            yield candidate


def init_firebase():
    global _db
    if firebase_admin._apps:
        _db = firestore.client()
        return _db

    creds_json = os.getenv('FIREBASE_CREDENTIALS_JSON')

    if creds_json:
        try:
            cred_dict = json.loads(creds_json)
            cred = credentials.Certificate(cred_dict)
            print("Firebase initialized from environment variable")
        except Exception as e:
            raise RuntimeError(
                f"Failed to parse FIREBASE_CREDENTIALS_JSON: {e}"
            ) from e
    else:
        key_path = None
        for candidate in _candidate_key_paths():
            if os.path.exists(candidate):
                key_path = candidate
                break

        if not key_path:
            searched = ', '.join(list(_candidate_key_paths()))
            raise RuntimeError(
                f"Firebase key file not found. Searched: {searched}. "
                f"Set FIREBASE_CREDENTIALS_JSON or FIREBASE_KEY_PATH."
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
