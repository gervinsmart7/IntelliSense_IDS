from firebase_admin import firestore
from services.firebase import get_db
from datetime import datetime, timedelta

db = get_db()

# Finance-sensitive ports for risk weighting
FINANCE_CRITICAL_PORTS = [1433, 1521, 3306, 5432, 27017, 6379]
FINANCE_HIGH_RISK_PORTS = [443, 8443, 3389, 5900, 4789, 9000]

def calculate_org_risk_score(org_id: str) -> dict:
    """
    Finance-aware risk scoring

    Factors:
    1. Critical/high alerts (30pts)
    2. Agent health and model currency (20pts)
    3. Unresolved high severity alerts (20pts)
    4. Attack frequency trend (15pts)
    5. Financial system targeting (15pts) NEW
       Were attacks hitting core banking ports?
    """
    score = 0
    factors = []

    # Fetch all alerts for this org once
    # to avoid multiple Firestore reads
    alert_list = []
    try:
        alerts = db.collection('alerts').where(
            filter=firestore.FieldFilter(
                'org_id', '==', org_id
            )
        ).get()
        alert_list = [a.to_dict() for a in alerts]
    except Exception as e:
        print(f"Risk score alert fetch error: {e}")

    # ─────────────────────────────────────
    # Factor 1 — Recent Alerts (30pts)
    # ─────────────────────────────────────
    try:
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
            if a.get('alert_status', 'new')
            in ['new', 'investigating']
        ])

        alert_score = min(30, (critical * 10) + (high * 5))
        score += alert_score

        factors.append({
            'name': 'Recent Alerts',
            'score': alert_score,
            'max': 30,
            'detail': (
                f"{critical} critical, "
                f"{high} high, "
                f"{unresolved} unresolved"
            )
        })

    except Exception as e:
        print(f"Risk factor 1 error: {e}")

    # ─────────────────────────────────────
    # Factor 2 — Agent Health (20pts)
    # ─────────────────────────────────────
    try:
        org_doc = db.collection('organisations')\
                    .document(org_id).get()
        org_data = org_doc.to_dict() if org_doc.exists else {}

        agent_status = org_data.get('agent_status', 'offline')
        model_version = org_data.get('model_version')
        last_sync = org_data.get('last_sync')

        agent_score = 0
        agent_detail = []

        if agent_status == 'offline':
            agent_score += 12
            agent_detail.append('Agent offline')
        elif agent_status == 'not_installed':
            agent_score += 20
            agent_detail.append('Agent not installed')

        if not model_version:
            agent_score += 5
            agent_detail.append('No model deployed')
        else:
            # Check model staleness
            # Model older than 14 days adds risk
            model_docs = db.collection('model_versions')\
                           .where(
                               filter=firestore.FieldFilter(
                                   'version', '==', model_version
                               )
                           ).get()

            if model_docs:
                model_data = model_docs[0].to_dict()
                trained_at = model_data.get('trained_at')
                if trained_at:
                    try:
                        if hasattr(trained_at, 'replace'):
                            age_days = (
                                datetime.utcnow() -
                                trained_at.replace(tzinfo=None)
                            ).days
                            if age_days > 30:
                                agent_score += 5
                                agent_detail.append(
                                    f'Model {age_days} days old'
                                )
                    except Exception:
                        pass

        agent_score = min(20, agent_score)
        score += agent_score

        factors.append({
            'name': 'Agent Health',
            'score': agent_score,
            'max': 20,
            'detail': (
                ', '.join(agent_detail)
                if agent_detail
                else 'Agent healthy, model current'
            )
        })

    except Exception as e:
        print(f"Risk factor 2 error: {e}")

    # ─────────────────────────────────────
    # Factor 3 — Unresolved Threats (20pts)
    # ─────────────────────────────────────
    try:
        unresolved_high = len([
            a for a in alert_list
            if a.get('severity') in ['critical', 'high']
            and a.get('alert_status', 'new')
            in ['new', 'investigating']
        ])

        unresolved_score = min(20, unresolved_high * 4)
        score += unresolved_score

        factors.append({
            'name': 'Unresolved Threats',
            'score': unresolved_score,
            'max': 20,
            'detail': (
                f"{unresolved_high} unresolved "
                f"high/critical alerts"
            )
        })

    except Exception as e:
        print(f"Risk factor 3 error: {e}")

    # ─────────────────────────────────────
    # Factor 4 — Attack Frequency (15pts)
    # ─────────────────────────────────────
    try:
        recent_attacks = len([
            a for a in alert_list
            if a.get('attack_type') != 'BENIGN'
        ])

        trend_score = min(15, recent_attacks * 1)
        score += trend_score

        factors.append({
            'name': 'Attack Frequency',
            'score': trend_score,
            'max': 15,
            'detail': (
                f"{recent_attacks} attacks detected recently"
            )
        })

    except Exception as e:
        print(f"Risk factor 4 error: {e}")

    # ─────────────────────────────────────
    # Factor 5 — Financial System Targeting (15pts)
    # NEW — Finance sector specific
    # Were attacks hitting core banking systems?
    # ─────────────────────────────────────
    try:
        critical_port_attacks = len([
            a for a in alert_list
            if a.get('dst_port') in FINANCE_CRITICAL_PORTS
            and a.get('attack_type') != 'BENIGN'
        ])
        high_port_attacks = len([
            a for a in alert_list
            if a.get('dst_port') in FINANCE_HIGH_RISK_PORTS
            and a.get('attack_type') != 'BENIGN'
        ])
        regulatory_alerts = len([
            a for a in alert_list
            if a.get('regulatory_flags')
            and len(a.get('regulatory_flags', [])) > 0
        ])

        finance_score = min(
            15,
            (critical_port_attacks * 5) +
            (high_port_attacks * 2) +
            (regulatory_alerts * 3)
        )
        score += finance_score

        finance_detail_parts = []
        if critical_port_attacks:
            finance_detail_parts.append(
                f"{critical_port_attacks} attacks on core banking ports"
            )
        if high_port_attacks:
            finance_detail_parts.append(
                f"{high_port_attacks} attacks on high-risk ports"
            )
        if regulatory_alerts:
            finance_detail_parts.append(
                f"{regulatory_alerts} regulatory-flagged alerts"
            )

        factors.append({
            'name': 'Financial System Risk',
            'score': finance_score,
            'max': 15,
            'detail': (
                ', '.join(finance_detail_parts)
                if finance_detail_parts
                else 'No financial system targeting detected'
            )
        })

    except Exception as e:
        print(f"Risk factor 5 error: {e}")

    # ─────────────────────────────────────
    # Determine risk level and financial context
    # ─────────────────────────────────────
    final_score = min(100, score)

    if final_score >= 70:
        level = 'critical'
        color = '#F87171'
        financial_context = (
            'Immediate action required. '
            'Core banking systems may be at risk.'
        )
    elif final_score >= 45:
        level = 'high'
        color = '#FBBF24'
        financial_context = (
            'Significant risk. '
            'Review all unresolved alerts urgently.'
        )
    elif final_score >= 20:
        level = 'medium'
        color = '#6366F1'
        financial_context = (
            'Moderate risk. '
            'Monitor situation and resolve open alerts.'
        )
    else:
        level = 'low'
        color = '#34D399'
        financial_context = (
            'Low risk. '
            'Continue routine monitoring.'
        )

    return {
        'org_id': org_id,
        'score': final_score,
        'level': level,
        'color': color,
        'financial_context': financial_context,
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
            filter=firestore.FieldFilter(
                'status', '==', 'active'
            )
        ).get()

        scores = []
        for org in orgs:
            org_data = org.to_dict()
            org_id = org_data.get('org_id')
            if not org_id:
                continue

            risk = calculate_org_risk_score(org_id)
            risk['org_name'] = org_data.get('name', '')
            risk['org_code'] = org_data.get('org_code', '')
            scores.append(risk)

        scores.sort(key=lambda x: x['score'], reverse=True)
        return scores

    except Exception as e:
        print(f"Get all risk scores error: {e}")
        return []