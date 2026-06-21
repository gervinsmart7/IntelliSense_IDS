"""
Notifications Router
API endpoints for creating and managing notifications
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from services.notifications import NotificationService, NotificationType, Severity
from services.auth import get_current_admin
from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


# Request Models
class ThreatAlertRequest(BaseModel):
    org_id: str
    threat_type: str
    severity: str
    source_ip: str
    target_ip: str
    description: str = ""


class AnnouncementRequest(BaseModel):
    title: str
    message: str
    announcement_type: str
    target_org_ids: Optional[List[str]] = None


class AgentOfflineRequest(BaseModel):
    org_id: str
    agent_id: str
    agent_name: str


class AgentOnlineRequest(BaseModel):
    org_id: str
    agent_id: str
    agent_name: str


class ResourceWarningRequest(BaseModel):
    org_id: str
    resource_type: str  # "cpu" or "memory"
    usage_percent: int
    agent_name: Optional[str] = None


class MarkAsReadRequest(BaseModel):
    notification_id: str


# Routes

@router.post("/threat-alert")
async def create_threat_alert(
    request: ThreatAlertRequest,
    current_admin: dict = Depends(get_current_admin)
):
    """
    Create threat detection alert (Automated)
    
    Called by: Detection engine / IDS Agent
    Permission: super_admin, platform_admin
    """
    if current_admin.get("role") not in ["super_admin", "platform_admin"]:
        raise HTTPException(status_code=403, detail="Unauthorized")
    
    try:
        doc_id = NotificationService.create_threat_alert(
            org_id=request.org_id,
            threat_type=request.threat_type,
            severity=request.severity,
            source_ip=request.source_ip,
            target_ip=request.target_ip,
            details={"description": request.description}
        )
        return {
            "status": "success",
            "notification_id": doc_id,
            "message": f"Threat alert created for {request.org_id}"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/agent-offline")
async def create_agent_offline_alert(
    request: AgentOfflineRequest,
    current_admin: dict = Depends(get_current_admin)
):
    """
    Create agent offline alert (Automated)
    
    Called by: Heartbeat monitor
    Permission: System/Backend only
    """
    if current_admin.get("role") not in ["super_admin", "platform_admin"]:
        raise HTTPException(status_code=403, detail="Unauthorized")
    
    try:
        doc_id = NotificationService.create_agent_offline_alert(
            org_id=request.org_id,
            agent_id=request.agent_id,
            agent_name=request.agent_name
        )
        return {
            "status": "success",
            "notification_id": doc_id,
            "message": f"Agent offline alert created for {request.agent_name}"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/agent-online")
async def create_agent_online_alert(
    request: AgentOnlineRequest,
    current_admin: dict = Depends(get_current_admin)
):
    """
    Create agent online alert (Automated)
    
    Called by: Heartbeat monitor
    Permission: System/Backend only
    """
    if current_admin.get("role") not in ["super_admin", "platform_admin"]:
        raise HTTPException(status_code=403, detail="Unauthorized")
    
    try:
        doc_id = NotificationService.create_agent_online_alert(
            org_id=request.org_id,
            agent_id=request.agent_id,
            agent_name=request.agent_name
        )
        return {
            "status": "success",
            "notification_id": doc_id,
            "message": f"Agent online alert created for {request.agent_name}"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/resource-warning")
async def create_resource_warning(
    request: ResourceWarningRequest,
    current_admin: dict = Depends(get_current_admin)
):
    """
    Create resource usage warning (Automated)
    
    Called by: System monitor
    Permission: super_admin, platform_admin
    """
    if current_admin.get("role") not in ["super_admin", "platform_admin"]:
        raise HTTPException(status_code=403, detail="Unauthorized")
    
    try:
        doc_id = NotificationService.create_resource_warning(
            org_id=request.org_id,
            resource_type=request.resource_type,
            usage_percent=request.usage_percent,
            agent_name=request.agent_name
        )
        return {
            "status": "success",
            "notification_id": doc_id,
            "message": f"Resource warning created for {request.org_id}"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/announcement")
async def create_announcement(
    request: AnnouncementRequest,
    current_admin: dict = Depends(get_current_admin)
):
    """
    Create manual announcement (Manual)
    
    Called by: Super Admin / Platform Admin
    Permission: super_admin only
    """
    if current_admin.get("role") != "super_admin":
        raise HTTPException(
            status_code=403,
            detail="Only super admins can create announcements"
        )
    
    try:
        doc_id = NotificationService.create_announcement(
            title=request.title,
            message=request.message,
            announcement_type=request.announcement_type,
            sender_email=current_admin.get("email"),
            sender_name=current_admin.get("full_name"),
            sender_role="super_admin",
            target_org_ids=request.target_org_ids
        )
        return {
            "status": "success",
            "notification_id": doc_id,
            "message": "Announcement created and sent"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/mark-read")
async def mark_notification_as_read(
    request: MarkAsReadRequest,
    current_admin: dict = Depends(get_current_admin)
):
    """
    Mark notification as read
    
    Called by: Frontend when admin opens notification
    """
    try:
        success = NotificationService.mark_as_read(
            notification_id=request.notification_id,
            admin_id=current_admin.get("email"),
            admin_name=current_admin.get("full_name")
        )
        
        if success:
            return {
                "status": "success",
                "message": "Notification marked as read"
            }
        else:
            raise HTTPException(status_code=500, detail="Failed to mark as read")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# Health check
@router.get("/health")
async def health_check():
    """Check if notifications service is running"""
    return {"status": "ok", "service": "notifications"}
