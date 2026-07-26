import os
import boto3
import pandas as pd
import tempfile
import zipfile
from datetime import datetime
from firebase_admin import firestore
from services.firebase import get_db
from services.s3 import upload_file
from ml.train import (
    get_next_version,
    warm_start_retrain,
    save_model
)
from ml.upload_model import upload_model_to_s3
from services.notifications import NotificationService

db = get_db()
s3 = boto3.client('s3', region_name='us-east-1')
BUCKET_NAME = os.getenv('AWS_BUCKET_NAME', 'intellisense-ids')

def download_current_bundle():
    """
    Downloads and extracts the current production model bundle
    from S3, so warm-start retraining builds on the real deployed
    model — not a stale local copy.
    """
    current = db.collection('model_versions').where(
        filter=firestore.FieldFilter('is_production', '==', True)
    ).get()

    if not current:
        raise ValueError("No current production model found to warm-start from")

    current_doc = current[0].to_dict()
    s3_key = current_doc['s3_key']
    version = current_doc['version']

    tmp_zip = tempfile.NamedTemporaryFile(suffix='.zip', delete=False).name
    s3.download_file(BUCKET_NAME, s3_key, tmp_zip)

    bundle_dir = tempfile.mkdtemp(prefix=f'current_bundle_{version}_')
    with zipfile.ZipFile(tmp_zip, 'r') as zf:
        zf.extractall(bundle_dir)
    os.remove(tmp_zip)

    return bundle_dir, current_doc

def fetch_all_org_logs():
    """
    Fetches all organisation logs from S3
    Combines into one dataset for retraining
    """
    print("Fetching logs from all organisations...")

    all_dataframes = []
    total_files = 0

    orgs = db.collection('organisations').where(
        filter=firestore.FieldFilter('status', '==', 'active')
    ).get()

    for org in orgs:
        org_data = org.to_dict()
        org_id = org_data['org_id']
        org_name = org_data['name']

        print(f"Fetching logs for {org_name}...")

        try:
            response = s3.list_objects_v2(
                Bucket=BUCKET_NAME,
                Prefix=f'logs/{org_id}/'
            )
            files = response.get('Contents', [])
            for file in files:
                try:
                    obj = s3.get_object(
                        Bucket=BUCKET_NAME,
                        Key=file['Key']
                    )
                    df = pd.read_csv(obj['Body'])

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

    combined = pd.concat(all_dataframes, ignore_index=True)
    print(f"Combined {total_files} files from {len(orgs)} organisations")
    print(f"Total samples: {len(combined)}")
    return combined

def fetch_false_positives():
    """
    Fetches false positive reports (legacy — summary fields only,
    no feature vector). Kept for existing dashboard reporting;
    NOT used as a retraining data source anymore.
    """
    try:
        fps = db.collection('false_positives').get()
        fp_list = [fp.to_dict() for fp in fps]
        print(f"Fetched {len(fp_list)} false positive reports")
        return fp_list
    except Exception as e:
        print(f"False positive fetch error: {e}")
        return []

def fetch_verified_alerts_as_training_rows():
    """
    Converts admin-verified alerts into real, labeled training rows
    using their stored full feature vectors. This is the real
    retraining data source — captures both confirmed-correct and
    confirmed-wrong classifications, with full features attached.
    """
    verified = db.collection('alerts').where(
        filter=firestore.FieldFilter('verification_status', '==', 'verified')
    ).get()

    rows = []
    for doc in verified:
        data = doc.to_dict()
        features = data.get('features')
        if not features:
            continue
        row = dict(features)
        row['Label'] = data.get('verified_label')
        rows.append(row)

    if not rows:
        print("No verified alerts with feature data found")
        return None

    df = pd.DataFrame(rows)
    print(f"Built {len(df)} labeled training rows from admin-verified alerts")
    return df

def check_retrain_conditions():
    """
    Checks if retraining should be triggered
    Returns True if conditions are met
    """
    config = db.collection('system_config')\
               .document('main').get().to_dict()

    min_threshold = config.get('min_log_threshold', 1000)

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

def clean_new_logs(df):
    """
    Filters out rows without a real, trustworthy label.
    Agent fallback-extraction currently logs everything as 'UNKNOWN'
    (no ground truth) — those rows cannot be used for training and
    must be excluded here.
    """
    label_col = 'Label' if 'Label' in df.columns else 'label'

    before = len(df)
    cleaned = df[~df[label_col].isin(['UNKNOWN', 'unknown', None])].copy()
    cleaned = cleaned.dropna(subset=[label_col])
    after = len(cleaned)

    print(f"Log cleaning: {before} rows -> {after} rows with real labels "
          f"({before - after} unlabeled rows dropped)")

    return cleaned

def run_retraining_pipeline(
    triggered_by='auto',
    admin_id=None
):
    """
    Full retraining pipeline
    Fetch logs → Combine → Warm-start → Evaluate → Deploy
    """
    print("=" * 50)
    print("IntelliSense IDS Retraining Pipeline")
    print(f"Triggered by: {triggered_by}")
    print("=" * 50)

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
        # Step 1 — Fetch and clean new logs, plus admin-verified alerts
        raw_logs = fetch_all_org_logs()
        cleaned_logs = clean_new_logs(raw_logs) if raw_logs is not None else pd.DataFrame()

        verified_df = fetch_verified_alerts_as_training_rows()

        parts = [d for d in [cleaned_logs, verified_df] if d is not None and len(d) > 0]
        if not parts:
            raise ValueError("No labeled data available for retraining")

        combined_df = pd.concat(parts, ignore_index=True)

        if len(combined_df) < 20:
            raise ValueError(
                f"Insufficient LABELED data for warm-start retraining "
                f"({len(combined_df)} usable rows)"
            )

        # Step 2 — Get next version
        version_info = get_next_version(triggered_by=triggered_by)
        version = version_info['version']
        lineage = version_info['lineage']
        s3_key = version_info['s3_key']

        # Step 3 — Warm-start: grow the current production model
        bundle_dir, current_doc = download_current_bundle()
        model, scaler, le, feature_cols, metrics = warm_start_retrain(
            bundle_dir, combined_df, n_new_trees=30
        )

        new_bundle_dir, checksum, metadata = save_model(
            model, le, scaler, feature_cols, metrics, version
        )

        result = {'metrics': metrics, 'bundle_dir': new_bundle_dir}

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
            upload_model_to_s3(
                bundle_dir=result['bundle_dir'],
                version=version,
                lineage=lineage,
                s3_key=s3_key,
                metrics=result['metrics'],
                trained_on=len(combined_df)
            )

            push_model_to_all_agents(version, result['metrics'])

            db.collection('retrain_jobs').document(job_id).update({
                'status': 'completed',
                'new_version': version,
                'f1_score': result['metrics']['f1'],
                'completed_at': firestore.SERVER_TIMESTAMP
            })

            print(f"\nRetraining complete — Model {version} deployed")

        else:
            db.collection('retrain_jobs').document(job_id).update({
                'status': 'rejected',
                'reason': 'new_model_underperformed',
                'completed_at': firestore.SERVER_TIMESTAMP
            })

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

    from services.s3 import generate_presigned_url
    version_doc = db.collection('model_versions').document(version).get()
    s3_key = version_doc.to_dict()['s3_key']
    model_url = generate_presigned_url(s3_key, expiry=604800)

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