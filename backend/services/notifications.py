"""
Notification Service
Handles creation of both automated system notifications and manual admin announcements
"""

from datetime import datetime
from firebase_admin import firestore
from enum import Enum

db = firestore.client()


class NotificationType(str, Enum):
    # Automated
    SECURITY_ALERT = "security_alert"
    AGENT_OFFLINE = "agent_offline"
    AGENT_ONLINE = "agent_online"
    RESOURCE_WARNING = "resource_warning"
    THREAT_INTEL_UPDATE = "threat_intel_update"
    MODEL_DEPLOYED = "model_deployed"
    FAILED_LOGIN = "failed_login_attempt"
    NEW_ORG_REGISTERED = "new_org_registered"
    
    # Manual
    ANNOUNCEMENT = "announcement"
    MAINTENANCE_NOTICE = "maintenance_notice"
    EMERGENCY_ALERT = "emergency_alert"
    POLICY_UPDATE = "policy_update"
    FEATURE_RELEASE = "feature_release"


class Severity(str, Enum):
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    INFO = "info"


class NotificationService:
    """Service for creating and managing notifications"""
    
    @staticmethod
    def create_threat_alert(
        org_id: str,
        threat_type: str,
        severity: str,
        source_ip: str,
        target_ip: str,
        details: dict = None
    ) -> str:
        """
        Create automated threat detection notification
        
        Args:
            org_id: Organization ID
            threat_type: Type of threat (DDoS, PortScan, etc.)
            severity: critical, high, medium, low
            source_ip: Source IP of threat
            target_ip: Target IP of threat
            details: Additional threat details
        
        Returns:
            Document ID of created notification
        """
        notification = {
            "type": NotificationType.SECURITY_ALERT,
            "severity": severity,
            "sender": "system",
            "senderName": "IDS System",
            "senderEmail": None,
            "organisationId": org_id,
            "targetRoles": ["org_admin"],
            "targetAdminIds": [],
            "title": f"{threat_type} Detected",
            "message": details.get("description", f"A {threat_type} threat was detected.") if details else "",
            "alertSeverity": severity,
            "sourceIP": source_ip,
            "targetIP": target_ip,
            "read": False,
            "seen_by": [],
            "createdAt": datetime.utcnow(),
            "updatedAt": datetime.utcnow()
        }
        doc_ref = db.collection("notifications").add(notification)
        return doc_ref[1].id if doc_ref else None
    
    @staticmethod
    def create_agent_offline_alert(
        org_id: str,
        agent_id: str,
        agent_name: str,
        last_seen: datetime = None
    ) -> str:
        """
        Create agent offline notification
        
        Args:
            org_id: Organization ID
            agent_id: Agent ID
            agent_name: Agent name
            last_seen: Last heartbeat time
        
        Returns:
            Document ID of created notification
        """
        notification = {
            "type": NotificationType.AGENT_OFFLINE,
            "severity": Severity.HIGH,
            "sender": "system",
            "senderName": "IDS System",
            "senderEmail": None,
            "organisationId": org_id,
            "targetRoles": ["org_admin"],
            "targetAdminIds": [],
            "title": f"⚠️ Agent Offline",
            "message": f"Agent '{agent_name}' has gone offline. No heartbeat received for 5 minutes.",
            "agentName": agent_name,
            "agentId": agent_id,
            "lastSeen": last_seen or datetime.utcnow(),
            "read": False,
            "seen_by": [],
            "createdAt": datetime.utcnow(),
            "updatedAt": datetime.utcnow()
        }
        doc_ref = db.collection("notifications").add(notification)
        return doc_ref[1].id if doc_ref else None
    
    @staticmethod
    def create_agent_online_alert(
        org_id: str,
        agent_id: str,
        agent_name: str,
        reconnected_at: datetime = None
    ) -> str:
        """
        Create agent online notification
        
        Args:
            org_id: Organization ID
            agent_id: Agent ID
            agent_name: Agent name
            reconnected_at: When agent reconnected
        
        Returns:
            Document ID of created notification
        """
        notification = {
            "type": NotificationType.AGENT_ONLINE,
            "severity": Severity.INFO,
            "sender": "system",
            "senderName": "IDS System",
            "senderEmail": None,
            "organisationId": org_id,
            "targetRoles": ["org_admin"],
            "targetAdminIds": [],
            "title": f"✅ Agent Online",
            "message": f"Agent '{agent_name}' has reconnected and is now online.",
            "agentName": agent_name,
            "agentId": agent_id,
            "reconnectedAt": reconnected_at or datetime.utcnow(),
            "read": False,
            "seen_by": [],
            "createdAt": datetime.utcnow(),
            "updatedAt": datetime.utcnow()
        }
        doc_ref = db.collection("notifications").add(notification)
        return doc_ref[1].id if doc_ref else None
    
    @staticmethod
    def create_resource_warning(
        org_id: str,
        resource_type: str,
        usage_percent: int,
        agent_name: str = None
    ) -> str:
        """
        Create resource usage warning notification
        
        Args:
            org_id: Organization ID
            resource_type: "cpu" or "memory"
            usage_percent: Usage percentage
            agent_name: Optional agent name
        
        Returns:
            Document ID of created notification
        """
        severity = Severity.CRITICAL if usage_percent > 95 else Severity.HIGH
        
        notification = {
            "type": NotificationType.RESOURCE_WARNING,
            "severity": severity,
            "sender": "system",
            "senderName": "IDS System",
            "senderEmail": None,
            "organisationId": org_id,
            "targetRoles": ["org_admin"],
            "targetAdminIds": [],
            "title": f"⚠️ High {resource_type.upper()} Usage",
            "message": f"{resource_type.upper()} usage is at {usage_percent}%. " + 
                      (f"Agent: {agent_name}" if agent_name else ""),
            "resourceType": resource_type,
            "resourceValue": usage_percent,
            "agentName": agent_name,
            "read": False,
            "seen_by": [],
            "createdAt": datetime.utcnow(),
            "updatedAt": datetime.utcnow()
        }
        doc_ref = db.collection("notifications").add(notification)
        return doc_ref[1].id if doc_ref else None
    
    @staticmethod
    def create_model_update_notification(
        model_version: str,
        description: str = None,
        target_org_ids: list = None
    ) -> str:
        """
        Create notification for ML model deployment
        
        Args:
            model_version: Version string (e.g., "2.5")
            description: Update description
            target_org_ids: Specific org IDs, or None for all
        
        Returns:
            Document ID of created notification
        """
        notification = {
            "type": NotificationType.MODEL_DEPLOYED,
            "severity": Severity.INFO,
            "sender": "system",
            "senderName": "IDS System",
            "senderEmail": None,
            "organisationId": None,
            "targetOrganisationIds": target_org_ids or [],
            "targetRoles": ["org_admin", "platform_admin", "super_admin"],
            "targetAdminIds": [],
            "title": f"📢 Detection Model Updated",
            "message": f"Detection model version {model_version} is now active. " + 
                      (description or "Check the deployment logs for details."),
            "modelVersion": model_version,
            "read": False,
            "seen_by": [],
            "createdAt": datetime.utcnow(),
            "updatedAt": datetime.utcnow()
        }
        doc_ref = db.collection("notifications").add(notification)
        return doc_ref[1].id if doc_ref else None
    
    @staticmethod
    def create_threat_intel_update(
        indicator_count: int,
        feed_source: str = None,
        target_org_ids: list = None
    ) -> str:
        """
        Create notification for threat intelligence feed update
        
        Args:
            indicator_count: Number of new indicators
            feed_source: Source of threat feed
            target_org_ids: Specific org IDs, or None for all
        
        Returns:
            Document ID of created notification
        """
        notification = {
            "type": NotificationType.THREAT_INTEL_UPDATE,
            "severity": Severity.INFO,
            "sender": "system",
            "senderName": "IDS System",
            "senderEmail": None,
            "organisationId": None,
            "targetOrganisationIds": target_org_ids or [],
            "targetRoles": ["org_admin", "platform_admin", "super_admin"],
            "targetAdminIds": [],
            "title": f"ℹ️ Threat Intelligence Updated",
            "message": f"{indicator_count:,} new threat indicators imported from " +
                      (feed_source or "threat intelligence feeds"),
            "indicatorCount": indicator_count,
            "feedSource": feed_source,
            "read": False,
            "seen_by": [],
            "createdAt": datetime.utcnow(),
            "updatedAt": datetime.utcnow()
        }
        doc_ref = db.collection("notifications").add(notification)
        return doc_ref[1].id if doc_ref else None
    
    @staticmethod
    def create_failed_login_alert(
        email: str,
        failed_attempts: int,
        org_id: str = None
    ) -> str:
        """
        Create notification for failed login attempts
        
        Args:
            email: Email address of failed logins
            failed_attempts: Number of failed attempts
            org_id: Organisation ID
        
        Returns:
            Document ID of created notification
        """
        notification = {
            "type": NotificationType.FAILED_LOGIN,
            "severity": Severity.HIGH,
            "sender": "system",
            "senderName": "IDS System",
            "senderEmail": None,
            "organisationId": org_id,
            "targetRoles": ["super_admin"],
            "targetAdminIds": [],
            "title": f"🔒 Suspicious Login Activity",
            "message": f"{failed_attempts} failed login attempts detected for {email}",
            "email": email,
            "failedAttempts": failed_attempts,
            "read": False,
            "seen_by": [],
            "createdAt": datetime.utcnow(),
            "updatedAt": datetime.utcnow()
        }
        doc_ref = db.collection("notifications").add(notification)
        return doc_ref[1].id if doc_ref else None
    
    @staticmethod
    def create_new_org_registration_alert(
        org_name: str,
        org_email: str,
        contact_person: str = None
    ) -> str:
        """
        Create notification for new organization registration
        
        Args:
            org_name: Organization name
            org_email: Organization email
            contact_person: Contact person name
        
        Returns:
            Document ID of created notification
        """
        notification = {
            "type": NotificationType.NEW_ORG_REGISTERED,
            "severity": Severity.INFO,
            "sender": "system",
            "senderName": "IDS System",
            "senderEmail": None,
            "organisationId": None,
            "targetRoles": ["super_admin"],
            "targetAdminIds": [],
            "title": f"📥 New Organization Registration",
            "message": f"{org_name} awaiting approval. Contact: {contact_person or org_email}",
            "orgName": org_name,
            "orgEmail": org_email,
            "contactPerson": contact_person,
            "read": False,
            "seen_by": [],
            "createdAt": datetime.utcnow(),
            "updatedAt": datetime.utcnow()
        }
        doc_ref = db.collection("notifications").add(notification)
        return doc_ref[1].id if doc_ref else None
    
    @staticmethod
    def create_announcement(
        title: str,
        message: str,
        announcement_type: str,
        sender_email: str,
        sender_name: str,
        sender_role: str,
        target_org_ids: list = None,
        severity: str = None
    ) -> str:
        """
        Create manual announcement by admin
        
        Args:
            title: Announcement title
            message: Announcement message
            announcement_type: "announcement", "maintenance_notice", "emergency_alert", etc.
            sender_email: Email of admin creating announcement
            sender_name: Name of admin
            sender_role: "super_admin" or "platform_admin"
            target_org_ids: Specific org IDs, or None for all orgs
            severity: Override severity
        
        Returns:
            Document ID of created notification
        """
        if severity is None:
            severity = Severity.CRITICAL if announcement_type == "emergency_alert" else Severity.INFO
        
        notification = {
            "type": announcement_type,
            "severity": severity,
            "sender": sender_role,
            "senderName": sender_name,
            "senderEmail": sender_email,
            "organisationId": None,
            "targetOrganisationIds": target_org_ids or [],
            "targetRoles": ["org_admin", "platform_admin", "super_admin"],
            "targetAdminIds": [],
            "title": title,
            "message": message,
            "read": False,
            "seen_by": [],
            "createdAt": datetime.utcnow(),
            "updatedAt": datetime.utcnow()
        }
        doc_ref = db.collection("notifications").add(notification)
        return doc_ref[1].id if doc_ref else None
    
    @staticmethod
    def mark_as_read(notification_id: str, admin_id: str, admin_name: str) -> bool:
        """
        Mark notification as read and record who read it
        
        Args:
            notification_id: Notification ID
            admin_id: Admin email/ID
            admin_name: Admin name
        
        Returns:
            True if successful
        """
        try:
            db.collection("notifications").document(notification_id).update({
                "read": True,
                "seen_by": firestore.ArrayUnion([{
                    "adminId": admin_id,
                    "adminName": admin_name,
                    "timestamp": datetime.utcnow()
                }]),
                "updatedAt": datetime.utcnow()
            })
            return True
        except Exception as e:
            print(f"Error marking notification as read: {e}")
            return False
