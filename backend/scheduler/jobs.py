from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger
from apscheduler.triggers.cron import CronTrigger
from firebase_admin import firestore
from services.firebase import get_db
from services.notifications import NotificationService
from services.baseline import update_all_baselines
from services.kill_chain import check_kill_chain
import logging

db = get_db()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

scheduler = BackgroundScheduler()

def get_retrain_interval():
    try:
        config = db.collection('system_config')\
                   .document('main').get().to_dict()
        return config.get('retrain_interval_days', 7)
    except Exception:
        return 7

def auto_retrain_job():
    """Automatic retraining job"""
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
            logger.info("Retrain conditions not met — skipping")
    except Exception as e:
        logger.error(f"Auto retrain error: {e}")

def check_agent_health_job():
    """Checks agent heartbeat and marks offline"""
    from datetime import datetime, timedelta
    logger.info("Checking agent health...")

    try:
        orgs = db.collection('organisations').where(
            filter=firestore.FieldFilter(
                'agent_status', '==', 'online'
            )
        ).get()

        offline_threshold = (
            datetime.utcnow() - timedelta(minutes=10)
        )

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
                            agent_name=data.get(
                                'name', data['org_code']
                            ),
                            last_seen=last_seen_dt
                        )
                    except Exception as e:
                        logger.error(
                            f"Agent offline notification error: {e}"
                        )

    except Exception as e:
        logger.error(f"Agent health check error: {e}")

def backup_audit_logs_job():
    """Backs up audit logs to S3 daily"""
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
            for key, val in data.items():
                if hasattr(val, 'isoformat'):
                    data[key] = val.isoformat()
            log_data.append(data)

        backup_key = (
            f"audit-backup/{date.today()}/audit_logs.json"
        )
        result = upload_object(
            json.dumps(log_data).encode(),
            backup_key,
            content_type='application/json'
        )

        if result['status'] == 'success':
            logger.info(f"Audit logs backed up: {backup_key}")
        else:
            logger.error("Audit log backup failed")

    except Exception as e:
        logger.error(f"Audit backup error: {e}")

def update_baselines_job():
    """
    Updates traffic baselines for all orgs
    Runs weekly
    """
    logger.info("Updating organisation baselines...")
    try:
        from services.baseline import update_all_baselines
        updated = update_all_baselines()
        logger.info(f"Baselines updated for {updated} organisations")
    except Exception as e:
        logger.error(f"Baseline update error: {e}")

def check_kill_chains_job():
    """
    Checks for active kill chain patterns
    Runs hourly
    """
    logger.info("Checking kill chain patterns...")
    try:
        from services.kill_chain import check_kill_chain

        orgs = db.collection('organisations').where(
            filter=firestore.FieldFilter(
                'status', '==', 'active'
            )
        ).get()

        for org in orgs:
            org_id = org.to_dict().get('org_id')
            if org_id:
                matches = check_kill_chain(org_id)
                if matches:
                    logger.info(
                        f"Kill chain matches for {org_id}: "
                        f"{[m['chain_name'] for m in matches]}"
                    )

    except Exception as e:
        logger.error(f"Kill chain check error: {e}")

