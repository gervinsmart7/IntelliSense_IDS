import os
import boto3
import pandas as pd
import tempfile
from datetime import datetime
from firebase_admin import firestore
from services.firebase import get_db
from services.s3 import upload_file
from ml.train import (
    run_training_pipeline,
    get_next_version
)
from ml.upload_model import upload_model_to_s3
from services.notifications import NotificationService

db = get_db()
s3 = boto3.client('s3', region_name='us-east-1')
BUCKET_NAME = os.getenv('AWS_BUCKET_NAME', 'intellisense-ids')

def fetch_all_org_logs():
    """
    Fetches all organisation logs from S3
    Combines into one dataset for retraining
    """
    print("Fetching logs from all organisations...")

    all_dataframes = []
    total_files = 0

def fetch_false_positives():
    """
    Fetches false positive reports
    These are flows the model wrongly
    classified as attacks
    Used to correct the training data
    """
    try:
        fps = db.collection('false_positives').get()
        fp_list = [fp.to_dict() for fp in fps]
        print(f"Fetched {len(fp_list)} false positive reports")
        return fp_list
    except Exception as e:
        print(f"False positive fetch error: {e}")
        return []

    # Get all organisations
    orgs = db.collection('organisations').where(
        filter=firestore.FieldFilter('status', '==', 'active')
    ).get()

    for org in orgs:
        org_data = org.to_dict()
        org_id = org_data['org_id']
        org_name = org_data['name']

        print(f"Fetching logs for {org_name}...")

        # List all log files for this org
        try:
            response = s3.list_objects_v2(
                Bucket=BUCKET_NAME,
                Prefix=f'logs/{org_id}/'
            )

            files = response.get('Contents', [])

            for file in files:
                try:
                    # Download CSV file
                    obj = s3.get_object(
                        Bucket=BUCKET_NAME,
                        Key=file['Key']
                    )

                    df = pd.read_csv(obj['Body'])

                    # Only include files with Label column
                    if 'Label' in df.columns or 'label' in df.columns:
                        all_dataframes.append(df)
                        total_files += 1

                except Exception as e:
                    print(f"Error reading {file['Key']}: {e}")
                    continue

        except Exception as e:
            print(f"Error fetching logs for {org_name}: {e}")
            continue

    if not all_dataframes:
        print("No labelled logs found")
        return None

    # Combine all org data
    combined = pd.concat(all_dataframes, ignore_index=True)
    print(f"Combined {total_files} files from {len(orgs)} organisations")
    print(f"Total samples: {len(combined)}")

    return combined

def check_retrain_conditions():
    """
    Checks if retraining should be triggered
    Returns True if conditions are met
    """
    # Get system config
    config = db.collection('system_config')\
               .document('main').get().to_dict()

    min_threshold = config.get('min_log_threshold', 1000)

    # Count total logs in S3
    total_logs = 0
    orgs = db.collection('organisations').where(
        filter=firestore.FieldFilter('status', '==', 'active')
    ).get()

    for org in orgs:
        org_id = org.to_dict()['org_id']
        try:
            response = s3.list_objects_v2(
                Bucket=BUCKET_NAME,
                Prefix=f'logs/{org_id}/'
            )
            total_logs += len(response.get('Contents', []))
        except Exception:
            pass

    print(f"Total log files: {total_logs}")
    print(f"Minimum threshold: {min_threshold}")

    return total_logs >= min_threshold

