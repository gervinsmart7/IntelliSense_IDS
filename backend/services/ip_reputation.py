import requests
import os
from datetime import datetime, timedelta
from firebase_admin import firestore
from services.firebase import get_db

db = get_db()

ABUSEIPDB_API_KEY = os.getenv('ABUSEIPDB_API_KEY', '')

# Known malicious IP ranges for finance sector
# These are well-documented public ranges
FINANCE_THREAT_RANGES = [
    # Tor exit nodes range indicators
    '185.220.',
    '185.129.',
    '199.87.154.',
    # Known botnet ranges
    '192.42.116.',
    '176.10.104.',
]

def check_ip_reputation(ip_address: str) -> dict:
    """
    Check IP reputation against multiple sources

    1. Local cache in Firestore (check first)
    2. AbuseIPDB API (if key configured)
    3. Local known-bad ranges
    """
    if not ip_address or ip_address in [
        '127.0.0.1', 'localhost', '::1'
    ]:
        return {
            'ip': ip_address,
            'is_malicious': False,
            'confidence': 0,
            'source': 'whitelist'
        }

    # Check cache first
    cached = check_cache(ip_address)
    if cached:
        return cached

    result = {
        'ip': ip_address,
        'is_malicious': False,
        'confidence': 0,
        'abuse_score': 0,
        'country': 'Unknown',
        'isp': 'Unknown',
        'is_tor': False,
        'is_vpn': False,
        'reports': 0,
        'source': 'clean',
        'checked_at': datetime.utcnow().isoformat()
    }

    # Check local known-bad ranges
    for bad_range in FINANCE_THREAT_RANGES:
        if ip_address.startswith(bad_range):
            result['is_malicious'] = True
            result['confidence'] = 75
            result['source'] = 'local_blacklist'
            cache_result(ip_address, result)
            return result

    # Check AbuseIPDB if key configured
    if ABUSEIPDB_API_KEY:
        try:
            response = requests.get(
                'https://api.abuseipdb.com/api/v2/check',
                params={
                    'ipAddress': ip_address,
                    'maxAgeInDays': 30,
                    'verbose': True
                },
                headers={
                    'Key': ABUSEIPDB_API_KEY,
                    'Accept': 'application/json'
                },
                timeout=5
            )

            if response.status_code == 200:
                data = response.json().get('data', {})
                abuse_score = data.get('abuseConfidenceScore', 0)
                is_tor = data.get('isTor', False)

                result.update({
                    'abuse_score': abuse_score,
                    'country': data.get('countryCode', 'Unknown'),
                    'isp': data.get('isp', 'Unknown'),
                    'is_tor': is_tor,
                    'reports': data.get('totalReports', 0),
                    'is_malicious': abuse_score > 25 or is_tor,
                    'confidence': abuse_score,
                    'source': 'abuseipdb'
                })

        except Exception as e:
            print(f"AbuseIPDB check error: {e}")

    cache_result(ip_address, result)
    return result


def check_cache(ip_address: str) -> dict:
    """Check Firestore cache for recent IP check"""
    try:
        cache_doc = db.collection('ip_reputation_cache')\
                      .document(ip_address.replace('.', '_'))\
                      .get()

        if cache_doc.exists:
            data = cache_doc.to_dict()
            checked_at = data.get('checked_at')
            if checked_at:
                age = datetime.utcnow() - datetime.fromisoformat(
                    checked_at.replace('Z', '')
                )
                if age < timedelta(hours=24):
                    return data
    except Exception as e:
        print(f"Cache check error: {e}")
    return None


def cache_result(ip_address: str, result: dict):
    """Cache IP reputation result in Firestore"""
    try:
        db.collection('ip_reputation_cache')\
          .document(ip_address.replace('.', '_'))\
          .set(result)
    except Exception as e:
        print(f"Cache write error: {e}")


def get_finance_threat_intel() -> dict:
    """
    Returns aggregated threat intelligence
    specific to financial sector
    """
    try:
        # Get all cached reputation checks
        cache = db.collection('ip_reputation_cache').get()

        malicious_ips = []
        countries = {}
        isps = {}

        for doc in cache:
            data = doc.to_dict()
            if data.get('is_malicious'):
                malicious_ips.append(data)

                country = data.get('country', 'Unknown')
                countries[country] = countries.get(country, 0) + 1

                isp = data.get('isp', 'Unknown')
                isps[isp] = isps.get(isp, 0) + 1

        return {
            'total_malicious_ips': len(malicious_ips),
            'top_countries': sorted(
                countries.items(),
                key=lambda x: x[1],
                reverse=True
            )[:10],
            'top_isps': sorted(
                isps.items(),
                key=lambda x: x[1],
                reverse=True
            )[:10],
            'recent_threats': malicious_ips[:20]
        }

    except Exception as e:
        print(f"Threat intel error: {e}")
        return {}
