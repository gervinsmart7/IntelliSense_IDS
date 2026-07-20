import os
from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail

SENDGRID_API_KEY = os.getenv('SENDGRID_API_KEY')
SENDGRID_FROM_EMAIL = os.getenv('SENDGRID_FROM_EMAIL')
SENDGRID_FROM_NAME = os.getenv('SENDGRID_FROM_NAME', 'IntelliSense IDS')


def send_email(to_email: str, subject: str, html_content: str) -> dict:
    """
    Core email sender via SendGrid
    """
    try:
        if not SENDGRID_API_KEY:
            print("SendGrid API key not configured")
            return {'status': 'error', 'message': 'Email not configured'}

        message = Mail(
            from_email=(SENDGRID_FROM_EMAIL, SENDGRID_FROM_NAME),
            to_emails=to_email,
            subject=subject,
            html_content=html_content
        )

        sg = SendGridAPIClient(SENDGRID_API_KEY)
        response = sg.send(message)

        print(f"Email sent to {to_email} — Status: {response.status_code}")
        return {'status': 'success', 'status_code': response.status_code}

    except Exception as e:
        print(f"SendGrid error: {e}")
        return {'status': 'error', 'message': str(e)}


def send_verification_email(
    to_email: str,
    org_name: str,
    token: str
) -> dict:
    """
    Sends 6-digit verification code to new org admin
    """
    subject = f"Your IntelliSense IDS verification code is {token}"

    html = f'''
    <!DOCTYPE html>
    <html>
    <body style="font-family:Arial,sans-serif;background:#0F1117;
                 color:#E2E8F0;padding:40px;margin:0;">
      <div style="max-width:520px;margin:0 auto;background:#1A1D27;
                  border-radius:16px;padding:40px;
                  border:1px solid rgba(255,255,255,0.06);">

        <!-- Logo -->
        <div style="margin-bottom:32px;">
          <p style="font-weight:700;font-size:18px;
                    color:#E2E8F0;margin:0 0 2px 0;">
            🛡️ IntelliSense IDS
          </p>
          <p style="font-size:10px;color:rgba(255,255,255,0.4);
                    margin:0;letter-spacing:0.1em;">
            FINANCIAL SECURITY PLATFORM
          </p>
        </div>

        <h1 style="font-size:22px;font-weight:700;
                   color:#E2E8F0;margin-bottom:8px;">
          Verify Your Account
        </h1>

        <p style="font-size:14px;color:#64748B;
                  margin-bottom:28px;line-height:1.6;">
          Hello, you registered
          <strong style="color:#E2E8F0;">{org_name}</strong>
          on IntelliSense IDS. Enter the code below
          to verify your account.
        </p>

        <!-- Code box -->
        <div style="background:#22263A;
                    border:1px solid rgba(99,102,241,0.3);
                    border-radius:12px;padding:32px;
                    text-align:center;margin-bottom:28px;">
          <p style="font-size:12px;color:#64748B;
                    text-transform:uppercase;
                    letter-spacing:0.1em;margin-bottom:12px;">
            Your Verification Code
          </p>
          <p style="font-size:52px;font-weight:800;
                    color:#6366F1;font-family:monospace;
                    letter-spacing:12px;margin:0;">
            {token}
          </p>
          <p style="font-size:12px;color:#64748B;margin-top:14px;">
            Expires in 24 hours
          </p>
        </div>

        <p style="font-size:13px;color:#64748B;line-height:1.6;">
          Enter this code in the registration form to complete
          your account setup. If you did not register on
          IntelliSense IDS please ignore this email.
        </p>

        <div style="margin-top:32px;padding-top:24px;
                    border-top:1px solid rgba(255,255,255,0.06);">
          <p style="font-size:11px;color:#64748B;margin:0;">
            IntelliSense IDS — Financial Security Platform 2026
          </p>
        </div>
      </div>
    </body>
    </html>
    '''

    return send_email(to_email, subject, html)


