from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger
from firebase_admin import firestore
from services.firebase import get_db
from services.notifications import NotificationService
import logging

db = get_db()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

scheduler = BackgroundScheduler()

def get_retrain_interval():
    """
    Gets retraining interval from
    system config in Firestore
    Admin can change this value
    """
    try:
        config = db.collection('system_config')\
                   .document('main').get().to_dict()
        return config.get('retrain_interval_days', 7)
    except Exception:
        return 7

def auto_retrain_job():
    """
    Automatic retraining job
    Runs on schedule
    """
    logger.info("Auto retraining job triggered")

    try:
        from ml.retrain import (
            run_retraining_pipeline,
            check_retrain_conditions
        )

        if check_retrain_conditions():
            result = run_retraining_pipeline(
                triggered_by='auto'
            )
            logger.info(f"Auto retrain result: {result['status']}")
        else:
            logger.info(
                "Retrain conditions not met — skipping"
            )

    except Exception as e:
        logger.error(f"Auto retrain error: {e}")

def check_agent_health_job():
    """
    Checks agent heartbeat status
    Marks agents as offline if no
    heartbeat for 10 minutes
    """
    from datetime import datetime, timedelta

    logger.info("Checking agent health...")

    try:
        orgs = db.collection('organisations').where(
            filter=firestore.FieldFilter(
                'agent_status', '==', 'online'
            )
        ).get()

        offline_threshold = datetime.utcnow() - timedelta(minutes=10)

        for org in orgs:
            data = org.to_dict()
            last_seen = data.get('last_seen')

            if last_seen:
                last_seen_dt = last_seen.replace(tzinfo=None)
                if last_seen_dt < offline_threshold:
                    org.reference.update({
                        'agent_status': 'offline'
                    })
                    logger.info(
                        f"Agent {data['org_code']} marked offline"
                    )
                    try:
                        NotificationService.create_agent_offline_alert(
                            org_id=data['org_id'],
                            agent_id=data['org_id'],
                            agent_name=data.get('name', data['org_code']),
                            last_seen=last_seen_dt
                        )
                    except Exception as e:
                        logger.error(f"Agent offline notification error: {e}")

    except Exception as e:
        logger.error(f"Agent health check error: {e}")

def backup_audit_logs_job():
    """
    Backs up audit logs to S3 daily
    """
    from datetime import date
    import json
    from services.s3 import upload_object

    logger.info("Backing up audit logs to S3...")

    try:
        logs = db.collection('audit_logs')\
                 .order_by('timestamp')\
                 .get()

        log_data = []
        for log in logs:
            data = log.to_dict()
            # Convert timestamps to string
            for key, val in data.items():
                if hasattr(val, 'isoformat'):
                    data[key] = val.isoformat()
            log_data.append(data)

        backup_key = f"audit-backup/{date.today()}/audit_logs.json"
        result = upload_object(
            json.dumps(log_data).encode(),
            backup_key,
            content_type='application/json'
        )

        if result['status'] == 'success':
            logger.info(
                f"Audit logs backed up: {backup_key}"
            )
        else:
            logger.error("Audit log backup failed")

    except Exception as e:
        logger.error(f"Audit backup error: {e}")

def start_scheduler():
    """
    Starts all scheduled jobs
    """
    interval_days = get_retrain_interval()

    # Retraining job
    scheduler.add_job(
        auto_retrain_job,
        trigger=IntervalTrigger(days=interval_days),
        id='auto_retrain',
        name='Automatic Model Retraining',
        replace_existing=True
    )

    # Agent health check every 5 minutes
    scheduler.add_job(
        check_agent_health_job,
        trigger=IntervalTrigger(minutes=5),
        id='agent_health',
        name='Agent Health Check',
        replace_existing=True
    )

    # Audit log backup daily
    scheduler.add_job(
        backup_audit_logs_job,
        trigger=IntervalTrigger(days=1),
        id='audit_backup',
        name='Audit Log Backup',
        replace_existing=True
    )

    scheduler.start()
    logger.info(
        f"Scheduler started — "
        f"Retraining every {interval_days} days"
    )

def stop_scheduler():
    if scheduler.running:
        scheduler.shutdown()
        logger.info("Scheduler stopped")

def update_retrain_schedule(new_interval_days):
    """
    Updates retraining schedule
    Called when admin changes interval
    """
    scheduler.reschedule_job(
        'auto_retrain',
        trigger=IntervalTrigger(days=new_interval_days)
    )
    logger.info(
        f"Retrain schedule updated to {new_interval_days} days"
    )
