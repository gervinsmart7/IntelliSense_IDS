import os
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from dotenv import load_dotenv

load_dotenv()

SMTP_HOST = os.getenv('SMTP_HOST', 'smtp.gmail.com')
SMTP_PORT = int(os.getenv('SMTP_PORT', '587'))
SMTP_USER = os.getenv('SMTP_USER')
SMTP_PASSWORD = os.getenv('SMTP_PASSWORD')
FROM_EMAIL = os.getenv('FROM_EMAIL', SMTP_USER or '')
FRONTEND_URL = os.getenv('FRONTEND_URL', 'http://localhost:5173')


def send_email(to_email: str, subject: str, html_body: str):
    """
    Sends an HTML email using Gmail SMTP.
    Requires SMTP_USER and SMTP_PASSWORD in .env.
    """
    if not SMTP_USER or not SMTP_PASSWORD:
        print('Email send error: SMTP_USER or SMTP_PASSWORD is missing')
        return False

    message = MIMEMultipart('alternative')
    message['From'] = FROM_EMAIL
    message['To'] = to_email
    message['Subject'] = subject
    message.attach(MIMEText(html_body, 'html'))

    try:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
            server.starttls()
            server.login(SMTP_USER, SMTP_PASSWORD)
            refused = server.sendmail(FROM_EMAIL, [to_email], message.as_string())
        if refused:
            return False
            print(f'Email refused: {refused}')
    
        print(f'Email sent to {to_email}')
        return True
    except Exception as e:
        print(f'Email send error: {e}')
        return False

def send_password_reset_email(email: str, reset_token: str):
    """
    Sends a password reset email with a link to the frontend reset page.
    """
    reset_url = FRONTEND_URL + '/reset-password/' + reset_token

    html_body = f"""
    <!DOCTYPE html>
    <html>
    <body style="font-family: Arial, sans-serif; background: #0F1117; color: #E2E8F0; padding: 40px; margin: 0;">
      <div style="max-width: 520px; margin: 0 auto; background: #1A1D27; border-radius: 16px; padding: 40px; border: 1px solid rgba(255,255,255,0.06);">
        <h1 style="font-size: 24px; font-weight: 700; color: #E2E8F0; margin-bottom: 8px;">Reset your password</h1>
        <p style="font-size: 14px; color: #94A3B8; line-height: 1.6;">
          A password reset was requested for your IntelliSense IDS account.
        </p>
        <div style="text-align: center; margin: 32px 0;">
          <a href="{reset_url}" style="display: inline-block; background: #2563EB; color: white; text-decoration: none; padding: 14px 28px; border-radius: 10px; font-weight: bold;">Reset Password</a>
        </div>
        <p style="font-size: 12px; color: #64748B; line-height: 1.6; word-break: break-all;">If the button does not work, use this link: <br><br>{reset_url}</p>
        <p style="font-size: 12px; color: #64748B; text-align: center; margin-top: 24px;">This link expires in 1 hour.</p>
      </div>
    </body>
    </html>
    """

    return send_email(
        to_email=email,
        subject='Reset your IntelliSense IDS password',
        html_body=html_body
    )


def send_verification_email(
    email: str,
    org_name: str,
    org_code: str,
    verification_token: str
):
    """
    Sends verification email to organisation admin
    """
    verification_url = (
        FRONTEND_URL +
        '/verify-email/' +
        verification_token
    )

    html_body = f"""
    <!DOCTYPE html>
    <html>
    <body style="
                 font-family: Arial, sans-serif;
                 background: #0F1117;
                 color: #E2E8F0;
                 padding: 40px;
                 margin: 0;">

      <div style="max-width: 520px;
                  margin: 0 auto;
                  background: #1A1D27;
                  border-radius: 16px;
                  padding: 40px;
                  border: 1px solid rgba(255,255,255,0.06);">

        <div style="margin-bottom: 32px;">
          <p style="font-weight: 700;
                    font-size: 20px;
                    color: #E2E8F0;
                    margin: 0 0 4px 0;">
            🛡️ IntelliSense IDS
          </p>
          <p style="font-size: 12px;
                    color: #64748B;
                    margin: 0;">
            AI-Powered Security Platform
          </p>
        </div>

        <h1 style="font-size: 24px;
                   font-weight: 700;
                   color: #E2E8F0;
                   margin-bottom: 8px;">
          Verify your email
        </h1>

        <p style="font-size: 14px;
                  color: #64748B;
                  margin-bottom: 8px;
                  line-height: 1.6;">
          Hello, you have registered your organisation on
          <strong>IntelliSense IDS</strong>.
        </p>

        <div style="
            background: #111827;
            padding: 16px;
            border-radius: 12px;
            margin: 24px 0;
        ">
          <p style="margin: 0 0 8px 0;">
            <strong>Organisation Name:</strong> {org_name}
          </p>

          <p style="margin: 0;">
            <strong>Organisation Code:</strong> {org_code}
          </p>
        </div>

        <p style="
            font-size: 14px;
            color: #94A3B8;
            line-height: 1.6;
        ">
          To activate your administrator account, verify your email address
          using the button below.
        </p>

        <div style="
            text-align: center;
            margin: 32px 0;
        ">
          <a href="{verification_url}"
             style="
                display: inline-block;
                background: #2563EB;
                color: white;
                text-decoration: none;
                padding: 14px 28px;
                border-radius: 10px;
                font-weight: bold;
             ">
             Verify Email
          </a>
        </div>

        <p style="
            font-size: 12px;
            color: #64748B;
            line-height: 1.6;
            word-break: break-all;
        ">
          If the button does not work, copy and paste the link below into
          your browser:
          <br><br>
          {verification_url}
        </p>

        <hr style="
            border: none;
            border-top: 1px solid #374151;
            margin: 24px 0;
        ">

        <p style="
            font-size: 12px;
            color: #64748B;
            text-align: center;
        ">
          This verification link expires in 5mins.
        </p>

        <p style="
            font-size: 12px;
            color: #64748B;
            text-align: center;
        ">
          © IntelliSense IDS Platform
        </p>

      </div>

    </body>
    </html>
    """

    return send_email(
        to_email=email,
        subject=subject,
        html_body=html_body
    )