def daily_security_briefing_job():
    """
    Sends daily security briefing email
    to all org admin notification contacts
    Runs at 8am daily
    """
    logger.info("Sending daily security briefings...")
    try:
        from datetime import datetime, timedelta

        yesterday_start = datetime.utcnow().replace(
            hour=0, minute=0, second=0
        ) - timedelta(days=1)

        orgs = db.collection('organisations').where(
            filter=firestore.FieldFilter(
                'status', '==', 'active'
            )
        ).get()

        for org_doc in orgs:
            org_data = org_doc.to_dict()
            org_id = org_data.get('org_id')
            org_name = org_data.get('name', '')
            contacts = org_data.get(
                'notification_contacts', []
            )

            if not contacts:
                continue

            # Get yesterday's alerts for this org
            try:
                alerts = db.collection('alerts').where(
                    filter=firestore.FieldFilter(
                        'org_id', '==', org_id
                    )
                ).get()

                alert_list = [a.to_dict() for a in alerts]

                total = len(alert_list)
                critical = len([
                    a for a in alert_list
                    if a.get('severity') == 'critical'
                ])
                high = len([
                    a for a in alert_list
                    if a.get('severity') == 'high'
                ])
                resolved = len([
                    a for a in alert_list
                    if a.get('alert_status') == 'resolved'
                ])
                unresolved = len([
                    a for a in alert_list
                    if a.get('alert_status', 'new')
                    in ['new', 'investigating']
                ])

                # Calculate risk
                from services.risk import calculate_org_risk_score
                risk = calculate_org_risk_score(org_id)
                risk_score = risk.get('score', 0)
                risk_level = risk.get('level', 'low')

                # Build briefing email
                recipients = [
                    c['email']
                    for c in contacts
                    if c.get('email')
                ]

                if not recipients:
                    continue

                status_color = {
                    'critical': '#F87171',
                    'high': '#FBBF24',
                    'medium': '#6366F1',
                    'low': '#34D399'
                }.get(risk_level, '#34D399')

                html_body = f'''
                    <!DOCTYPE html>
                    <html>
                    <body style="font-family: Arial, sans-serif;
                                 background: #0F1117;
                                 color: #E2E8F0;
                                 padding: 40px; margin: 0;">
                      <div style="max-width: 520px;
                                  margin: 0 auto;
                                  background: #1A1D27;
                                  border-radius: 16px;
                                  padding: 40px;
                                  border: 1px solid
                                  rgba(255,255,255,0.06);">

                        <p style="font-weight: 700;
                                  font-size: 18px;
                                  color: #E2E8F0;
                                  margin: 0 0 24px 0;">
                          🛡️ Daily Security Briefing
                        </p>

                        <p style="font-size: 14px;
                                  color: #64748B;
                                  margin-bottom: 20px;">
                          Good morning. Here is your
                          security summary for
                          <strong style="color: #E2E8F0;">
                            {org_name}
                          </strong>.
                        </p>

                        <div style="background: #22263A;
                                    border-radius: 10px;
                                    padding: 20px;
                                    margin-bottom: 20px;">
                          <div style="display: flex;
                                      justify-content: space-between;
                                      margin-bottom: 12px;">
                            <span style="font-size: 13px;
                                         color: #64748B;">
                              Risk Score
                            </span>
                            <span style="font-size: 16px;
                                         font-weight: 700;
                                         color: {status_color};">
                              {risk_score}/100
                              ({risk_level.upper()})
                            </span>
                          </div>
                          <div style="display: flex;
                                      justify-content: space-between;
                                      margin-bottom: 8px;">
                            <span style="font-size: 13px;
                                         color: #64748B;">
                              Total Alerts
                            </span>
                            <span style="font-size: 13px;
                                         color: #E2E8F0;">
                              {total}
                            </span>
                          </div>
                          <div style="display: flex;
                                      justify-content: space-between;
                                      margin-bottom: 8px;">
                            <span style="font-size: 13px;
                                         color: #64748B;">
                              Critical
                            </span>
                            <span style="font-size: 13px;
                                         color: #F87171;">
                              {critical}
                            </span>
                          </div>
                          <div style="display: flex;
                                      justify-content: space-between;
                                      margin-bottom: 8px;">
                            <span style="font-size: 13px;
                                         color: #64748B;">
                              High
                            </span>
                            <span style="font-size: 13px;
                                         color: #FBBF24;">
                              {high}
                            </span>
                          </div>
                          <div style="display: flex;
                                      justify-content: space-between;
                                      margin-bottom: 8px;">
                            <span style="font-size: 13px;
                                         color: #64748B;">
                              Resolved
                            </span>
                            <span style="font-size: 13px;
                                         color: #34D399;">
                              {resolved}
                            </span>
                          </div>
                          <div style="display: flex;
                                      justify-content: space-between;">
                            <span style="font-size: 13px;
                                         color: #64748B;">
                              Needs Attention
                            </span>
                            <span style="font-size: 13px;
                                         color: #FBBF24;">
                              {unresolved}
                            </span>
                          </div>
                        </div>

                        <p style="font-size: 12px;
                                  color: #64748B;
                                  margin-bottom: 0;">
                          Log in to your IntelliSense IDS
                          dashboard to review and investigate
                          any open alerts.
                        </p>

                        <div style="margin-top: 32px;
                                    padding-top: 24px;
                                    border-top: 1px solid
                                    rgba(255,255,255,0.06);">
                          <p style="font-size: 11px;
                                    color: #64748B;
                                    margin: 0;">
                            IntelliSense IDS —
                            Financial Security Platform 2026
                          </p>
                        </div>
                      </div>
                    </body>
                    </html>
                '''

                db.collection('mail').add({
                    'to': recipients,
                    'message': {
                        'subject': (
                            f"Daily Security Briefing — "
                            f"{org_name} | "
                            f"Risk: {risk_level.upper()}"
                        ),
                        'html': html_body
                    }
                })

                logger.info(
                    f"Daily briefing sent for {org_name}"
                )

            except Exception as e:
                logger.error(
                    f"Daily briefing error for {org_id}: {e}"
                )

    except Exception as e:
        logger.error(f"Daily briefing job error: {e}")

def start_scheduler():
    """Starts all scheduled jobs"""
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

    # Baseline update weekly
    scheduler.add_job(
        update_baselines_job,
        trigger=IntervalTrigger(weeks=1),
        id='update_baselines',
        name='Organisation Baseline Update',
        replace_existing=True
    )

    # Kill chain check hourly

def check_all_kill_chains():
    try:
        db = get_db()
        orgs = db.collection('organisations').where(
            filter=firestore.FieldFilter('status', '==', 'active')
        ).get()
        for org in orgs:
            org_id = org.to_dict().get('org_id')
            if org_id:
                check_kill_chain(org_id)
    except Exception as e:
        print(f"Kill chain check error: {e}")

    scheduler.add_job(
        check_kill_chains_job,
        trigger=IntervalTrigger(hours=1),
        id='kill_chain_check',
        name='Kill Chain Detection',
        replace_existing=True
    )

    # Daily security briefing at 8am UTC
    scheduler.add_job(
        daily_security_briefing_job,
        trigger=CronTrigger(hour=8, minute=0),
        id='daily_briefing',
        name='Daily Security Briefing',
        replace_existing=True
    )

    scheduler.start()
    logger.info(
        f"Scheduler started — "
        f"Retraining every {interval_days} days | "
        f"Kill chains hourly | "
        f"Briefings daily at 8am UTC"
    )

def stop_scheduler():
    if scheduler.running:
        scheduler.shutdown()
        logger.info("Scheduler stopped")

def update_retrain_schedule(new_interval_days):
    scheduler.reschedule_job(
        'auto_retrain',
        trigger=IntervalTrigger(days=new_interval_days)
    )
    logger.info(
        f"Retrain schedule updated to {new_interval_days} days"
    )
