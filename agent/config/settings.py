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

# Finance Sector — Sensitive Ports
# Traffic to these ports gets elevated
# severity regardless of ML confidence

# CRITICAL — direct attack on these means
# potential core banking compromise
FINANCE_CRITICAL_PORTS = [
    1433,   # Microsoft SQL Server (core banking DB)
    1521,   # Oracle DB (widely used in banks)
    3306,   # MySQL (some banking apps)
    5432,   # PostgreSQL
    27017,  # MongoDB (fintech apps)
    6379,   # Redis (session/cache — banking apps)
]

# HIGH — important financial services
FINANCE_HIGH_RISK_PORTS = [
    443,    # HTTPS banking portal
    8443,   # Alternate HTTPS banking API
    3389,   # RDP (remote desktop — insider risk)
    5900,   # VNC (remote access)
    4789,   # SWIFT network traffic
    9000,   # Fintech microservices
    8080,   # Banking web services
    8443,   # Secure banking API
    21,     # FTP (legacy bank file transfer)
    22,     # SSH
]

# MEDIUM — payment and card processing
FINANCE_MEDIUM_PORTS = [
    9100,   # POS terminal communication
    8583,   # ISO 8583 payment messages
    2083,   # Payment gateway
    2087,   # Payment processor
    5672,   # RabbitMQ (transaction queues)
    61616,  # ActiveMQ (transaction messaging)
]

# All finance sensitive ports combined
ALL_FINANCE_SENSITIVE_PORTS = (
    FINANCE_CRITICAL_PORTS +
    FINANCE_HIGH_RISK_PORTS +
    FINANCE_MEDIUM_PORTS
)

# ─────────────────────────────────────────
# Finance Sector — Business Hours
# Unusual traffic outside these hours
# gets extra suspicion weighting
# ─────────────────────────────────────────
BUSINESS_HOURS_START = int(os.getenv('BUSINESS_HOURS_START', 8))
BUSINESS_HOURS_END = int(os.getenv('BUSINESS_HOURS_END', 18))
BUSINESS_TIMEZONE = os.getenv('BUSINESS_TIMEZONE', 'Africa/Accra')

# ─────────────────────────────────────────
# Finance Sector — Attack Severity Map
# Finance-specific attack types included
# ─────────────────────────────────────────
FINANCE_SEVERITY_MAP = {
    # Standard attacks
    'DDoS': 'critical',
    'DoS': 'critical',
    'DoS GoldenEye': 'critical',
    'DoS Hulk': 'critical',
    'DoS Slowhttptest': 'high',
    'DoS slowloris': 'high',
    'PortScan': 'medium',
    'FTP-Patator': 'high',
    'SSH-Patator': 'high',
    'Bot': 'high',
    'Web Attack XSS': 'medium',
    'Web Attack SQL Injection': 'critical',
    'Web Attack Brute Force': 'high',
    'Infiltration': 'critical',
    'Heartbleed': 'critical',

    # Finance-specific attacks
    'Credential-Stuffing': 'critical',
    'Card-Skim-Probe': 'critical',
    'DDoS-Payment-Gateway': 'critical',
    'Data-Exfiltration': 'critical',
    'Ransomware-C2': 'critical',
    'API-Abuse-Banking': 'critical',
    'Insider-Exfiltration': 'critical',
    'SWIFT-Anomaly': 'critical',
    'Cryptojacking': 'high',
    'Port-Scan-Financial': 'high',

    # Benign
    'BENIGN': 'none'
}

# ─────────────────────────────────────────
# Finance Sector — Regulatory Flags
# Attack types that require regulatory
# notification in finance sector
# ─────────────────────────────────────────
REGULATORY_FLAG_MAP = {
    'Data-Exfiltration': [
        'GDPR_REPORTABLE',
        'PCI_DSS_INCIDENT',
        'NOTIFY_DPO'
    ],
    'SWIFT-Anomaly': [
        'NOTIFY_CENTRAL_BANK',
        'SWIFT_CSP_INCIDENT'
    ],
    'Credential-Stuffing': [
        'NOTIFY_FRAUD_TEAM',
        'CUSTOMER_IMPACT_LIKELY',
        'PCI_DSS_INCIDENT'
    ],
    'Card-Skim-Probe': [
        'PCI_DSS_INCIDENT',
        'NOTIFY_CARD_SCHEMES',
        'ATM_NETWORK_AT_RISK'
    ],
    'Ransomware-C2': [
        'NOTIFY_CENTRAL_BANK',
        'ACTIVATE_IR_PLAN',
        'NOTIFY_CYBER_INSURANCE'
    ],
    'Insider-Exfiltration': [
        'GDPR_REPORTABLE',
        'NOTIFY_DPO',
        'NOTIFY_HR_LEGAL'
    ],
    'API-Abuse-Banking': [
        'PCI_DSS_INCIDENT',
        'NOTIFY_FRAUD_TEAM'
    ]
}