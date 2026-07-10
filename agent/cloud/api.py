import requests
import os
from dotenv import load_dotenv

load_dotenv()

BACKEND_URL = os.getenv('BACKEND_URL', 'http://localhost:8000')
API_KEY = os.getenv('API_KEY')
ORG_ID = os.getenv('ORG_ID')

HEADERS = {
    'Content-Type': 'application/json',
    'X-API-Key': API_KEY
}

def authenticate():
    try:
        response = requests.post(
            f"{BACKEND_URL}/api/agent/authenticate",
            json={"api_key": API_KEY},
            timeout=30
        )
        if response.status_code == 200:
            data = response.json()['data']
            print(f"Authenticated as {data['org_name']} ({data['org_code']})")
            return data
        else:
            print(f"Authentication failed: {response.text}")
            return None
    except Exception as e:
        print(f"Authentication error: {e}")
        return None

def send_heartbeat(
    model_version,
    status='online',
    flows_captured=0,
    flows_uploaded=0
):
    try:
        response = requests.post(
            f"{BACKEND_URL}/api/agent/heartbeat",
            headers=HEADERS,
            json={
                "org_id": ORG_ID,
                "model_version": model_version,
                "status": status,
                "flows_captured": flows_captured,
                "flows_uploaded": flows_uploaded
            },
            timeout=30
        )
        if response.status_code == 200:
            return response.json()['data']
        return None
    except Exception as e:
        print(f"Heartbeat error: {e}")
        return None

def post_alert(alert_data: dict) -> dict:
    """
    Posts a detected alert to the backend
    ingest endpoint which triggers:
    - IP reputation check
    - Temporal correlation (low and slow)
    - Kill chain detection
    - Regulatory flag assignment
    - MITRE enrichment
    - Email notifications for critical alerts

    This is the ONLY correct way to create
    alerts — never write to Firestore directly
    """
    try:
        response = requests.post(
            f"{BACKEND_URL}/api/alerts/ingest",
            headers=HEADERS,
            json=alert_data,
            timeout=30
        )
        if response.status_code == 200:
            return response.json()
        else:
            print(f"Alert post failed: {response.text}")
            return None
    except Exception as e:
        print(f"Alert post error: {e}")
        return None


def upload_logs(csv_path):
    try:
        with open(csv_path, 'rb') as f:
            response = requests.post(
                f"{BACKEND_URL}/api/agent/logs/upload",
                headers={'X-API-Key': API_KEY},
                files={
                    'file': (
                        os.path.basename(csv_path),
                        f,
                        'text/csv'
                    )
                },
                timeout=60
            )
        if response.status_code == 200:
            print(f"Logs uploaded: {os.path.basename(csv_path)}")
            return True
        else:
            print(f"Log upload failed: {response.text}")
            return False
    except Exception as e:
        print(f"Log upload error: {e}")
        return False

def get_model_download_url(version):
    try:
        response = requests.get(
            f"{BACKEND_URL}/api/agent/model/download-url",
            headers=HEADERS,
            params={"version": version},
            timeout=30
        )
        if response.status_code == 200:
            return response.json()['data']
        return None
    except Exception as e:
        print(f"Model URL error: {e}")
        return None

def confirm_model_update(version, status):
    try:
        response = requests.post(
            f"{BACKEND_URL}/api/agent/update/confirm",
            headers=HEADERS,
            json={
                "org_id": ORG_ID,
                "version": version,
                "status": status
            },
            timeout=30
        )
        return response.status_code == 200
    except Exception as e:
        print(f"Update confirm error: {e}")
        return False
