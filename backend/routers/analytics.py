from services.risk import calculate_org_risk_score, get_all_org_risk_scores
from fastapi import APIRouter, HTTPException, Depends
from firebase_admin import firestore
from services.firebase import get_db
from services.auth import get_current_admin
from datetime import datetime, timedelta
import boto3
import os

router = APIRouter(prefix="/api/analytics", tags=["Analytics"])
db = get_db()

def get_org_filter(current_admin: dict, org_id: str = None):
    """
    Returns org_id to filter by based on role
    Org admin can only see their own org
    """
    if current_admin['role'] == 'org_admin':
        return current_admin['org_id']
    return org_id

@router.get("/overview")
async def get_overview(
    current_admin: dict = Depends(get_current_admin)
):
    """
    Returns platform overview stats
    """
    try:
        # Get organisations
        if current_admin['role'] == 'org_admin':
            orgs = db.collection('organisations').where(
                filter=firestore.FieldFilter(
                    'org_id', '==', current_admin['org_id']
                )
            ).get()
        else:
            orgs = db.collection('organisations').get()

        org_list = [o.to_dict() for o in orgs]

        online_agents = len([
            o for o in org_list
            if o.get('agent_status') == 'online'
        ])

        # Get alerts
        if current_admin['role'] == 'org_admin':
            alerts = db.collection('alerts').where(
                filter=firestore.FieldFilter(
                    'org_id', '==', current_admin['org_id']
                )
            ).get()
        else:
            alerts = db.collection('alerts').get()

        alert_list = [a.to_dict() for a in alerts]

        critical = len([
            a for a in alert_list
            if a.get('severity') == 'critical'
        ])

        # Get production model
        models = db.collection('model_versions').where(
            filter=firestore.FieldFilter('is_production', '==', True)
        ).get()

        model_data = models[0].to_dict() if models else None

        return {
            "status": "success",
            "data": {
                "total_organisations": len(org_list),
                "online_agents": online_agents,
                "total_alerts": len(alert_list),
                "critical_alerts": critical,
                "model_version": model_data.get('version') if model_data else None,
                "model_f1": model_data.get('f1_score') if model_data else None
            }
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/traffic/{org_id}")
async def get_traffic(
    org_id: str,
    period: str = "7d",
    current_admin: dict = Depends(get_current_admin)
):
    try:
        if current_admin['role'] == 'org_admin':
            if current_admin['org_id'] != org_id:
                raise HTTPException(
                    status_code=403,
                    detail="Access denied"
                )

        days = 7 if period == "7d" else 30

        # Build day buckets for last N days
        daily_data = {}
        for i in range(days - 1, -1, -1):
            day = datetime.utcnow() - timedelta(days=i)
            key = day.strftime('%Y-%m-%d')
            daily_data[key] = {
                'day': day.strftime('%a'),
                'date': key,
                'attack': 0,
                'benign': 0
            }

        # Query alerts
        try:
            if org_id == 'all':
                alerts = db.collection('alerts').get()
            else:
                alerts = db.collection('alerts').where(
                    filter=firestore.FieldFilter(
                        'org_id', '==', org_id
                    )
                ).get()

            for alert in alerts:
                data = alert.to_dict()
                ts = data.get('timestamp')
                if ts:
                    try:
                        if hasattr(ts, 'strftime'):
                            date_key = ts.strftime('%Y-%m-%d')
                        else:
                            date_key = ts.date().strftime('%Y-%m-%d')

                        if date_key in daily_data:
                            if data.get('attack_type') == 'BENIGN':
                                daily_data[date_key]['benign'] += 1
                            else:
                                daily_data[date_key]['attack'] += 1
                    except Exception:
                        pass

        except Exception as e:
            print(f"Traffic query error: {e}")

        result = list(daily_data.values())

        return {
            "status": "success",
            "data": result
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
        
        
@router.get("/attack-types/{org_id}")
async def get_attack_types(
    org_id: str,
    current_admin: dict = Depends(get_current_admin)
):
    """
    Returns attack type distribution
    """
    try:
        if current_admin['role'] == 'org_admin':
            if current_admin['org_id'] != org_id:
                raise HTTPException(status_code=403, detail="Access denied")

        query = db.collection('alerts')

        if org_id != 'all':
            query = query.where(
                filter=firestore.FieldFilter('org_id', '==', org_id)
            )

        alerts = query.get()

        attack_counts = {}
        for alert in alerts:
            data = alert.to_dict()
            attack_type = data.get('attack_type', 'Unknown')
            if attack_type != 'BENIGN':
                attack_counts[attack_type] = (
                    attack_counts.get(attack_type, 0) + 1
                )

        total = sum(attack_counts.values()) or 1
        result = [
            {
                'name': k,
                'value': round((v / total) * 100, 1),
                'count': v
            }
            for k, v in sorted(
                attack_counts.items(),
                key=lambda x: x[1],
                reverse=True
            )[:6]
        ]

        return {"status": "success", "data": result}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/severity/{org_id}")
async def get_severity_breakdown(
    org_id: str,
    current_admin: dict = Depends(get_current_admin)
):
    """
    Returns severity breakdown
    """
    try:
        if current_admin['role'] == 'org_admin':
            if current_admin['org_id'] != org_id:
                raise HTTPException(status_code=403, detail="Access denied")

        query = db.collection('alerts')
        if org_id != 'all':
            query = query.where(
                filter=firestore.FieldFilter('org_id', '==', org_id)
            )

        alerts = query.get()

        counts = {
            'critical': 0,
            'high': 0,
            'medium': 0,
            'low': 0
        }

        for alert in alerts:
            severity = alert.to_dict().get('severity', 'low')
            if severity in counts:
                counts[severity] += 1

        return {"status": "success", "data": counts}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/top-ips/{org_id}")
async def get_top_ips(
    org_id: str,
    current_admin: dict = Depends(get_current_admin)
):
    """
    Returns top attack source IPs
    """
    try:
        if current_admin['role'] == 'org_admin':
            if current_admin['org_id'] != org_id:
                raise HTTPException(status_code=403, detail="Access denied")

        query = db.collection('alerts')
        if org_id != 'all':
            query = query.where(
                filter=firestore.FieldFilter('org_id', '==', org_id)
            )

        alerts = query.get()

        ip_counts = {}
        for alert in alerts:
            data = alert.to_dict()
            if data.get('attack_type') != 'BENIGN':
                src_ip = data.get('src_ip', 'Unknown')
                ip_counts[src_ip] = ip_counts.get(src_ip, 0) + 1

        result = [
            {'ip': k, 'count': v}
            for k, v in sorted(
                ip_counts.items(),
                key=lambda x: x[1],
                reverse=True
            )[:10]
        ]

        return {"status": "success", "data": result}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/top-ports/{org_id}")
async def get_top_ports(
    org_id: str,
    current_admin: dict = Depends(get_current_admin)
):
    """
    Returns top targeted destination ports
    """
    try:
        if current_admin['role'] == 'org_admin':
            if current_admin['org_id'] != org_id:
                raise HTTPException(status_code=403, detail="Access denied")

        query = db.collection('alerts')
        if org_id != 'all':
            query = query.where(
                filter=firestore.FieldFilter('org_id', '==', org_id)
            )

        alerts = query.get()

        port_counts = {}
        for alert in alerts:
            data = alert.to_dict()
            if data.get('attack_type') != 'BENIGN':
                port = str(data.get('dst_port', 'Unknown'))
                port_counts[port] = port_counts.get(port, 0) + 1

        result = [
            {'port': k, 'count': v}
            for k, v in sorted(
                port_counts.items(),
                key=lambda x: x[1],
                reverse=True
            )[:10]
        ]

        return {"status": "success", "data": result}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/global")
async def get_global_analytics(
    current_admin: dict = Depends(get_current_admin)
):
    """
    Returns global analytics across all orgs
    Super Admin and Platform Admin only
    """
    if current_admin['role'] == 'org_admin':
        raise HTTPException(
            status_code=403,
            detail="Access denied"
        )

    try:
        orgs = db.collection('organisations').get()
        alerts = db.collection('alerts').get()

        org_list = [o.to_dict() for o in orgs]
        alert_list = [a.to_dict() for a in alerts]

        # Per org stats
        org_stats = {}
        for org in org_list:
            org_id = org.get('org_id')
            org_stats[org_id] = {
                'name': org.get('name'),
                'org_code': org.get('org_code'),
                'agent_status': org.get('agent_status'),
                'model_version': org.get('model_version'),
                'alert_count': 0,
                'attack_count': 0
            }

        for alert in alert_list:
            data = alert.to_dict()
            org_id = data.get('org_id')
            if org_id in org_stats:
                org_stats[org_id]['alert_count'] += 1
                if data.get('attack_type') != 'BENIGN':
                    org_stats[org_id]['attack_count'] += 1

        return {
            "status": "success",
            "data": {
                "org_stats": list(org_stats.values()),
                "total_alerts": len(alert_list),
                "total_orgs": len(org_list)
            }
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/risk/{org_id}")
async def get_org_risk_score(
    org_id: str,
    current_admin: dict = Depends(get_current_admin)
):
    """
    Returns risk score for a specific organisation
    """
    if current_admin['role'] == 'org_admin':
        if current_admin['org_id'] != org_id:
            raise HTTPException(
                status_code=403,
                detail="Access denied"
            )

    try:
        score = calculate_org_risk_score(org_id)
        return {"status": "success", "data": score}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/risk-ranking")
async def get_risk_ranking(
    current_admin: dict = Depends(get_current_admin)
):
    """
    Returns all orgs ranked by risk score
    Super Admin and Platform Admin only
    """
    if current_admin['role'] == 'org_admin':
        raise HTTPException(
            status_code=403,
            detail="Access denied"
        )

    try:
        scores = get_all_org_risk_scores()
        return {"status": "success", "data": scores}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
