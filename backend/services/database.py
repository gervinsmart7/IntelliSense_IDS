from firebase_admin import firestore
from services.firebase import get_db

db = get_db()

# ─────────────────────────────────────────
# COLLECTION NAMES
# ─────────────────────────────────────────
ADMINS = 'admins'
ORGANISATIONS = 'organisations'
ALERTS = 'alerts'
AUDIT_LOGS = 'audit_logs'
MODEL_VERSIONS = 'model_versions'
RETRAIN_JOBS = 'retrain_jobs'
INVITATIONS = 'invitations'
VERIFICATION_TOKENS = 'verification_tokens'
SYSTEM_CONFIG = 'system_config'

# ─────────────────────────────────────────
# ADMIN SCHEMA
# ─────────────────────────────────────────
# {
#   admin_id        : str (UUID)
#   email           : str
#   full_name       : str
#   role            : str (super_admin, platform_admin, org_admin)
#   org_id          : str or None
#   org_code        : str or None
#   password_hash   : str
#   is_active       : bool
#   is_locked       : bool
#   failed_attempts : int
#   known_ips       : list
#   created_by      : str
#   created_at      : timestamp
#   last_login      : timestamp or None
# }

# ─────────────────────────────────────────
# ORGANISATION SCHEMA
# ─────────────────────────────────────────
# {
#   org_id          : str (UUID)
#   org_code        : str (e.g. GCB-AF3C)
#   name            : str
#   type            : str
#   country         : str
#   city            : str
#   domain          : str
#   api_key_hash    : str
#   status          : str (pending, active, suspended)
#   agent_status    : str (online, offline, not_installed)
#   model_version   : str or None
#   last_sync       : timestamp or None
#   created_at      : timestamp
# }

# ─────────────────────────────────────────
# ALERT SCHEMA
# ─────────────────────────────────────────
# {
#   alert_id        : str (UUID)
#   org_id          : str
#   org_code        : str
#   attack_type     : str
#   severity        : str (critical, high, medium, low)
#   src_ip          : str
#   dst_ip          : str
#   src_port        : int
#   dst_port        : int
#   protocol        : str
#   confidence      : float
#   flow_duration   : float
#   is_dismissed    : bool
#   timestamp       : timestamp
# }

# ─────────────────────────────────────────
# MODEL VERSION SCHEMA
# ─────────────────────────────────────────
# {
#   version         : str (e.g. v1.0)
#   f1_score        : float
#   precision       : float
#   recall          : float
#   accuracy        : float
#   s3_key          : str
#   checksum        : str
#   is_production   : bool
#   trained_on      : int (number of samples)
#   triggered_by    : str (auto or manual)
#   deployed_at     : timestamp
#   created_at      : timestamp
# }

# ─────────────────────────────────────────
# AUDIT LOG SCHEMA
# ─────────────────────────────────────────
# {
#   log_id          : str (UUID)
#   admin_id        : str
#   admin_email     : str
#   admin_role      : str
#   action_type     : str
#   action_detail   : str
#   target_org_id   : str or None
#   target_org_code : str or None
#   ip_address      : str
#   status          : str (success, failed, denied)
#   timestamp       : timestamp
# }

# ─────────────────────────────────────────
# SYSTEM CONFIG SCHEMA
# ─────────────────────────────────────────
# {
#   retrain_interval_days    : int
#   min_log_threshold        : int
#   confidence_threshold     : float
#   alert_email_enabled      : bool
#   smtp_email               : str
# }

def initialize_system_config():
    """
    Creates default system config if it does not exist
    """
    config_ref = db.collection(SYSTEM_CONFIG).document('main')
    if not config_ref.get().exists:
        config_ref.set({
            'retrain_interval_days': 7,
            'min_log_threshold': 1000,
            'confidence_threshold': 0.75,
            'alert_email_enabled': False,
            'smtp_email': '',
            'created_at': firestore.SERVER_TIMESTAMP
        })
        print("System config initialized")
    else:
        print("System config already exists")

