from firebase_admin import firestore
from services.firebase import get_db
from datetime import datetime, timedelta
import statistics

db = get_db()

def calculate_org_baseline(org_id: str) -> dict:
    """
    Calculates normal traffic baseline
    for a specific financial institution

    Uses last 7 days of alert data
    to establish what is normal
    """
    try:
        week_ago = datetime.utcnow() - timedelta(days=7)

        alerts = db.collection('alerts')\
                   .where(
                       filter=firestore.FieldFilter(
                           'org_id', '==', org_id
                       )
                   )\
                   .get()

        alert_list = [a.to_dict() for a in alerts]

        if not alert_list:
            return {
                'org_id': org_id,
                'has_baseline': False,
                'message': 'Not enough data for baseline'
            }

        # Hourly alert counts
        hourly_counts = {}
        for alert in alert_list:
            ts = alert.get('timestamp')
            if ts:
                try:
                    hour = ts.strftime('%H')
                    hourly_counts[hour] = (
                        hourly_counts.get(hour, 0) + 1
                    )
                except Exception:
                    pass

        # Attack type frequency
        attack_types = {}
        for alert in alert_list:
            at = alert.get('attack_type', 'Unknown')
            if at != 'BENIGN':
                attack_types[at] = (
                    attack_types.get(at, 0) + 1
                )

        # Source IP diversity
        src_ips = [
            a.get('src_ip')
            for a in alert_list
            if a.get('src_ip')
        ]
        unique_ips = len(set(src_ips))

        # Daily alert volume
        daily_total = len(alert_list) / 7

        # Calculate anomaly thresholds
        hourly_values = list(hourly_counts.values())
        avg_hourly = (
            statistics.mean(hourly_values)
            if hourly_values else 0
        )
        std_hourly = (
            statistics.stdev(hourly_values)
            if len(hourly_values) > 1 else 0
        )

        baseline = {
            'org_id': org_id,
            'has_baseline': True,
            'calculated_at': datetime.utcnow().isoformat(),
            'daily_avg_alerts': daily_total,
            'hourly_avg_alerts': avg_hourly,
            'hourly_std_alerts': std_hourly,
            'alert_threshold': avg_hourly + (std_hourly * 2),
            'unique_source_ips': unique_ips,
            'common_attack_types': dict(
                sorted(
                    attack_types.items(),
                    key=lambda x: x[1],
                    reverse=True
                )[:5]
            ),
            'peak_hours': sorted(
                hourly_counts.items(),
                key=lambda x: x[1],
                reverse=True
            )[:3],
            'total_alerts_7d': len(alert_list)
        }

        # Save baseline to Firestore
        db.collection('org_baselines')\
          .document(org_id)\
          .set(baseline)

        return baseline

    except Exception as e:
        print(f"Baseline calculation error: {e}")
        return {
            'org_id': org_id,
            'has_baseline': False,
            'error': str(e)
        }


def check_anomaly_vs_baseline(
    org_id: str,
    current_hour_count: int
) -> dict:
    """
    Compares current traffic to baseline
    Returns anomaly assessment
    """
    try:
        baseline_doc = db.collection('org_baselines')\
                         .document(org_id)\
                         .get()

        if not baseline_doc.exists:
            return {
                'is_anomaly': False,
                'reason': 'No baseline established'
            }

        baseline = baseline_doc.to_dict()

        if not baseline.get('has_baseline'):
            return {
                'is_anomaly': False,
                'reason': 'Baseline not ready'
            }

        threshold = baseline.get('alert_threshold', 0)
        avg = baseline.get('hourly_avg_alerts', 0)

        if current_hour_count > threshold and threshold > 0:
            deviation = (
                (current_hour_count - avg) / avg * 100
                if avg > 0 else 0
            )
            return {
                'is_anomaly': True,
                'severity': (
                    'critical' if deviation > 200
                    else 'high' if deviation > 100
                    else 'medium'
                ),
                'current_count': current_hour_count,
                'baseline_avg': avg,
                'threshold': threshold,
                'deviation_percent': deviation,
                'message': (
                    f"Traffic {deviation:.0f}% above baseline. "
                    f"Current: {current_hour_count}, "
                    f"Normal: {avg:.1f}"
                )
            }

        return {
            'is_anomaly': False,
            'current_count': current_hour_count,
            'baseline_avg': avg,
            'threshold': threshold
        }

    except Exception as e:
        print(f"Anomaly check error: {e}")
        return {'is_anomaly': False, 'error': str(e)}


def update_all_baselines():
    """
    Updates baselines for all organisations
    Called by scheduler weekly
    """
    try:
        orgs = db.collection('organisations')\
                 .where(
                     filter=firestore.FieldFilter(
                         'status', '==', 'active'
                     )
                 )\
                 .get()

        updated = 0
        for org in orgs:
            org_data = org.to_dict()
            org_id = org_data.get('org_id')
            if org_id:
                calculate_org_baseline(org_id)
                updated += 1

        print(f"Updated baselines for {updated} organisations")
        return updated

    except Exception as e:
        print(f"Baseline update error: {e}")
        return 0
