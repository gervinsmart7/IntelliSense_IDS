from fastapi import APIRouter, HTTPException, Request, Depends
from firebase_admin import firestore
from services.firebase import get_db
from services.auth import get_current_admin, get_agent_org
from services.audit import log_action
from pydantic import BaseModel
from typing import Optional, List
from services.temporal_correlation import update_ip_activity
from services.ip_reputation import check_ip_reputation
import uuid

router = APIRouter(prefix="/api/alerts", tags=["Alerts"])
db = get_db()

# ─────────────────────────────────────────
# Request Models
# ─────────────────────────────────────────

class UpdateAlertStatusRequest(BaseModel):
    status: str
    note: Optional[str] = None

class CreateAlertFeedbackRequest(BaseModel):
    alert_id: str
    is_false_positive: bool
    note: Optional[str] = None

class IngestAlertRequest(BaseModel):
    alert_id: Optional[str] = None
    org_id: str
    attack_type: str
    severity: str
    src_ip: str
    dst_ip: str
    src_port: Optional[int] = 0
    dst_port: Optional[int] = 0
    protocol: Optional[str] = 'Unknown'
    confidence: Optional[float] = 0.0
    flow_duration: Optional[float] = 0.0
    target_system: Optional[str] = None
    regulatory_flags: Optional[List[str]] = []
    is_financial_port: Optional[bool] = False
    detected_at: Optional[str] = None

# Finance Configuration
FINANCE_CRITICAL_PORTS = [1433, 1521, 3306, 5432, 27017, 6379]
FINANCE_HIGH_RISK_PORTS = [443, 8443, 3389, 5900, 4789, 9000, 8080, 21, 22]

REGULATORY_FLAG_MAP = {
    'Data-Exfiltration': ['GDPR_REPORTABLE', 'PCI_DSS_INCIDENT', 'NOTIFY_DPO'],
    'SWIFT-Anomaly': ['NOTIFY_CENTRAL_BANK', 'SWIFT_CSP_INCIDENT'],
    'Credential-Stuffing': ['NOTIFY_FRAUD_TEAM', 'CUSTOMER_IMPACT_LIKELY', 'PCI_DSS_INCIDENT'],
    'Card-Skim-Probe': ['PCI_DSS_INCIDENT', 'NOTIFY_CARD_SCHEMES', 'ATM_NETWORK_AT_RISK'],
    'Ransomware-C2': ['NOTIFY_CENTRAL_BANK', 'ACTIVATE_IR_PLAN', 'NOTIFY_CYBER_INSURANCE'],
    'Insider-Exfiltration': ['GDPR_REPORTABLE', 'NOTIFY_DPO', 'NOTIFY_HR_LEGAL'],
    'API-Abuse-Banking': ['PCI_DSS_INCIDENT', 'NOTIFY_FRAUD_TEAM']
}

PCI_DSS_MAP = {
    'Credential-Stuffing': 'Requirement 8.3',
    'Card-Skim-Probe': 'Requirements 9.9 and 11.5',
    'DDoS-Payment-Gateway': 'Requirement 6.4',
    'Data-Exfiltration': 'Requirement 4.2',
    'Ransomware-C2': 'Requirement 12.10',
    'API-Abuse-Banking': 'Requirement 6.2',
    'Insider-Exfiltration': 'Requirement 7.1',
    'SWIFT-Anomaly': 'Requirement 10.3',
    'Cryptojacking': 'Requirement 6.3',
    'Port-Scan-Financial': 'Requirement 11.5'
}

# ─────────────────────────────────────────
# Alert Ingest — The Main Entry Point
# ─────────────────────────────────────────

