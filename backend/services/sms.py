import os
from twilio.rest import Client

TWILIO_ACCOUNT_SID = os.getenv('TWILIO_ACCOUNT_SID')
TWILIO_AUTH_TOKEN = os.getenv('TWILIO_AUTH_TOKEN')
TWILIO_PHONE_NUMBER = os.getenv('TWILIO_PHONE_NUMBER')

def send_sms(to_number: str, message: str) -> dict:
    """
    Sends an SMS via Twilio

    to_number must include country code
    e.g. +233244000000 for Ghana
    """
    try:
        if not TWILIO_ACCOUNT_SID or not TWILIO_AUTH_TOKEN:
            print("Twilio credentials not configured")
            return {
                'status': 'error',
                'message': 'SMS service not configured'
            }

        client = Client(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)

        msg = client.messages.create(
            body=message,
            from_=TWILIO_PHONE_NUMBER,
            to=to_number
        )

        print(f"SMS sent to {to_number} — SID: {msg.sid}")
        return {
            'status': 'success',
            'sid': msg.sid,
            'to': to_number
        }

    except Exception as e:
        print(f"SMS send error: {e}")
        return {
            'status': 'error',
            'message': str(e)
        }


def send_verification_sms(
    phone_number: str,
    org_name: str,
    token: str
) -> dict:
    """
    Sends verification token via SMS
    """
    message = (
        f"IntelliSense IDS\n"
        f"Your verification code for {org_name} is:\n\n"
        f"{token}\n\n"
        f"Enter this code in the app to activate your account.\n"
        f"This code expires in 24 hours."
    )
    return send_sms(phone_number, message)


def send_critical_alert_sms(
    phone_number: str,
    org_name: str,
    attack_type: str,
    severity: str,
    src_ip: str
) -> dict:
    """
    Sends critical alert SMS to security contacts
    """
    message = (
        f"[CRITICAL] IntelliSense IDS\n"
        f"{org_name}: {attack_type} detected\n"
        f"Source: {src_ip}\n"
        f"Severity: {severity.upper()}\n"
        f"Log in to your dashboard immediately."
    )
    return send_sms(phone_number, message)
