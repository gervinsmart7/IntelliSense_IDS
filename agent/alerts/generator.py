import uuid
from __future__ import annotations

from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from config.settings import (
    BUSINESS_HOURS_END,
    BUSINESS_HOURS_START,
    BUSINESS_TIMEZONE,
    FINANCE_CRITICAL_PORTS,
    FINANCE_HIGH_RISK_PORTS,
    FINANCE_MEDIUM_PORTS,
    FINANCE_SEVERITY_MAP,
    ORG_ID,
    REGULATORY_FLAG_MAP,
)
from cloud.api import post_alert


class AlertGenerator:
    def __init__(self) -> None:
        self.org_id = ORG_ID

    def get_base_severity(self, attack_type: str) -> str:
        for key, value in FINANCE_SEVERITY_MAP.items():
            if key.lower() in attack_type.lower():
                return value
        return "medium"

    def get_finance_severity(self, attack_type: str, dst_port: int) -> str:
        base = self.get_base_severity(attack_type)
        if base == "critical" or dst_port in FINANCE_CRITICAL_PORTS:
            return "critical"
        if dst_port in FINANCE_HIGH_RISK_PORTS:
            return "high" if base in {"low", "medium"} else base

        try:
            local_hour = datetime.now(ZoneInfo(BUSINESS_TIMEZONE)).hour
        except Exception:
            local_hour = datetime.now(timezone.utc).hour
        outside_hours = not (BUSINESS_HOURS_START <= local_hour <= BUSINESS_HOURS_END)
        if outside_hours and base == "medium":
            return "high"
        return base

    def get_regulatory_flags(self, attack_type: str) -> list[str]:
        for key, flags in REGULATORY_FLAG_MAP.items():
            if key.lower() in attack_type.lower():
                return list(flags)
        return []

    @staticmethod
    def get_target_system(dst_port: int) -> str:
        target_map = {
            1433: "Database Service (SQL Server)",
            1521: "Database Service (Oracle)",
            3306: "Database Service (MySQL)",
            5432: "Database Service (PostgreSQL)",
            27017: "Database Service (MongoDB)",
            6379: "Cache Service (Redis)",
            443: "HTTPS Service",
            8443: "Alternate HTTPS Service",
            3389: "Remote Desktop (RDP)",
            5900: "Remote Access (VNC)",
            22: "SSH Service",
            21: "FTP Service",
        }
        return target_map.get(dst_port, f"Unknown System (Port {dst_port})")

    def generate_alerts(self, classified_df) -> int:
        if classified_df is None or classified_df.empty:
            return 0

        attacks = classified_df[classified_df.get("is_intrusion", False) == True]
        if attacks.empty:
            print("No attacks detected in this batch")
            return 0

        sent = 0
        for _, flow in attacks.iterrows():
            try:
                attack_type = str(flow.get("prediction", "Unknown"))
                dst_port = int(float(flow.get("Dst Port", flow.get("dst_port", 0)) or 0))
                src_port = int(float(flow.get("Src Port", flow.get("src_port", 0)) or 0))
                severity = self.get_finance_severity(attack_type, dst_port)
                alert = {
                    "alert_id": str(flow.get("event_id") or ""),
                    "event_id": str(flow.get("event_id") or ""),
                    "org_id": self.org_id,
                    "attack_type": attack_type,
                    "predicted_class": attack_type,
                    "severity": severity,
                    "src_ip": str(flow.get("Src IP", flow.get("src_ip", "Unknown"))),
                    "dst_ip": str(flow.get("Dst IP", flow.get("dst_ip", "Unknown"))),
                    "src_port": src_port,
                    "dst_port": dst_port,
                    "protocol": str(flow.get("Protocol", flow.get("protocol", "Unknown"))),
                    "confidence": float(flow.get("confidence", 0.0)),
                    "flow_duration": float(flow.get("Flow Duration", flow.get("flow_duration", 0.0)) or 0.0),
                    "target_system": self.get_target_system(dst_port),
                    "regulatory_flags": self.get_regulatory_flags(attack_type),
                    "is_financial_port": dst_port in (
                        FINANCE_CRITICAL_PORTS + FINANCE_HIGH_RISK_PORTS + FINANCE_MEDIUM_PORTS
                    ),
                    "verification_status": "unreviewed",
                    "verified_label": None,
                    "model_version": str(flow.get("model_version", "unknown")),
                    "detected_at": datetime.now(timezone.utc).isoformat(),
                }
                if post_alert(alert):
                    sent += 1
            except Exception as exc:
                print(f"Alert generation error: {exc}")
        print(f"Generated {sent} alerts")
        return sent