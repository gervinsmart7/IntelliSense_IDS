cat > ~/IntelliSense_IDS/agent/alerts/generator.py << 'EOF'
import uuid
from datetime import datetime
from config.settings import (
    ORG_ID,
    FINANCE_SEVERITY_MAP,
    FINANCE_CRITICAL_PORTS,
    FINANCE_HIGH_RISK_PORTS,
    FINANCE_MEDIUM_PORTS,
    BUSINESS_HOURS_START,
    BUSINESS_HOURS_END,
    REGULATORY_FLAG_MAP
)
from cloud.api import post_alert

class AlertGenerator:
    def __init__(self):
        self.org_id = ORG_ID

    def get_base_severity(self, attack_type: str) -> str:
        """
        Gets base severity from the finance
        severity map
        """
        for key in FINANCE_SEVERITY_MAP:
            if key.lower() in attack_type.lower():
                return FINANCE_SEVERITY_MAP[key]
        return 'medium'

    def get_finance_severity(
        self,
        attack_type: str,
        dst_port: int,
        src_ip: str = ''
    ) -> str:
        """
        Finance-aware severity calculation

        Escalates severity based on:
        1. Base ML classification severity
        2. Destination port (financial system targeting)
        3. Time of day (after hours = more suspicious)
        """
        base_severity = self.get_base_severity(attack_type)

        # Already critical — nothing to escalate to
        if base_severity == 'critical':
            return 'critical'

        # Check if targeting a critical financial port
        if dst_port in FINANCE_CRITICAL_PORTS:
            # Any attack on core banking ports
            # is immediately critical
            print(
                f"Finance port escalation: "
                f"port {dst_port} → severity escalated "
                f"to critical"
            )
            return 'critical'

        # High risk financial ports
        if dst_port in FINANCE_HIGH_RISK_PORTS:
            if base_severity == 'medium':
                return 'high'
            if base_severity == 'low':
                return 'medium'

        # Check if outside business hours
        current_hour = datetime.utcnow().hour
        is_outside_hours = (
            current_hour < BUSINESS_HOURS_START or
            current_hour > BUSINESS_HOURS_END
        )

        if is_outside_hours and base_severity == 'medium':
            print(
                f"After-hours escalation: "
                f"{current_hour}:00 UTC → "
                f"severity escalated to high"
            )
            return 'high'

        return base_severity

    def get_regulatory_flags(self, attack_type: str) -> list:
        """
        Returns regulatory notification flags
        for finance-sector attacks
        """
        for key in REGULATORY_FLAG_MAP:
            if key.lower() in attack_type.lower():
                return REGULATORY_FLAG_MAP[key]
        return []

    def get_target_system(self, dst_port: int) -> str:
        """
        Identifies what financial system
        is being targeted based on port
        """
        target_map = {
            1433: 'Core Banking Database (SQL Server)',
            1521: 'Core Banking Database (Oracle)',
            3306: 'Banking Database (MySQL)',
            5432: 'Banking Database (PostgreSQL)',
            27017: 'Fintech Database (MongoDB)',
            6379: 'Session Cache (Redis)',
            443: 'HTTPS Banking Portal',
            8443: 'Secure Banking API',
            3389: 'Remote Desktop (RDP)',
            5900: 'Remote Access (VNC)',
            4789: 'SWIFT Network Interface',
            9000: 'Fintech Microservice',
            8080: 'Banking Web Service',
            21: 'FTP File Transfer',
            22: 'SSH Admin Access',
            9100: 'POS Terminal Network',
            8583: 'Payment Message Bus (ISO 8583)',
            5672: 'Transaction Queue (RabbitMQ)',
            61616: 'Transaction Messaging (ActiveMQ)'
        }
        return target_map.get(dst_port, f'Unknown System (Port {dst_port})')

    def generate_alerts(self, classified_df) -> int:
        """
        Processes classified flows and sends
        alerts to backend via API

        IMPORTANT: Uses cloud/api.py post_alert()
        NOT direct Firestore writes
        This ensures IP reputation, temporal
        correlation, kill chain detection,
        and regulatory flags are all triggered
        """
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
                attack_type = flow.get(
                    'prediction', 'Unknown'
                )
                dst_port = int(flow.get(
                    'Dst Port',
                    flow.get('dst_port', 0)
                ))
                src_ip = str(flow.get(
                    'Src IP',
                    flow.get('src_ip', 'Unknown')
                ))

                # Finance-aware severity
                severity = self.get_finance_severity(
                    attack_type, dst_port, src_ip
                )

                # Get regulatory flags
                regulatory_flags = self.get_regulatory_flags(
                    attack_type
                )

                # Identify targeted financial system
                target_system = self.get_target_system(dst_port)

                # Build alert payload
                alert = {
                    'alert_id': str(uuid.uuid4()),
                    'org_id': self.org_id,
                    'attack_type': attack_type,
                    'severity': severity,
                    'src_ip': src_ip,
                    'dst_ip': str(flow.get(
                        'Dst IP',
                        flow.get('dst_ip', 'Unknown')
                    )),
                    'src_port': int(flow.get(
                        'Src Port',
                        flow.get('src_port', 0)
                    )),
                    'dst_port': dst_port,
                    'protocol': str(flow.get(
                        'Protocol',
                        flow.get('protocol', 'Unknown')
                    )),
                    'confidence': float(
                        flow.get('confidence', 0)
                    ),
                    'flow_duration': float(
                        flow.get('Flow Duration', 0)
                    ),
                    'target_system': target_system,
                    'regulatory_flags': regulatory_flags,
                    'is_financial_port': dst_port in (
                        FINANCE_CRITICAL_PORTS +
                        FINANCE_HIGH_RISK_PORTS +
                        FINANCE_MEDIUM_PORTS
                    ),
                    'detected_at': datetime.utcnow().isoformat()
                }

                # POST to backend ingest endpoint
                # This triggers all intelligence services
                result = post_alert(alert)

                if result:
                    alert_count += 1
                    if regulatory_flags:
                        print(
                            f"Alert sent: {attack_type} "
                            f"[{severity}] "
                            f"Regulatory flags: {regulatory_flags}"
                        )
                    else:
                        print(
                            f"Alert sent: {attack_type} "
                            f"[{severity}]"
                        )
                else:
                    print(
                        f"Alert post failed for {attack_type} "
                        f"— will retry on next cycle"
                    )

            except Exception as e:
                print(f"Alert generation error: {e}")
                continue

        print(f"Generated {alert_count} alerts")
        return alert_count
EOF