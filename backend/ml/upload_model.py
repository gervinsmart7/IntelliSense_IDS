import boto3
import os
import json
import hashlib
import zipfile
import tempfile
from datetime import datetime
from firebase_admin import firestore
from services.firebase import get_db
from services.s3 import upload_file

db = get_db()

REQUIRED_BUNDLE_FILES = [
    'ids_model_v1.pkl',
    'scaler.pkl',
    'label_encoder.pkl',
    'feature_names.npy'
]


def compute_checksum(filepath):
    sha256 = hashlib.sha256()
    with open(filepath, 'rb') as f:
        for chunk in iter(lambda: f.read(8192), b""):
            sha256.update(chunk)
    return sha256.hexdigest()


def package_bundle(bundle_dir):
    missing = [
        f for f in REQUIRED_BUNDLE_FILES
        if not os.path.exists(os.path.join(bundle_dir, f))
    ]
    if missing:
        raise FileNotFoundError(f"Missing bundle files: {missing}")

    tmp_zip = tempfile.NamedTemporaryFile(suffix='.zip', delete=False).name

    with zipfile.ZipFile(tmp_zip, 'w', zipfile.ZIP_DEFLATED) as zf:
        for fname in REQUIRED_BUNDLE_FILES:
            zf.write(os.path.join(bundle_dir, fname), arcname=fname)

    return tmp_zip

#Upload to S3
def upload_model_to_s3(bundle_dir, version, metrics, trained_on=5000):
    print(f"\nPackaging model bundle {version}...")
    zip_path = package_bundle(bundle_dir)
    checksum = compute_checksum(zip_path)

    s3_key = f"models/{version}/bundle.zip"

    print(f"Uploading bundle {version} to S3...")
    result = upload_file(zip_path, s3_key)
    os.remove(zip_path)

    if result['status'] != 'success':
        print(f"S3 upload failed: {result}")
        return False

    print(f"Bundle uploaded to S3: {s3_key}")

    existing = db.collection('model_versions').where(
        filter=firestore.FieldFilter('is_production', '==', True)
    ).get()

    for doc in existing:
        doc.reference.update({'is_production': False})

    db.collection('model_versions').document(version).set({
        'version': version,
        'f1_score': metrics['f1'],
        'precision': metrics['precision'],
        'recall': metrics['recall'],
        'accuracy': metrics['accuracy'],
        's3_key': s3_key,
        'checksum': checksum,
        'is_production': True,
        'trained_on': trained_on,
        'triggered_by': 'manual',
        'deployed_at': firestore.SERVER_TIMESTAMP,
        'created_at': firestore.SERVER_TIMESTAMP
    })

    print(f"Model {version} registered in Firestore")
    print(f"Model {version} is now production")

    return True


if __name__ == "__main__":
    import sys

    version = sys.argv[1] if len(sys.argv) > 1 else 'v1.0'
    bundle_dir = f"ml/trained_models/{version}"

    metrics = {
        'accuracy': 0.9959,
        'precision': 0.997763,
        'recall': 0.9959,
        'f1': 0.996684
    }

    upload_model_to_s3(
        bundle_dir=bundle_dir,
        version=version,
        metrics=metrics,
        trained_on=100000
    )