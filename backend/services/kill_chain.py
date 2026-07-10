from firebase_admin import firestore
from services.firebase import get_db
from datetime import datetime, timedelta

db = get_db()

# MITRE ATT&CK Finance-specific kill chain patterns
FINANCE_KILL_CHAINS = [
    {
        'name': 'Banking System Compromise',
        'description': (
            'Classic attack progression targeting '
            'core banking systems'
        ),
        'severity': 'critical',
        'steps': [
            'Port-Scan-Financial',
            'Credential-Stuffing',
            'API-Abuse-Banking'
        ],
        'time_window_hours': 24,
        'mitre_tactic': 'Initial Access → Credential Access → Impact'
    },
    {
        'name': 'Financial Data Exfiltration Campaign',
        'description': (
            'Multi-stage attack to steal customer '
            'financial data'
        ),
        'severity': 'critical',
        'steps': [
            'Port-Scan-Financial',
            'Credential-Stuffing',
            'Data-Exfiltration'
        ],
        'time_window_hours': 48,
        'mitre_tactic': 'Reconnaissance → Initial Access → Exfiltration'
    },
    {
        'name': 'Ransomware Deployment Pattern',
        'description': (
            'Attack sequence leading to '
            'ransomware deployment on bank infrastructure'
        ),
        'severity': 'critical',
        'steps': [
            'Port-Scan-Financial',
            'Credential-Stuffing',
            'Ransomware-C2'
        ],
        'time_window_hours': 72,
        'mitre_tactic': 'Reconnaissance → Initial Access → Impact'
    },
    {
        'name': 'ATM Network Attack',
        'description': (
            'Coordinated attack against '
            'ATM and POS infrastructure'
        ),
        'severity': 'critical',
        'steps': [
            'Port-Scan-Financial',
            'Card-Skim-Probe'
        ],
        'time_window_hours': 6,
        'mitre_tactic': 'Reconnaissance → Collection'
    },
    {
        'name': 'Insider Threat Pattern',
        'description': (
            'Suspicious insider activity '
            'combined with data exfiltration'
        ),
        'severity': 'high',
        'steps': [
            'Insider-Exfiltration',
            'Data-Exfiltration'
        ],
        'time_window_hours': 24,
        'mitre_tactic': 'Collection → Exfiltration'
    },
    {
        'name': 'Cryptojacking Campaign',
        'description': (
            'Resource hijacking of bank servers '
            'for cryptocurrency mining'
        ),
        'severity': 'high',
        'steps': [
            'Port-Scan-Financial',
            'Credential-Stuffing',
            'Cryptojacking'
        ],
        'time_window_hours': 48,
        'mitre_tactic': 'Reconnaissance → Initial Access → Impact'
    }
]


def check_kill_chain(org_id: str) -> list:
    """
    Checks if recent alerts match any known
    finance-sector kill chain patterns

    Returns list of matched patterns
    with compound alerts generated
    """
    matched_chains = []

    for chain in FINANCE_KILL_CHAINS:
        match = detect_chain_pattern(
            org_id,
            chain
        )
        if match:
            matched_chains.append(match)
            generate_kill_chain_alert(
                org_id, chain, match
            )

    return matched_chains


def detect_chain_pattern(
    org_id: str,
    chain: dict
) -> dict:
    """
    Looks for a specific kill chain pattern
    in recent alerts for this org
    """
    try:
        time_window = chain['time_window_hours']
        cutoff = datetime.utcnow() - timedelta(
            hours=time_window
        )

        # Get recent alerts for this org
        alerts = db.collection('alerts')\
                   .where(
                       filter=firestore.FieldFilter(
                           'org_id', '==', org_id
                       )
                   )\
                   .get()

        alert_list = []
        for a in alerts:
            data = a.to_dict()
            ts = data.get('timestamp')
            if ts:
                try:
                    if hasattr(ts, 'replace'):
                        alert_ts = ts
                    else:
                        alert_ts = ts
                    alert_list.append({
                        'attack_type': data.get('attack_type'),
                        'src_ip': data.get('src_ip'),
                        'timestamp': ts
                    })
                except Exception:
                    pass

        if not alert_list:
            return None

        # Check if all steps in chain are present
        observed_types = set([
            a['attack_type'] for a in alert_list
        ])

        chain_steps = set(chain['steps'])
        matched_steps = chain_steps.intersection(
            observed_types
        )

        # Need at least 2 steps to trigger
        if len(matched_steps) >= min(2, len(chain_steps)):
            completion = len(matched_steps) / len(chain_steps)

            return {
                'chain_name': chain['name'],
                'matched_steps': list(matched_steps),
                'total_steps': len(chain_steps),
                'completion_percent': completion * 100,
                'severity': chain['severity'],
                'description': chain['description'],
                'mitre_tactic': chain['mitre_tactic'],
                'time_window_hours': time_window
            }

        return None

    except Exception as e:
        print(f"Kill chain detection error: {e}")
        return None


def generate_kill_chain_alert(
    org_id: str,
    chain: dict,
    match: dict
):
    """
    Creates a compound kill chain alert
    in Firestore
    """
    try:
        # Check if we already created this alert recently
        existing = db.collection('alerts')\
                     .where(
                         filter=firestore.FieldFilter(
                             'org_id', '==', org_id
                         )
                     )\
                     .where(
                         filter=firestore.FieldFilter(
                             'attack_type', '==',
                             'KILL_CHAIN_' + chain['name'].upper().replace(' ', '_')
                         )
                     )\
                     .limit(1)\
                     .get()

        if existing:
            return

        db.collection('alerts').add({
            'org_id': org_id,
            'attack_type': (
                'KILL_CHAIN_' +
                chain['name'].upper().replace(' ', '_')
            ),
            'severity': chain['severity'],
            'src_ip': 'Multiple',
            'dst_ip': 'Multiple',
            'dst_port': 0,
            'protocol': 'Multiple',
            'confidence': 0.95,
            'alert_status': 'new',
            'description': (
                f"KILL CHAIN DETECTED: {chain['name']}. "
                f"{match['completion_percent']:.0f}% complete. "
                f"Steps observed: {', '.join(match['matched_steps'])}. "
                f"{chain['description']}"
            ),
            'mitre_tactic': chain['mitre_tactic'],
            'matched_steps': match['matched_steps'],
            'completion_percent': match['completion_percent'],
            'is_kill_chain_alert': True,
            'kill_chain_name': chain['name'],
            'timestamp': firestore.SERVER_TIMESTAMP
        })

        print(f"Kill chain alert: {chain['name']} for {org_id}")

    except Exception as e:
        print(f"Kill chain alert error: {e}")
