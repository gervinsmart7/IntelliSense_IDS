from fastapi import APIRouter, HTTPException, Depends
from firebase_admin import firestore
from services.firebase import get_db
from services.auth import get_current_admin
import boto3
import os
import pandas as pd
import io

router = APIRouter(prefix="/api/logs", tags=["Logs"])
db = get_db()
s3 = boto3.client('s3', region_name='us-east-1')
BUCKET_NAME = os.getenv('AWS_BUCKET_NAME', 'intellisense-ids')


def check_org_access(current_admin: dict, org_id: str):
    if current_admin['role'] == 'org_admin' and current_admin['org_id'] != org_id:
        raise HTTPException(status_code=403, detail="Access denied")


@router.get("/summary/{org_id}")
async def get_logs_summary(
    org_id: str,
    days: int = 7,
    current_admin: dict = Depends(get_current_admin)
):
    check_org_access(current_admin, org_id)

    stats = db.collection('daily_traffic_stats').where(
        filter=firestore.FieldFilter('org_id', '==', org_id)
    ).get()

    daily = [s.to_dict() for s in stats]
    daily.sort(key=lambda x: x.get('date', ''), reverse=True)
    daily = daily[:days]

    total_benign = sum(d.get('benign', 0) for d in daily)
    total_attack = sum(d.get('attack', 0) for d in daily)

    return {
        "status": "success",
        "data": {
            "total_flows": total_benign + total_attack,
            "total_benign": total_benign,
            "total_attack": total_attack,
            "daily": daily
        }
    }


@router.get("/raw/{org_id}")
async def get_raw_logs(
    org_id: str,
    page: int = 0,
    page_size: int = 50,
    current_admin: dict = Depends(get_current_admin)
):
    """
    Reads actual captured-flow CSVs from S3 for this org and returns
    a paginated, summarized row set (not all 78 raw features — just
    what's useful to display).
    """
    check_org_access(current_admin, org_id)

    try:
        response = s3.list_objects_v2(
            Bucket=BUCKET_NAME,
            Prefix=f'logs/{org_id}/'
        )
        files = sorted(
            response.get('Contents', []),
            key=lambda f: f['LastModified'],
            reverse=True
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"S3 list error: {e}")

    all_rows = []
    display_cols = [
        'prediction', 'confidence', 'Src IP', 'Dst IP',
        'Src Port', 'Dst Port', 'Protocol', 'Flow Duration'
    ]

    # Read most-recent files until we have enough rows for this page
    needed = (page + 1) * page_size
    for file in files:
        if len(all_rows) >= needed:
            break
        try:
            obj = s3.get_object(Bucket=BUCKET_NAME, Key=file['Key'])
            df = pd.read_csv(io.BytesIO(obj['Body'].read()))
            df.columns = df.columns.str.strip()

            cols_present = [c for c in display_cols if c in df.columns]
            subset = df[cols_present].copy()
            subset['source_file'] = file['Key'].split('/')[-1]
            subset['captured_at'] = file['LastModified'].isoformat()

            all_rows.extend(subset.to_dict('records'))
        except Exception as e:
            print(f"Error reading {file['Key']}: {e}")
            continue

    start = page * page_size
    end = start + page_size
    page_rows = all_rows[start:end]

    return {
        "status": "success",
        "data": page_rows,
        "page": page,
        "page_size": page_size,
        "has_more": len(all_rows) > end
    }

@router.get("/summary/all")
async def get_all_orgs_logs_summary(
    days: int = 7,
    current_admin: dict = Depends(get_current_admin)
):
    if current_admin['role'] not in ('super_admin', 'platform_admin'):
        raise HTTPException(status_code=403, detail="Access denied")

    stats = db.collection('daily_traffic_stats').get()
    daily = [s.to_dict() for s in stats]

    # Group by org_id so the frontend can show per-org breakdown too
    by_org = {}
    total_benign = 0
    total_attack = 0

    for d in daily:
        org_id = d.get('org_id')
        by_org.setdefault(org_id, {'benign': 0, 'attack': 0})
        by_org[org_id]['benign'] += d.get('benign', 0)
        by_org[org_id]['attack'] += d.get('attack', 0)
        total_benign += d.get('benign', 0)
        total_attack += d.get('attack', 0)

    return {
        "status": "success",
        "data": {
            "total_flows": total_benign + total_attack,
            "total_benign": total_benign,
            "total_attack": total_attack,
            "by_org": by_org
        }
    }