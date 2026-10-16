from __future__ import annotations

import os
import smtplib
import logging
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

logger = logging.getLogger("email_service")

SMTP_EMAIL = os.getenv("SMTP_EMAIL", "webflowcommunity@srinivasuniversity.edu.in")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "cbqaqigrsfibpvkz")
SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "465"))

def send_ticket_confirmation_email(
    to_email: str,
    recipient_name: str,
    ticket_number: str,
    tier: str,
    amount: float,
    security_hash: str,
    created_at: str,
) -> bool:
    """
    Sends a sleek, purple-blue HTML EchoSphere concert pass confirmation email.
    Uses SSL on port 465 with the provided Google Workspace credentials.
    """
    try:
        subject = f"🎟️ Your EchoSphere Pass #{ticket_number}: Najran Kabeer × Benji Beats Live!"

        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = f"EchoSphere Concert <{SMTP_EMAIL}>"
        msg["To"] = to_email

        text_body = f"""
Hello {recipient_name},

Thank you for booking your official pass for ECHOSPHERE 2026!
Presented by Webflow Community in collaboration with Rotaract at Srinivas University Mukka (SUIET).

TICKET DETAILS:
- Ticket ID: #{ticket_number}
- Tier: {tier}
- Amount Paid: ₹{amount:.0f} INR
- Date: Monday, 2nd November 2026 | 5:30 PM IST
- Venue: Srinivas University Mukka (SUIET Campus), Mangalore
- Headliners: Najran Kabeer × Benji Beats
- Security Verification Token: {security_hash[:16]}...

Please present this ticket ID at the SUIET gate entry.
Gates open at 4:30 PM IST.

See you at EchoSphere!
        """

        html_body = f"""
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Your EchoSphere Concert Pass</title>
  <style>
    body {{
      margin: 0;
      padding: 0;
      background-color: #060714;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      color: #e2e8f0;
    }}
    .wrapper {{
      max-width: 600px;
      margin: 30px auto;
      background: linear-gradient(180deg, #0e122b 0%, #070918 100%);
      border: 1px solid #2b1f55;
      border-radius: 20px;
      overflow: hidden;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.85);
    }}
    .header {{
      background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #3b82f6 100%);
      padding: 36px 30px;
      text-align: center;
      position: relative;
    }}
    .header h1 {{
      margin: 4px 0;
      color: #ffffff;
      font-size: 26px;
      font-weight: 900;
      letter-spacing: 1px;
      text-transform: uppercase;
    }}
    .header .subtitle {{
      margin: 0;
      color: #ede9fe;
      font-size: 11px;
      letter-spacing: 2px;
      font-weight: 700;
      text-transform: uppercase;
    }}
    .ticket-body {{
      padding: 32px 30px;
    }}
    .pass-badge {{
      display: inline-block;
      background: rgba(139, 92, 246, 0.18);
      border: 1px solid #8b5cf6;
      color: #c4b5fd;
      padding: 6px 16px;
      border-radius: 9999px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      margin-bottom: 20px;
    }}
    .ticket-id-box {{
      background: #080a1c;
      border: 1px dashed #4338ca;
      border-radius: 14px;
      padding: 20px;
      text-align: center;
      margin-bottom: 24px;
    }}
    .ticket-id-title {{
      font-size: 11px;
      color: #94a3b8;
      text-transform: uppercase;
      letter-spacing: 1.5px;
      margin-bottom: 6px;
    }}
    .ticket-id-val {{
      font-size: 38px;
      font-weight: 900;
      letter-spacing: 3px;
      color: #60a5fa;
      font-family: 'Courier New', Courier, monospace;
    }}
    .details-table {{
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 24px;
    }}
    .details-table td {{
      padding: 10px 0;
      border-bottom: 1px solid #1e1b4b;
      font-size: 13px;
    }}
    .details-table td.label {{
      color: #94a3b8;
      width: 35%;
    }}
    .details-table td.value {{
      color: #f8fafc;
      font-weight: 600;
      text-align: right;
    }}
    .barcode-box {{
      text-align: center;
      padding: 16px;
      background: #ffffff;
      border-radius: 12px;
      margin-top: 15px;
    }}
    .barcode-text {{
      letter-spacing: 8px;
      font-size: 18px;
      font-family: monospace;
      font-weight: bold;
      color: #0f172a;
    }}
    .footer {{
      background: #060714;
      padding: 24px 30px;
      text-align: center;
      border-top: 1px solid #1e1b4b;
      font-size: 11px;
      color: #64748b;
      line-height: 1.6;
    }}
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <div class="subtitle">Webflow Community × Rotaract Presents</div>
      <h1>ECHOSPHERE 2026</h1>
      <div style="font-size: 13px; color: #ede9fe; font-weight: 600; margin-top: 4px;">
        Najran Kabeer × Benji Beats Live
      </div>
    </div>

    <div class="ticket-body">
      <div style="text-align: center;">
        <span class="pass-badge">Official Entry Pass • {tier}</span>
      </div>

      <div class="ticket-id-box">
        <div class="ticket-id-title">Official Sequential Ticket ID</div>
        <div class="ticket-id-val">#{ticket_number}</div>
      </div>

      <table class="details-table">
        <tr>
          <td class="label">Pass Holder</td>
          <td class="value">{recipient_name}</td>
        </tr>
        <tr>
          <td class="label">Email Address</td>
          <td class="value">{to_email}</td>
        </tr>
        <tr>
          <td class="label">Access Tier</td>
          <td class="value" style="color: #a78bfa;">{tier}</td>
        </tr>
        <tr>
          <td class="label">Date &amp; Time</td>
          <td class="value">Monday, 2nd Nov 2026 • 5:30 PM IST</td>
        </tr>
        <tr>
          <td class="label">Venue</td>
          <td class="value">Srinivas University Mukka (SUIET Campus)</td>
        </tr>
        <tr>
          <td class="label">Gate Entry</td>
          <td class="value">Main SUIET Arena Gate (Opens 4:30 PM)</td>
        </tr>
        <tr>
          <td class="label">Total Amount</td>
          <td class="value">₹{amount:.0f} INR (Paid)</td>
        </tr>
      </table>

      <div class="barcode-box">
        <div style="font-size: 10px; color: #64748b; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 1px;">
          EchoSphere SUIET Gate Barcode
        </div>
        <div class="barcode-text">||| | ||||| || |||| ||| |||</div>
        <div style="font-size: 11px; font-family: monospace; color: #0f172a; margin-top: 4px;">
          ES-{ticket_number}-{security_hash[:8].upper()}
        </div>
      </div>

      <p style="font-size: 12px; color: #94a3b8; text-align: center; margin-top: 24px; line-height: 1.5;">
        Please keep this pass handy on your mobile phone or take a screenshot.
        College / Government ID is mandatory for admission at Srinivas University Mukka.
      </p>
    </div>

    <div class="footer">
      <div>EchoSphere 2026 • Webflow Community in collaboration with Rotaract.</div>
      <div>Srinivas University Institute of Engineering &amp; Technology (SUIET), Mukka, Mangalore.</div>
      <div style="margin-top: 8px; font-family: monospace; color: #4338ca;">Token: {security_hash}</div>
    </div>
  </div>
</body>
</html>
        """

        part1 = MIMEText(text_body, "plain")
        part2 = MIMEText(html_body, "html")
        msg.attach(part1)
        msg.attach(part2)

        if SMTP_PORT == 465:
            logger.info(f"Connecting to SMTP server {SMTP_HOST}:{SMTP_PORT} via SSL...")
            with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, timeout=15) as server:
                server.login(SMTP_EMAIL, SMTP_PASSWORD)
                server.sendmail(SMTP_EMAIL, [to_email], msg.as_string())
        else:
            logger.info(f"Connecting to SMTP server {SMTP_HOST}:{SMTP_PORT} via STARTTLS...")
            with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=15) as server:
                server.ehlo()
                server.starttls()
                server.ehlo()
                server.login(SMTP_EMAIL, SMTP_PASSWORD)
                server.sendmail(SMTP_EMAIL, [to_email], msg.as_string())

        logger.info(f"EchoSphere confirmation email sent to {to_email} for pass #{ticket_number}")
        return True

    except Exception as e:
        logger.error(f"Failed to send confirmation email to {to_email}: {str(e)}", exc_info=True)
        return False
