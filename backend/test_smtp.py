import smtplib
from email.mime.text import MIMEText

SMTP_USER = "gervinsmart@gmail.com"
SMTP_PASSWORD = "zjuwmvcyaheuqsfk"
TO_EMAIL = "kasserteea@gmail.com"

msg = MIMEText("SMTP test from IntelliSense IDS")
msg["Subject"] = "SMTP Test"
msg["From"] = SMTP_USER
msg["To"] = TO_EMAIL

with smtplib.SMTP("smtp.gmail.com", 587) as server:
    server.set_debuglevel(1)
    server.starttls()
    server.login(SMTP_USER, SMTP_PASSWORD)
    refused = server.sendmail(SMTP_USER, [TO_EMAIL], msg.as_string())
    print("REFUSED:", refused)

print("DONE")