def send_welcome_email(
    to_email: str,
    org_name: str,
    org_code: str,
    api_key: str
) -> dict:
    """
    Sends welcome email with API key after successful verification
    """
    subject = f"Welcome to IntelliSense IDS — Your API Key Inside"

    html = f'''
    <!DOCTYPE html>
    <html>
    <body style="font-family:Arial,sans-serif;background:#0F1117;
                 color:#E2E8F0;padding:40px;margin:0;">
      <div style="max-width:520px;margin:0 auto;background:#1A1D27;
                  border-radius:16px;padding:40px;
                  border:1px solid rgba(255,255,255,0.06);">

        <div style="margin-bottom:32px;">
          <p style="font-weight:700;font-size:18px;
                    color:#E2E8F0;margin:0 0 2px 0;">
            🛡️ IntelliSense IDS
          </p>
          <p style="font-size:10px;color:rgba(255,255,255,0.4);
                    margin:0;letter-spacing:0.1em;">
            FINANCIAL SECURITY PLATFORM
          </p>
        </div>

        <!-- Success banner -->
        <div style="background:rgba(52,211,153,0.08);
                    border:1px solid rgba(52,211,153,0.2);
                    border-radius:10px;padding:16px 20px;
                    margin-bottom:28px;">
          <p style="font-size:14px;font-weight:700;
                    color:#34D399;margin:0 0 2px 0;">
            ✅ Account Verified Successfully
          </p>
          <p style="font-size:12px;color:#64748B;margin:0;">
            Your institution is now active on the platform
          </p>
        </div>

        <h1 style="font-size:20px;font-weight:700;
                   color:#E2E8F0;margin-bottom:20px;">
          Welcome, {org_name}
        </h1>

        <!-- Org details -->
        <div style="background:#22263A;border-radius:10px;
                    padding:16px 20px;margin-bottom:20px;">
          <div style="display:flex;justify-content:space-between;
                      margin-bottom:10px;">
            <span style="font-size:12px;color:#64748B;">Institution</span>
            <span style="font-size:13px;color:#E2E8F0;
                         font-weight:600;">{org_name}</span>
          </div>
          <div style="display:flex;justify-content:space-between;">
            <span style="font-size:12px;color:#64748B;">Org Code</span>
            <span style="font-size:13px;color:#6366F1;
                         font-family:monospace;
                         font-weight:700;">{org_code}</span>
          </div>
        </div>

        <!-- API Key -->
        <p style="font-size:13px;font-weight:600;
                  color:#E2E8F0;margin-bottom:8px;">
          Your Agent API Key
        </p>
        <div style="background:#22263A;
                    border:1px solid rgba(99,102,241,0.2);
                    border-radius:8px;padding:14px 16px;
                    margin-bottom:12px;word-break:break-all;">
          <p style="font-size:12px;color:#6366F1;
                    font-family:monospace;margin:0;">
            {api_key}
          </p>
        </div>

        <!-- Warning -->
        <div style="background:rgba(251,191,36,0.08);
                    border:1px solid rgba(251,191,36,0.2);
                    border-radius:8px;padding:12px 16px;
                    margin-bottom:24px;">
          <p style="font-size:12px;color:#FBBF24;margin:0;">
            ⚠️ Keep this key private. Do not share it.
            You need it to configure your IDS agent.
            Regenerate it from your dashboard if compromised.
          </p>
        </div>

        <!-- Next steps -->
        <p style="font-size:13px;color:#64748B;
                  line-height:1.8;margin-bottom:0;">
          Next steps:<br/>
          1. Log in to your dashboard<br/>
          2. Go to Agent Status page<br/>
          3. Follow the install instructions<br/>
          4. Enter your API key above when prompted<br/>
          5. Agent appears online automatically
        </p>

        <div style="margin-top:32px;padding-top:24px;
                    border-top:1px solid rgba(255,255,255,0.06);">
          <p style="font-size:11px;color:#64748B;margin:0;">
            IntelliSense IDS — Financial Security Platform 2026
          </p>
        </div>
      </div>
    </body>
    </html>
    '''

    return send_email(to_email, subject, html)