import boto3
import os
import json
import hashlib
from datetime import datetime
from firebase_admin import firestore
from services.firebase import get_db
from services.s3 import upload_file

db = get_db()

def upload_model_to_s3(
    model_path,
    version,
    metrics,
    checksum,
    trained_on=5000
):
    """
    Uploads trained model to S3
    Registers version in Firestore
    """
    print(f"\nUploading model {version} to S3...")

    # S3 key for model file
    s3_key = f"models/{version}/ids_model_{version}.pkl"

    # Upload to S3
    result = upload_file(model_path, s3_key)

    if result['status'] != 'success':
        print(f"S3 upload failed: {result}")
        return False

    print(f"Model uploaded to S3: {s3_key}")

    # Register in Firestore
    # Mark all existing models as not production
    existing = db.collection('model_versions').where(
        filter=firestore.FieldFilter('is_production', '==', True)
    ).get()

    for doc in existing:
        doc.reference.update({'is_production': False})

    # Add new model version
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
    import json

    # Load metadata from training
    version = sys.argv[1] if len(sys.argv) > 1 else 'v1.0'
    metadata_path = f"ml/trained_models/{version}/metadata.json"

    with open(metadata_path) as f:
        metadata = json.load(f)

    upload_model_to_s3(
        model_path=metadata['model_path'],
        version=version,
        metrics=metadata['metrics'],
        checksum=metadata['checksum']
    )