@router.post("/ingest")
async def ingest_alert(
    payload: IngestAlertRequest,
    org: dict = Depends(get_agent_org)
):
    """
    Primary alert ingest endpoint called by agent

    Triggers full intelligence pipeline:
    1. IP reputation check
    2. Severity escalation for finance ports
    3. Regulatory flag assignment
    4. MITRE mapping at creation time
    5. PCI-DSS requirement mapping
    6. Save to Firestore
    7. Temporal correlation update
    8. Critical alert email notification
    """
    try:
        src_ip = payload.src_ip
        dst_port = payload.dst_port or 0
        attack_type = payload.attack_type
        severity = payload.severity

        # ─────────────────────────────────
        # Step 1 — IP Reputation Check
        # ─────────────────────────────────
        ip_reputation = {}
        try:
            from services.ip_reputation import check_ip_reputation
            ip_reputation = check_ip_reputation(src_ip)

            # Escalate severity if known malicious IP
            if ip_reputation.get('is_malicious'):
                if severity not in ['critical']:
                    severity = 'high'
                    print(
                        f"IP reputation escalation: "
                        f"{src_ip} is known malicious"
                    )
        except Exception as e:
            print(f"IP reputation check error: {e}")

        # ─────────────────────────────────
        # Step 2 — Finance Port Escalation
        # ─────────────────────────────────
        if dst_port in FINANCE_CRITICAL_PORTS:
            severity = 'critical'
            print(f"Finance port escalation: port {dst_port}")

        # ─────────────────────────────────
        # Step 3 — Regulatory Flags
        # ─────────────────────────────────
        regulatory_flags = payload.regulatory_flags or []

        # Add any missed flags from server-side map
        for key in REGULATORY_FLAG_MAP:
            if key.lower() in attack_type.lower():
                for flag in REGULATORY_FLAG_MAP[key]:
                    if flag not in regulatory_flags:
                        regulatory_flags.append(flag)

        # ─────────────────────────────────
        # Step 4 — MITRE Mapping at Creation
        # ─────────────────────────────────
        mitre = get_mitre_mapping(attack_type)

        # ─────────────────────────────────
        # Step 5 — PCI-DSS Mapping
        # ─────────────────────────────────
        pci_dss_ref = ''
        for key in PCI_DSS_MAP:
            if key.lower() in attack_type.lower():
                pci_dss_ref = PCI_DSS_MAP[key]
                break

        # ─────────────────────────────────
        # Step 6 — Save to Firestore
        # ─────────────────────────────────
        alert_data = {
            'alert_id': payload.alert_id or str(uuid.uuid4()),
            'org_id': payload.org_id,
            'attack_type': attack_type,
            'severity': severity,
            'src_ip': src_ip,
            'dst_ip': payload.dst_ip,
            'src_port': payload.src_port,
            'dst_port': dst_port,
            'protocol': payload.protocol,
            'confidence': payload.confidence,
            'flow_duration': payload.flow_duration,
            'target_system': payload.target_system,
            'regulatory_flags': regulatory_flags,
            'is_financial_port': payload.is_financial_port,
            'mitre_id': mitre.get('id'),
            'mitre_name': mitre.get('name'),
            'mitre_tactic': mitre.get('tactic'),
            'pci_dss_ref': pci_dss_ref,
            'ip_reputation_score': ip_reputation.get(
                'confidence', 0
            ),
            'ip_is_malicious': ip_reputation.get(
                'is_malicious', False
            ),
            'ip_is_tor': ip_reputation.get('is_tor', False),
            'alert_status': 'new',
            'timestamp': firestore.SERVER_TIMESTAMP
        }

        alert_ref = db.collection('alerts').add(alert_data)
        alert_id = alert_ref[1].id

        # ─────────────────────────────────
        # Step 7 — Temporal Correlation
        # ─────────────────────────────────
        try:
            from services.temporal_correlation import (
                update_ip_activity
            )
            compound = update_ip_activity(
                payload.org_id,
                src_ip,
                attack_type,
                severity
            )
            if compound:
                print(
                    f"Compound alert triggered: "
                    f"{compound.get('type')}"
                )
        except Exception as e:
            print(f"Temporal correlation error: {e}")

        # ─────────────────────────────────
        # Step 8 — Critical Alert Email
        # ─────────────────────────────────
        if severity == 'critical':
            try:
                send_critical_alert_notification(
                    org_id=payload.org_id,
                    attack_type=attack_type,
                    src_ip=src_ip,
                    dst_port=dst_port,
                    target_system=payload.target_system,
                    regulatory_flags=regulatory_flags,
                    mitre=mitre,
                    pci_dss_ref=pci_dss_ref
                )
            except Exception as e:
                print(f"Critical alert notification error: {e}")

        return {
            "status": "success",
            "message": "Alert ingested and analyzed",
            "data": {
                "alert_id": alert_id,
                "severity": severity,
                "regulatory_flags": regulatory_flags,
                "mitre_id": mitre.get('id'),
                "pci_dss_ref": pci_dss_ref,
                "ip_is_malicious": ip_reputation.get(
                    'is_malicious', False
                )
            }
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def send_critical_alert_notification(
    org_id: str,
    attack_type: str,
    src_ip: str,
    dst_port: int,
    target_system: str,
    regulatory_flags: list,
    mitre: dict,
    pci_dss_ref: str
):
    """
    Sends immediate email notification for
    critical alerts to org notification contacts
    Uses Firebase Extension mail collection
    """
    try:
        # Get org notification contacts
        orgs = db.collection('organisations').where(
            filter=firestore.FieldFilter(
                'org_id', '==', org_id
            )
        ).get()

        if not orgs:
            return

        org_data = orgs[0].to_dict()
        org_name = org_data.get('name', 'Your Organisation')
        contacts = org_data.get(
            'notification_contacts', []
        )
        thresholds = org_data.get(
            'notification_thresholds',
            {'critical': True}
        )

        # Only send if critical notifications enabled
        if not thresholds.get('critical', True):
            return

        # Build email list
        recipients = [c['email'] for c in contacts if c.get('email')]

        if not recipients:
            return

        from services.email import send_critical_alert_email
        send_critical_alert_email(
            to_emails=recipients,
            org_name=org_name,
            attack_type=attack_type,
            src_ip=src_ip,
            target_system=target_system or f'Port {dst_port}',
            mitre_id=mitre.get('id', ''),
            pci_dss_ref=pci_dss_ref,
            regulatory_flags=regulatory_flags
        )


        reg_flags_html = ''
        if regulatory_flags:
            flags_list = ''.join([
                f'<li style="color: #F87171;">{flag}</li>'
                for flag in regulatory_flags
            ])
            reg_flags_html = f'''
                <p style="font-size: 13px;
                          color: #E2E8F0;
                          margin-bottom: 8px;
                          font-weight: 600;">
                  Regulatory Flags
                </p>
                <ul style="margin: 0 0 16px 0;
                           padding-left: 20px;">
                  {flags_list}
                </ul>
            '''

        html_body = f'''
            <!DOCTYPE html>
            <html>
            <body style="font-family: Arial, sans-serif;
                         background: #0F1117;
                         color: #E2E8F0;
                         padding: 40px; margin: 0;">
              <div style="max-width: 560px;
                          margin: 0 auto;
                          background: #1A1D27;
                          border-radius: 16px;
                          padding: 40px;
                          border: 1px solid
                          rgba(255,255,255,0.06);">

                <div style="display: flex;
                            align-items: center;
                            gap: 12px;
                            margin-bottom: 24px;
                            padding: 14px 18px;
                            background: rgba(248,113,113,0.1);
                            border: 1px solid
                            rgba(248,113,113,0.3);
                            border-radius: 10px;">
                  <p style="font-size: 24px; margin: 0;">
                    🚨
                  </p>
                  <div>
                    <p style="font-weight: 700;
                              font-size: 16px;
                              color: #F87171;
                              margin: 0;">
                      CRITICAL SECURITY ALERT
                    </p>
                    <p style="font-size: 12px;
                              color: #64748B;
                              margin: 0;">
                      {org_name} — IntelliSense IDS
                    </p>
                  </div>
                </div>

                <h2 style="font-size: 20px;
                           font-weight: 700;
                           color: #E2E8F0;
                           margin-bottom: 16px;">
                  {attack_type} Detected
                </h2>

                <div style="background: #22263A;
                            border-radius: 8px;
                            padding: 16px;
                            margin-bottom: 20px;">
                  <table style="width: 100%;
                                border-collapse: collapse;">
                    <tr>
                      <td style="font-size: 12px;
                                 color: #64748B;
                                 padding: 6px 0;">
                        Source IP
                      </td>
                      <td style="font-size: 13px;
                                 color: #E2E8F0;
                                 font-family: monospace;
                                 text-align: right;">
                        {src_ip}
                      </td>
                    </tr>
                    <tr>
                      <td style="font-size: 12px;
                                 color: #64748B;
                                 padding: 6px 0;">
                        Target System
                      </td>
                      <td style="font-size: 13px;
                                 color: #F87171;
                                 text-align: right;">
                        {target_system or f'Port {dst_port}'}
                      </td>
                    </tr>
                    <tr>
                      <td style="font-size: 12px;
                                 color: #64748B;
                                 padding: 6px 0;">
                        MITRE Technique
                      </td>
                      <td style="font-size: 13px;
                                 color: #6366F1;
                                 text-align: right;">
                        {mitre.get('id')} —
                        {mitre.get('name')}
                      </td>
                    </tr>
                    <tr>
                      <td style="font-size: 12px;
                                 color: #64748B;
                                 padding: 6px 0;">
                        PCI-DSS Reference
                      </td>
                      <td style="font-size: 13px;
                                 color: #FBBF24;
                                 text-align: right;">
                        {pci_dss_ref or 'Review requirements'}
                      </td>
                    </tr>
                  </table>
                </div>

                {reg_flags_html}

                <p style="font-size: 13px;
                          color: #64748B;
                          margin-bottom: 20px;
                          line-height: 1.6;">
                  Log in to your IntelliSense IDS
                  dashboard immediately to investigate
                  this alert and take remediation action.
                </p>

                <div style="margin-top: 32px;
                            padding-top: 24px;
                            border-top: 1px solid
                            rgba(255,255,255,0.06);">
                  <p style="font-size: 11px;
                            color: #64748B;
                            margin: 0;">
                    IntelliSense IDS — Financial
                    Security Platform 2026
                  </p>
                </div>
              </div>
            </body>
            </html>
        '''

        # Write to Firebase mail collection
        # (Firebase Extension sends the email)
        db.collection('mail').add({
            'to': recipients,
            'message': {
                'subject': (
                    f"[CRITICAL] {attack_type} detected "
                    f"on {org_name} network"
                ),
                'html': html_body
            }
        })

    except Exception as e:
        print(f"Critical alert email error: {e}")


# ─────────────────────────────────────────
# Standard Alert Endpoints
# ─────────────────────────────────────────

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

            if severity and data.get('severity') != severity:
                continue
            if status and data.get(
                'alert_status', 'new'
            ) != status:
                continue

            result.append(data)

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
        alert_doc = db.collection('alerts')\
                      .document(alert_id).get()

        if not alert_doc.exists:
            raise HTTPException(
                status_code=404,
                detail="Alert not found"
            )

        data = alert_doc.to_dict()
        data['id'] = alert_doc.id

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

        # Enrich MITRE if not already enriched at ingest
        if not data.get('mitre_id'):
            mitre = get_mitre_mapping(
                data.get('attack_type', '')
            )
            data['mitre'] = mitre
        else:
            data['mitre'] = {
                'id': data.get('mitre_id'),
                'name': data.get('mitre_name'),
                'tactic': data.get('mitre_tactic'),
                'url': (
                    'https://attack.mitre.org/techniques/' +
                    data.get('mitre_id', '').replace('.', '/')
                )
            }

        data['remediation'] = get_remediation(
            data.get('attack_type', '')
        )

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
        alert_doc = db.collection('alerts')\
                      .document(alert_id).get()

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

        old_status = alert_data.get('alert_status', 'new')

        db.collection('alerts').document(alert_id).update({
            'alert_status': payload.status,
            'updated_at': firestore.SERVER_TIMESTAMP,
            'updated_by': current_admin['admin_id']
        })

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
            action_detail=(
                f"Alert {alert_id} status: "
                f"{old_status} → {payload.status}"
            ),
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
        alert_doc = db.collection('alerts')\
                      .document(alert_id).get()

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
            "message": (
                "Feedback submitted. "
                "Thank you for improving the model."
            )
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─────────────────────────────────────────
# Finance-Specific MITRE Mappings
# ─────────────────────────────────────────

def get_mitre_mapping(attack_type: str) -> dict:
    mappings = {
        # Finance-specific
        'Credential-Stuffing': {
            'id': 'T1110.004',
            'name': 'Credential Stuffing',
            'tactic': 'Credential Access',
            'pci_dss': 'Requirement 8.3',
            'url': 'https://attack.mitre.org/techniques/T1110/004'
        },
        'Card-Skim-Probe': {
            'id': 'T1046',
            'name': 'Network Service Discovery',
            'tactic': 'Discovery',
            'pci_dss': 'Requirement 11.5',
            'url': 'https://attack.mitre.org/techniques/T1046'
        },
        'DDoS-Payment-Gateway': {
            'id': 'T1498',
            'name': 'Network Denial of Service',
            'tactic': 'Impact',
            'pci_dss': 'Requirement 6.4',
            'url': 'https://attack.mitre.org/techniques/T1498'
        },
        'Data-Exfiltration': {
            'id': 'T1048',
            'name': 'Exfiltration Over Alternative Protocol',
            'tactic': 'Exfiltration',
            'pci_dss': 'Requirement 4.2',
            'url': 'https://attack.mitre.org/techniques/T1048'
        },
        'Ransomware-C2': {
            'id': 'T1571',
            'name': 'Non-Standard Port',
            'tactic': 'Command and Control',
            'pci_dss': 'Requirement 6.4',
            'url': 'https://attack.mitre.org/techniques/T1571'
        },
        'API-Abuse-Banking': {
            'id': 'T1190',
            'name': 'Exploit Public-Facing Application',
            'tactic': 'Initial Access',
            'pci_dss': 'Requirement 6.2',
            'url': 'https://attack.mitre.org/techniques/T1190'
        },
        'Insider-Exfiltration': {
            'id': 'T1078',
            'name': 'Valid Accounts',
            'tactic': 'Defense Evasion',
            'pci_dss': 'Requirement 7.1',
            'url': 'https://attack.mitre.org/techniques/T1078'
        },
        'SWIFT-Anomaly': {
            'id': 'T1657',
            'name': 'Financial Theft',
            'tactic': 'Impact',
            'pci_dss': 'Requirement 10.3',
            'url': 'https://attack.mitre.org/techniques/T1657'
        },
        'Cryptojacking': {
            'id': 'T1496',
            'name': 'Resource Hijacking',
            'tactic': 'Impact',
            'pci_dss': 'Requirement 6.3',
            'url': 'https://attack.mitre.org/techniques/T1496'
        },
        'Port-Scan-Financial': {
            'id': 'T1046',
            'name': 'Network Service Discovery',
            'tactic': 'Discovery',
            'pci_dss': 'Requirement 11.5',
            'url': 'https://attack.mitre.org/techniques/T1046'
        },

        # Standard attacks
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
	'severity_context': 'Investigate immediately',
        'pci_dss': 'Review all requirements',
        'url': 'https://attack.mitre.org'
    }


def get_remediation(attack_type: str) -> list:
    remediations = {
        'Credential-Stuffing': [
            'Immediately enable MFA for all online banking accounts',
            'Block the attacking IP range at WAF level',
            'Force password reset for targeted accounts',
            'Review authentication logs for successful logins from attacking IPs',
            'Implement CAPTCHA and rate limiting on login endpoints',
            'Alert fraud team to monitor accounts for suspicious transactions',
            'PCI-DSS: Review Requirement 8.3 — Multi-factor authentication'
        ],
        'Card-Skim-Probe': [
            'Isolate affected ATM/POS network segment immediately',
            'Block scanning IP at network perimeter',
            'Audit all ATM and POS terminal connections',
            'Check for unauthorised physical devices on terminals',
            'Alert card operations team for potential card compromise',
            'Review POS transaction logs for anomalies',
            'PCI-DSS: Review Requirements 9.9 and 11.5'
        ],
        'DDoS-Payment-Gateway': [
            'Activate DDoS mitigation service immediately',
            'Contact upstream ISP for traffic scrubbing',
            'Switch payment processing to backup gateway',
            'Implement rate limiting and traffic shaping',
            'Alert payment network operations center',
            'Monitor for service degradation affecting customers',
            'PCI-DSS: Review Requirement 6.4 — DDoS resilience'
        ],
        'Data-Exfiltration': [
            'IMMEDIATELY isolate affected systems from network',
            'Preserve all logs for forensic investigation',
            'Identify what data was accessed and exported',
            'Notify Data Protection Officer — potential GDPR breach',
            'Assess regulatory reporting requirements (72-hour GDPR window)',
            'Engage incident response team',
            'Notify affected customers if personal data was compromised',
            'PCI-DSS: Requirement 4.2 — Report to card brands if cardholder data affected'
        ],
        'Ransomware-C2': [
            'IMMEDIATELY disconnect affected systems from network',
            'Do not pay ransom — contact law enforcement',
            'Activate business continuity plan',
            'Restore from clean offline backups',
            'Engage cybersecurity incident response firm',
            'Notify banking regulator of incident',
            'Preserve all evidence for investigation',
            'PCI-DSS: Review Requirement 12.10 — Incident response plan'
        ],
        'API-Abuse-Banking': [
            'Immediately revoke and rotate all API keys',
            'Block attacking IP ranges at API gateway',
            'Review all API calls from the attacking source',
            'Audit transactions initiated via API for fraud',
            'Implement API rate limiting and request validation',
            'Review API authentication mechanisms',
            'PCI-DSS: Requirement 6.2 — Secure development practices'
        ],
        'Insider-Exfiltration': [
            'Preserve evidence — do not alert the suspected insider yet',
            'Immediately brief HR, Legal, and Security leadership',
            'Audit all access logs for the involved account',
            'Identify all data accessed and downloaded',
            'Revoke excess privileges immediately',
            'Engage legal counsel for employment action',
            'Assess regulatory reporting requirements',
            'PCI-DSS: Requirement 7.1 — Least privilege access'
        ],
        'SWIFT-Anomaly': [
            'Immediately contact SWIFT customer security team',
            'Freeze any suspicious transactions in progress',
            'Alert correspondent banking partners',
            'Review all recent SWIFT messages for tampering',
            'Activate SWIFT Customer Security Programme controls',
            'Notify central bank and financial regulators',
            'Engage SWIFT forensic investigation support',
            'PCI-DSS: Review Requirement 10.3 — Audit log integrity'
        ],
        'Cryptojacking': [
            'Identify and isolate affected servers immediately',
            'Terminate unauthorised processes consuming resources',
            'Scan all systems for mining malware',
            'Patch the vulnerability used for initial access',
            'Review how attacker gained access to bank infrastructure',
            'Audit all running processes on production systems',
            'PCI-DSS: Requirement 6.3 — Security vulnerability management'
        ],
        'DDoS': [
            'Enable rate limiting on your firewall',
            'Contact your ISP to filter upstream traffic',
            'Configure traffic scrubbing or a DDoS protection service',
            'Block the attacking IP ranges at the network perimeter',
            'Consider a CDN with built-in DDoS protection'
        ],
        'PortScan': [
            'Block the scanning IP at the firewall immediately',
            'Review which services are exposed to the internet',
            'Close unnecessary open ports',
            'Enable port scan detection on your IDS',
            'Investigate whether the scan preceded an attack'
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
        ]
    }

    for key in remediations:
        if key.lower() in attack_type.lower():
            return remediations[key]

    return [
        'Investigate the source IP address immediately',
        'Review related log entries for full attack context',
        'Block suspicious traffic at the network perimeter',
        'Notify your security operations team',
        'Preserve all evidence for forensic investigation',
        'Review PCI-DSS compliance requirements for this incident type'
    ]