def run_retraining_pipeline(
    triggered_by='auto',
    admin_id=None
):
    """
    Full retraining pipeline
    Fetch logs → Combine → Train → Evaluate → Deploy
    """
    print("=" * 50)
    print("IntelliSense IDS Retraining Pipeline")
    print(f"Triggered by: {triggered_by}")
    print("=" * 50)

    # Create retrain job record
    job_ref = db.collection('retrain_jobs').add({
        'status': 'running',
        'triggered_by': triggered_by,
        'admin_id': admin_id,
        'started_at': firestore.SERVER_TIMESTAMP,
        'completed_at': None,
        'new_version': None,
        'error': None
    })

    job_id = job_ref[1].id

    try:
        # Step 1 — Fetch logs from S3
        combined_df = fetch_all_org_logs()

        if combined_df is None or len(combined_df) < 100:
            raise ValueError(
                "Insufficient data for retraining"
            )

        # Save combined dataset temporarily
        temp_dataset = f'ml/retrain_dataset_{job_id[:8]}.csv'
        combined_df.to_csv(temp_dataset, index=False)

        # Step 2 — Get next version
        version = get_next_version()

        fp_list = fetch_false_positives()
        if fp_list and len(combined_df) > 0:
            fp_attack_types = [
                fp.get('attack_type') for fp in fp_list
                if fp.get('attack_type')
            ]
            print(f"Applying {len(fp_attack_types)} false positive corrections")

        # Step 3 — Run training pipeline
        result = run_training_pipeline(
            dataset_path=temp_dataset,
            version=version
        )

        # Step 4 — Compare with current model
        current_model = db.collection('model_versions').where(
            filter=firestore.FieldFilter('is_production', '==', True)
        ).get()

        should_deploy = True

        if current_model:
            current_f1 = current_model[0].to_dict().get('f1_score', 0)
            new_f1 = result['metrics']['f1']

            print(f"\nCurrent model F1: {current_f1:.4f}")
            print(f"New model F1:     {new_f1:.4f}")

            if new_f1 <= current_f1:
                should_deploy = False
                print("New model does not improve — keeping current")

        if should_deploy:
            # Step 5 — Upload to S3 and register
            upload_model_to_s3(
                model_path=result['model_path'],
                version=version,
                metrics=result['metrics'],
                checksum=result['checksum'],
                trained_on=len(combined_df)
            )

            # Step 6 — Push to all agents
            push_model_to_all_agents(version, result['metrics'])

            # Update job status
            db.collection('retrain_jobs').document(job_id).update({
                'status': 'completed',
                'new_version': version,
                'f1_score': result['metrics']['f1'],
                'completed_at': firestore.SERVER_TIMESTAMP
            })

            print(f"\nRetraining complete — Model {version} deployed")

        else:
            # Update job as rejected
            db.collection('retrain_jobs').document(job_id).update({
                'status': 'rejected',
                'reason': 'new_model_underperformed',
                'completed_at': firestore.SERVER_TIMESTAMP
            })

        # Clean up temp dataset
        if os.path.exists(temp_dataset):
            os.remove(temp_dataset)

        return {
            'status': 'completed' if should_deploy else 'rejected',
            'version': version if should_deploy else None,
            'metrics': result['metrics']
        }

    except Exception as e:
        print(f"Retraining error: {e}")

        db.collection('retrain_jobs').document(job_id).update({
            'status': 'failed',
            'error': str(e),
            'completed_at': firestore.SERVER_TIMESTAMP
        })

        return {
            'status': 'failed',
            'error': str(e)
        }

def push_model_to_all_agents(version, metrics):
    """
    Pushes new model version to all
    active organisation agents
    via Firestore
    """
    print(f"\nPushing model {version} to all agents...")

    # Get model download URL
    from services.s3 import generate_presigned_url
    s3_key = f"models/{version}/ids_model_{version}.pkl"
    model_url = generate_presigned_url(s3_key, expiry=604800)

    # Get all active organisations
    orgs = db.collection('organisations').where(
        filter=firestore.FieldFilter('status', '==', 'active')
    ).get()

    pushed = 0
    for org in orgs:
        org_id = org.to_dict()['org_id']
        db.collection('organisations').document(org_id).update({
            'pending_model_version': version,
            'pending_model_url': model_url,
            'update_status': 'pending'
        })
        pushed += 1

    print(f"Model {version} pushed to {pushed} organisations")

    NotificationService.create_model_update_notification(
        model_version=version,
        description=f'Deployed to {pushed} organisations. F1 Score: {metrics["f1"]:.4f}'
    )
