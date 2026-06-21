from fastapi import APIRouter, HTTPException, Request, Depends
from firebase_admin import firestore
from services.firebase import get_db
from services.auth import get_current_admin
from services.audit import log_action
from pydantic import BaseModel
from typing import Optional
import uuid

router = APIRouter(prefix="/api/alerts", tags=["Alerts"])
db = get_db()

class UpdateAlertStatusRequest(BaseModel):
    status: str
    note: Optional[str] = None

class CreateAlertFeedbackRequest(BaseModel):
    alert_id: str
    is_false_positive: bool
    note: Optional[str] = None

@router.get("")
async def get_alerts(
    org_id: Optional[str] = None,
    severity: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = 200,
    current_admin: dict = Depends(get_current_admin)
):
    try:
        query = db.collection('alerts')

        # Org admin sees only their own
        if current_admin['role'] == 'org_admin':
            query = query.where(
                filter=firestore.FieldFilter(
                    'org_id', '==', current_admin['org_id']
                )
            )
        elif org_id and org_id != 'all':
            query = query.where(
                filter=firestore.FieldFilter(
                    'org_id', '==', org_id
                )
            )

        alerts = query.limit(limit).get()
        result = []

        for alert in alerts:
            data = alert.to_dict()
            data['id'] = alert.id

            # Apply filters
            if severity and data.get('severity') != severity:
                continue
            if status and data.get('alert_status', 'new') != status:
                continue

            result.append(data)

        # Sort by timestamp desc
        result.sort(
            key=lambda x: x.get('timestamp') or '',
            reverse=True
        )

        return {
            "status": "success",
            "data": result,
            "total": len(result)
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{alert_id}")
async def get_alert_detail(
    alert_id: str,
    current_admin: dict = Depends(get_current_admin)
):
    try:
        alert_doc = db.collection('alerts').document(alert_id).get()

        if not alert_doc.exists:
            raise HTTPException(
                status_code=404,
                detail="Alert not found"
            )

        data = alert_doc.to_dict()
        data['id'] = alert_doc.id

        # Org admin can only see their own
        if current_admin['role'] == 'org_admin':
            if data.get('org_id') != current_admin['org_id']:
                raise HTTPException(
                    status_code=403,
                    detail="Access denied"
                )

        # Get timeline
        timeline = db.collection('alerts')\
                     .document(alert_id)\
                     .collection('timeline')\
                     .order_by('timestamp')\
                     .get()

        data['timeline'] = [t.to_dict() for t in timeline]

        # Get MITRE mapping
        data['mitre'] = get_mitre_mapping(data.get('attack_type', ''))

        # Get remediation
        data['remediation'] = get_remediation(data.get('attack_type', ''))

        return {"status": "success", "data": data}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{alert_id}/status")
async def update_alert_status(
    alert_id: str,
    payload: UpdateAlertStatusRequest,
    request: Request,
    current_admin: dict = Depends(get_current_admin)
):
    valid_statuses = [
        'new', 'investigating',
        'resolved', 'false_positive'
    ]

    if payload.status not in valid_statuses:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid status. Must be one of: {valid_statuses}"
        )

    try:
        alert_doc = db.collection('alerts').document(alert_id).get()

        if not alert_doc.exists:
            raise HTTPException(
                status_code=404,
                detail="Alert not found"
            )

        alert_data = alert_doc.to_dict()

        # Org admin can only update their own
        if current_admin['role'] == 'org_admin':
            if alert_data.get('org_id') != current_admin['org_id']:
                raise HTTPException(
                    status_code=403,
                    detail="Access denied"
                )

        old_status = alert_data.get('alert_status', 'new')

        # Update alert status
        db.collection('alerts').document(alert_id).update({
            'alert_status': payload.status,
            'updated_at': firestore.SERVER_TIMESTAMP,
            'updated_by': current_admin['admin_id']
        })

        # Add timeline entry
        db.collection('alerts')\
          .document(alert_id)\
          .collection('timeline')\
          .add({
              'action': 'status_changed',
              'from_status': old_status,
              'to_status': payload.status,
              'note': payload.note or '',
              'admin_id': current_admin['admin_id'],
              'admin_email': current_admin['email'],
              'timestamp': firestore.SERVER_TIMESTAMP
          })

        # If marked false positive log it for retraining
        if payload.status == 'false_positive':
            db.collection('false_positives').add({
                'alert_id': alert_id,
                'org_id': alert_data.get('org_id'),
                'attack_type': alert_data.get('attack_type'),
                'src_ip': alert_data.get('src_ip'),
                'dst_port': alert_data.get('dst_port'),
                'protocol': alert_data.get('protocol'),
                'confidence': alert_data.get('confidence'),
                'reported_by': current_admin['admin_id'],
                'timestamp': firestore.SERVER_TIMESTAMP
            })

        log_action(
            admin_id=current_admin['admin_id'],
            admin_email=current_admin['email'],
            admin_role=current_admin['role'],
            action_type='ALERT_STATUS_UPDATED',
            action_detail=f"Alert {alert_id} status: {old_status} → {payload.status}",
            ip_address=request.client.host,
            status='success'
        )

        return {
            "status": "success",
            "message": f"Alert status updated to {payload.status}"
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{alert_id}/feedback")
async def submit_false_positive_feedback(
    alert_id: str,
    payload: CreateAlertFeedbackRequest,
    request: Request,
    current_admin: dict = Depends(get_current_admin)
):
    try:
        alert_doc = db.collection('alerts').document(alert_id).get()

        if not alert_doc.exists:
            raise HTTPException(
                status_code=404,
                detail="Alert not found"
            )

        alert_data = alert_doc.to_dict()

        if current_admin['role'] == 'org_admin':
            if alert_data.get('org_id') != current_admin['org_id']:
                raise HTTPException(
                    status_code=403,
                    detail="Access denied"
                )

        db.collection('model_feedback').add({
            'alert_id': alert_id,
            'org_id': alert_data.get('org_id'),
            'attack_type': alert_data.get('attack_type'),
            'is_false_positive': payload.is_false_positive,
            'note': payload.note or '',
            'reported_by': current_admin['admin_id'],
            'timestamp': firestore.SERVER_TIMESTAMP
        })

        if payload.is_false_positive:
            db.collection('alerts').document(alert_id).update({
                'alert_status': 'false_positive',
                'updated_at': firestore.SERVER_TIMESTAMP
            })

        return {
            "status": "success",
            "message": "Feedback submitted. Thank you for improving the model."
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def get_mitre_mapping(attack_type: str) -> dict:
    """
    Maps attack types to MITRE ATT&CK
    """
    mappings = {
        'DDoS': {
            'id': 'T1498',
            'name': 'Network Denial of Service',
            'tactic': 'Impact',
            'url': 'https://attack.mitre.org/techniques/T1498'
        },
        'DoS': {
            'id': 'T1499',
            'name': 'Endpoint Denial of Service',
            'tactic': 'Impact',
            'url': 'https://attack.mitre.org/techniques/T1499'
        },
        'DoS Hulk': {
            'id': 'T1499',
            'name': 'Endpoint Denial of Service',
            'tactic': 'Impact',
            'url': 'https://attack.mitre.org/techniques/T1499'
        },
        'DoS GoldenEye': {
            'id': 'T1499',
            'name': 'Endpoint Denial of Service',
            'tactic': 'Impact',
            'url': 'https://attack.mitre.org/techniques/T1499'
        },
        'DoS slowloris': {
            'id': 'T1499.001',
            'name': 'OS Exhaustion Flood',
            'tactic': 'Impact',
            'url': 'https://attack.mitre.org/techniques/T1499/001'
        },
        'PortScan': {
            'id': 'T1046',
            'name': 'Network Service Discovery',
            'tactic': 'Discovery',
            'url': 'https://attack.mitre.org/techniques/T1046'
        },
        'FTP-Patator': {
            'id': 'T1110.001',
            'name': 'Password Guessing',
            'tactic': 'Credential Access',
            'url': 'https://attack.mitre.org/techniques/T1110/001'
        },
        'SSH-Patator': {
            'id': 'T1110.001',
            'name': 'Password Guessing',
            'tactic': 'Credential Access',
            'url': 'https://attack.mitre.org/techniques/T1110/001'
        },
        'Bot': {
            'id': 'T1587.001',
            'name': 'Malware Development',
            'tactic': 'Resource Development',
            'url': 'https://attack.mitre.org/techniques/T1587/001'
        },
        'Web Attack XSS': {
            'id': 'T1059.007',
            'name': 'JavaScript Execution',
            'tactic': 'Execution',
            'url': 'https://attack.mitre.org/techniques/T1059/007'
        },
        'Web Attack SQL Injection': {
            'id': 'T1190',
            'name': 'Exploit Public-Facing Application',
            'tactic': 'Initial Access',
            'url': 'https://attack.mitre.org/techniques/T1190'
        },
        'Web Attack Brute Force': {
            'id': 'T1110',
            'name': 'Brute Force',
            'tactic': 'Credential Access',
            'url': 'https://attack.mitre.org/techniques/T1110'
        },
        'Infiltration': {
            'id': 'T1078',
            'name': 'Valid Accounts',
            'tactic': 'Defense Evasion',
            'url': 'https://attack.mitre.org/techniques/T1078'
        },
        'Heartbleed': {
            'id': 'T1203',
            'name': 'Exploitation for Client Execution',
            'tactic': 'Execution',
            'url': 'https://attack.mitre.org/techniques/T1203'
        }
    }

    for key in mappings:
        if key.lower() in attack_type.lower():
            return mappings[key]

    return {
        'id': 'T0000',
        'name': 'Unknown Technique',
        'tactic': 'Unknown',
        'url': 'https://attack.mitre.org'
    }


def get_remediation(attack_type: str) -> list:
    """
    Returns remediation steps per attack type
    """
    remediations = {
        'DDoS': [
            'Enable rate limiting on your firewall',
            'Contact your ISP to filter upstream traffic',
            'Configure traffic scrubbing or a DDoS protection service',
            'Block the attacking IP ranges at the network perimeter',
            'Consider a CDN with built-in DDoS protection'
        ],
        'DoS': [
            'Enable rate limiting on the targeted service',
            'Block the source IP at the firewall',
            'Review and patch the targeted service',
            'Consider load balancing to distribute traffic'
        ],
        'PortScan': [
            'Block the scanning IP at the firewall immediately',
            'Review which services are exposed to the internet',
            'Close unnecessary open ports',
            'Enable port scan detection on your IDS',
            'Investigate whether the scan preceded an attack'
        ],
        'FTP-Patator': [
            'Disable FTP and use SFTP instead',
            'Implement account lockout after failed attempts',
            'Block the attacking IP at the firewall',
            'Enable multi-factor authentication on FTP',
            'Review FTP access logs for successful logins'
        ],
        'SSH-Patator': [
            'Block the attacking IP immediately',
            'Disable password authentication and use SSH keys only',
            'Change SSH port from default 22',
            'Install and configure fail2ban',
            'Enable multi-factor authentication for SSH'
        ],
        'Web Attack SQL Injection': [
            'Patch the vulnerable web application immediately',
            'Use parameterised queries in all database calls',
            'Enable a Web Application Firewall',
            'Review database access logs for data exfiltration',
            'Audit all user input validation in the application'
        ],
        'Web Attack XSS': [
            'Enable Content Security Policy headers',
            'Sanitise all user inputs in the web application',
            'Enable XSS protection headers',
            'Review and patch the vulnerable endpoint',
            'Audit all output encoding in the application'
        ],
        'Bot': [
            'Block the bot source IPs at the firewall',
            'Enable CAPTCHA on public-facing forms',
            'Review access logs for automated patterns',
            'Implement rate limiting on APIs',
            'Monitor for unusual account activity'
        ]
    }

    for key in remediations:
        if key.lower() in attack_type.lower():
            return remediations[key]

    return [
        'Investigate the source IP address',
        'Review related log entries for context',
        'Block suspicious traffic at the firewall',
        'Escalate to your security team if needed'
    ]
