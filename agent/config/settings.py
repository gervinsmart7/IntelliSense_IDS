import os
from dotenv import load_dotenv

load_dotenv()

# Agent identity
API_KEY = os.getenv('API_KEY')
ORG_ID = os.getenv('ORG_ID')
NETWORK_INTERFACE = os.getenv('NETWORK_INTERFACE', 'eth0')

# Backend
BACKEND_URL = os.getenv('BACKEND_URL', 'http://localhost:8000')

# Firebase
FIREBASE_CREDENTIALS_PATH = os.getenv(
    'FIREBASE_CREDENTIALS_PATH',
    '../backend/intellisense-ids-firebase-adminsdk-fbsvc-57bca2774b.json'
)

# AWS
AWS_BUCKET_NAME = os.getenv('AWS_BUCKET_NAME')
AWS_REGION = os.getenv('AWS_REGION', 'us-east-1')

# Capture settings
CAPTURE_INTERVAL = int(os.getenv('CAPTURE_INTERVAL', 60))
HEARTBEAT_INTERVAL = int(os.getenv('HEARTBEAT_INTERVAL', 300))
LOG_UPLOAD_INTERVAL = int(os.getenv('LOG_UPLOAD_INTERVAL', 60))

# Model
CURRENT_MODEL_VERSION = os.getenv('CURRENT_MODEL_VERSION', 'none')
MODEL_PATH = os.getenv('MODEL_PATH', 'models/current_model.pkl')

# Paths
CAPTURE_DIR = 'captures'
FLOWS_DIR = 'flows'
MODELS_DIR = 'models'
LOGS_DIR = 'logs'
