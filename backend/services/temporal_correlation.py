from firebase_admin import firestore
from services.firebase import get_db
from datetime import datetime, timedelta

db = get_db()

# Thresholds for low and slow detection
THRESHOLDS = {
    'failed_connections_1h': 20,
    'failed_connections_24h': 50,
    'port_scan_attempts_1h': 15,
    'repeated_alerts_1h': 10,
    'auth_failures_1h': 10,
    'auth_failures_24h': 30
}

def update_ip_activity(
    org_id: str,
    src_ip: str,
    attack_type: str,
    severity: str
):
    """
    Track cumulative activity per IP per org
    Called every time an alert is generated
    """
    try:
        ip_key = src_ip.replace('.', '_')
        doc_id = f"{org_id}_{ip_key}"

        doc_ref = db.collection('ip_activity')\
                    .document(doc_id)

        doc = doc_ref.get()
        now = datetime.utcnow()

        if doc.exists:
            data = doc.to_dict()
            events = data.get('events', [])

            # Add new event
            events.append({
                'attack_type': attack_type,
                'severity': severity,
                'timestamp': now.isoformat()
            })

            # Keep only last 7 days of events
            cutoff = now - timedelta(days=7)
            events = [
                e for e in events
                if datetime.fromisoformat(
                    e['timestamp']
                ) > cutoff
            ]

            doc_ref.update({
                'events': events,
                'last_seen': now.isoformat(),
                'total_events': len(events)
            })

        else:
            doc_ref.set({
                'org_id': org_id,
                'src_ip': src_ip,
                'events': [{
                    'attack_type': attack_type,
                    'severity': severity,
                    'timestamp': now.isoformat()
                }],
                'first_seen': now.isoformat(),
                'last_seen': now.isoformat(),
                'total_events': 1
            })

        # Check if this IP now qualifies as
        # a low-and-slow attacker
        return check_low_and_slow(
            org_id, src_ip, doc_id
        )

    except Exception as e:
        print(f"IP activity update error: {e}")
        return None


def check_low_and_slow(
    org_id: str,
    src_ip: str,
    doc_id: str
) -> dict:
    """
    Analyzes cumulative activity to detect
    low and slow attack patterns
    """
    try:
        doc = db.collection('ip_activity')\
                .document(doc_id)\
                .get()

        if not doc.exists:
            return None

        data = doc.to_dict()
        events = data.get('events', [])
        now = datetime.utcnow()

        # Count events in different time windows
        last_1h = now - timedelta(hours=1)
        last_24h = now - timedelta(hours=24)

        events_1h = [
            e for e in events
            if datetime.fromisoformat(
                e['timestamp']
            ) > last_1h
        ]
        events_24h = [
            e for e in events
            if datetime.fromisoformat(
                e['timestamp']
            ) > last_24h
        ]

        # Check for compound alert conditions
        compound_alert = None

        if len(events_24h) >= THRESHOLDS['failed_connections_24h']:
            compound_alert = {
                'type': 'LOW_AND_SLOW_ATTACK',
                'org_id': org_id,
                'src_ip': src_ip,
                'severity': 'critical',
                'description': (
                    f"Persistent attack pattern detected from "
                    f"{src_ip}. {len(events_24h)} suspicious "
                    f"events in last 24 hours. "
                    f"Low-and-slow attack suspected."
                ),
                'event_count_1h': len(events_1h),
                'event_count_24h': len(events_24h),
                'first_seen': data.get('first_seen'),
                'attack_types': list(set([
                    e['attack_type'] for e in events_24h
                ]))
            }

        elif len(events_1h) >= THRESHOLDS['failed_connections_1h']:
            compound_alert = {
                'type': 'RAPID_ATTACK_PATTERN',
                'org_id': org_id,
                'src_ip': src_ip,
                'severity': 'high',
                'description': (
                    f"Rapid attack pattern from "
                    f"{src_ip}. {len(events_1h)} "
                    f"events in last hour."
                ),
                'event_count_1h': len(events_1h),
                'event_count_24h': len(events_24h),
                'attack_types': list(set([
                    e['attack_type'] for e in events_1h
                ]))
            }

        if compound_alert:
            # Write compound alert to Firestore
            db.collection('alerts').add({
                'org_id': org_id,
                'attack_type': compound_alert['type'],
                'severity': compound_alert['severity'],
                'src_ip': src_ip,
                'dst_ip': 'Multiple',
                'dst_port': 0,
                'protocol': 'Multiple',
                'confidence': 0.95,
                'alert_status': 'new',
                'description': compound_alert['description'],
                'event_count_1h': compound_alert['event_count_1h'],
                'event_count_24h': compound_alert['event_count_24h'],
                'attack_types_observed': compound_alert.get('attack_types', []),
                'is_compound_alert': True,
                'timestamp': firestore.SERVER_TIMESTAMP
            })

            print(f"Compound alert generated for {src_ip}: {compound_alert['type']}")

        return compound_alert

    except Exception as e:
        print(f"Low and slow check error: {e}")
        return None
