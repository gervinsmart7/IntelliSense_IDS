from firebase_admin import firestore
from services.firebase import get_db
from datetime import datetime, timedelta

db = get_db()

def calculate_org_risk_score(org_id: str) -> dict:
    """
    Calculates a risk score for an organisation
    Based on multiple factors
    Returns score 0-100 and breakdown
    """
    score = 0
    factors = []

    # Factor 1 — Critical alerts in last 24 hours (max 30 pts)
    try:
        yesterday = datetime.utcnow() - timedelta(hours=24)
        alerts = db.collection('alerts').where(
            filter=firestore.FieldFilter('org_id', '==', org_id)
        ).get()

        alert_list = [a.to_dict() for a in alerts]
        critical = len([
            a for a in alert_list
            if a.get('severity') == 'critical'
        ])
        high = len([
            a for a in alert_list
            if a.get('severity') == 'high'
        ])
        unresolved = len([
            a for a in alert_list
            if a.get('alert_status', 'new') in ['new', 'investigating']
        ])

        alert_score = min(30, (critical * 10) + (high * 5))
        score += alert_score

        factors.append({
            'name': 'Recent Alerts',
            'score': alert_score,
            'max': 30,
            'detail': f"{critical} critical, {high} high, {unresolved} unresolved"
        })

    except Exception as e:
        print(f"Risk score alert factor error: {e}")

    # Factor 2 — Agent status (max 20 pts)
    try:
        org = db.collection('organisations').document(org_id).get()
        org_data = org.to_dict() if org.exists else {}

        agent_status = org_data.get('agent_status', 'offline')
        model_version = org_data.get('model_version')
        last_sync = org_data.get('last_sync')

        agent_score = 0
        agent_detail = []

        if agent_status == 'offline':
            agent_score += 15
            agent_detail.append('Agent offline')
        elif agent_status == 'not_installed':
            agent_score += 20
            agent_detail.append('Agent not installed')

        if not model_version:
            agent_score += 5
            agent_detail.append('No model deployed')

        agent_score = min(20, agent_score)
        score += agent_score

        factors.append({
            'name': 'Agent Health',
            'score': agent_score,
            'max': 20,
            'detail': ', '.join(agent_detail) if agent_detail else 'Agent healthy'
        })

    except Exception as e:
        print(f"Risk score agent factor error: {e}")

    # Factor 3 — Unresolved high severity alerts (max 25 pts)
    try:
        unresolved_high = len([
            a for a in alert_list
            if a.get('severity') in ['critical', 'high']
            and a.get('alert_status', 'new') in ['new', 'investigating']
        ])

        unresolved_score = min(25, unresolved_high * 5)
        score += unresolved_score

        factors.append({
            'name': 'Unresolved Threats',
            'score': unresolved_score,
            'max': 25,
            'detail': f"{unresolved_high} unresolved high/critical alerts"
        })

    except Exception as e:
        print(f"Risk score unresolved factor error: {e}")

    # Factor 4 — Attack frequency trend (max 25 pts)
    try:
        week_ago = datetime.utcnow() - timedelta(days=7)
        two_weeks_ago = datetime.utcnow() - timedelta(days=14)

        recent_attacks = len([
            a for a in alert_list
            if a.get('attack_type') != 'BENIGN'
        ])

        trend_score = min(25, recent_attacks * 2)
        score += trend_score

        factors.append({
            'name': 'Attack Frequency',
            'score': trend_score,
            'max': 25,
            'detail': f"{recent_attacks} attacks detected recently"
        })

    except Exception as e:
        print(f"Risk score trend factor error: {e}")

    # Determine risk level
    if score >= 70:
        level = 'critical'
        color = '#F87171'
    elif score >= 45:
        level = 'high'
        color = '#FBBF24'
    elif score >= 20:
        level = 'medium'
        color = '#6366F1'
    else:
        level = 'low'
        color = '#34D399'

    return {
        'org_id': org_id,
        'score': min(100, score),
        'level': level,
        'color': color,
        'factors': factors,
        'calculated_at': datetime.utcnow().isoformat()
    }


def get_all_org_risk_scores() -> list:
    """
    Calculates risk scores for all organisations
    Returns sorted list highest risk first
    """
    try:
        orgs = db.collection('organisations').where(
            filter=firestore.FieldFilter('status', '==', 'active')
        ).get()

        scores = []
        for org in orgs:
            org_data = org.to_dict()
            risk = calculate_org_risk_score(org_data['org_id'])
            risk['org_name'] = org_data.get('name', '')
            risk['org_code'] = org_data.get('org_code', '')
            scores.append(risk)

        scores.sort(key=lambda x: x['score'], reverse=True)
        return scores

    except Exception as e:
        print(f"Get all risk scores error: {e}")
        return []
