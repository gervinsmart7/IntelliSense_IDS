import firebase_admin
from firebase_admin import credentials, firestore
import uuid
import os
from config.settings import FIREBASE_CREDENTIALS_PATH, ORG_ID

if not firebase_admin._apps:
    cred = credentials.Certificate(FIREBASE_CREDENTIALS_PATH)
    firebase_admin.initialize_app(cred)

db = firestore.client()

SEVERITY_MAP = {
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
    'BENIGN': 'none'
}

class AlertGenerator:
    def __init__(self):
        self.org_id = ORG_ID

    def get_severity(self, attack_type):
        for key in SEVERITY_MAP:
            if key.lower() in attack_type.lower():
                return SEVERITY_MAP[key]
        return 'medium'

    def generate_alerts(self, classified_df):
        if classified_df is None:
            return 0

        attacks = classified_df[
            classified_df['prediction'] != 'BENIGN'
        ]

        if len(attacks) == 0:
            print("No attacks detected in this batch")
            return 0

        alert_count = 0

        for _, flow in attacks.iterrows():
            try:
                attack_type = flow.get('prediction', 'Unknown')
                severity = self.get_severity(attack_type)

                alert = {
                    'alert_id': str(uuid.uuid4()),
                    'org_id': self.org_id,
                    'attack_type': attack_type,
                    'severity': severity,
                    'src_ip': str(flow.get(
                        'Src IP', flow.get('src_ip', 'Unknown')
                    )),
                    'dst_ip': str(flow.get(
                        'Dst IP', flow.get('dst_ip', 'Unknown')
                    )),
                    'src_port': int(flow.get(
                        'Src Port', flow.get('src_port', 0)
                    )),
                    'dst_port': int(flow.get(
                        'Dst Port', flow.get('dst_port', 0)
                    )),
                    'protocol': str(flow.get(
                        'Protocol', flow.get('protocol', 'Unknown')
                    )),
                    'confidence': float(flow.get('confidence', 0)),
                    'flow_duration': float(
                        flow.get('Flow Duration', 0)
                    ),
                    'is_dismissed': False,
                    'timestamp': firestore.SERVER_TIMESTAMP
                }

                db.collection('alerts').add(alert)
                alert_count += 1

            except Exception as e:
                print(f"Alert generation error: {e}")
                continue

        print(f"Generated {alert_count} alerts")
        return alert_count
