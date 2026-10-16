from __future__ import annotations

import os
import smtplib
import logging
from pathlib import Path
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from dotenv import load_dotenv

# Ensure backend .env is loaded
backend_dir = Path(__file__).resolve().parent
load_dotenv(backend_dir / ".env")
load_dotenv()

logger = logging.getLogger("email_service")

def _send_email_robust(msg: MIMEMultipart, to_email: str) -> bool:
    """
    Delivers email via Gmail SMTP with dual-port failover (587 STARTTLS / 465 SSL).
    Guarantees reliable delivery across both local Windows dev and Linux VPS environments.
    """
    smtp_email = os.getenv("SMTP_EMAIL", "webflowcommunity@srinivasuniversity.edu.in").strip()
    smtp_password = os.getenv("SMTP_PASSWORD", "cbqaqigrsfibpvkz").strip()
    smtp_host = os.getenv("SMTP_HOST", "smtp.gmail.com").strip()
    smtp_port = int(os.getenv("SMTP_PORT", "587"))

    ports_to_try = [smtp_port]
    fallback_port = 465 if smtp_port != 465 else 587
    if fallback_port not in ports_to_try:
        ports_to_try.append(fallback_port)

    last_error = None
    for port in ports_to_try:
        try:
            if port == 465:
                logger.info(f"Connecting to SMTP {smtp_host}:{port} via SSL...")
                with smtplib.SMTP_SSL(smtp_host, port, timeout=12) as server:
                    server.login(smtp_email, smtp_password)
                    server.sendmail(smtp_email, [to_email], msg.as_string())
            else:
                logger.info(f"Connecting to SMTP {smtp_host}:{port} via STARTTLS...")
                with smtplib.SMTP(smtp_host, port, timeout=12) as server:
                    server.ehlo()
                    server.starttls()
                    server.ehlo()
                    server.login(smtp_email, smtp_password)
                    server.sendmail(smtp_email, [to_email], msg.as_string())
            logger.info(f"Email successfully delivered to {to_email} via port {port}")
            return True
        except Exception as e:
            last_error = e
            logger.warning(f"SMTP attempt on port {port} failed: {e}. Trying fallback...")
            continue

    logger.error(f"All SMTP delivery attempts failed for {to_email}: {last_error}", exc_info=True)
    return False


def send_ticket_confirmation_email(
    to_email: str,
    recipient_name: str,
    ticket_number: str,
    tier: str,
    amount: float,
    security_hash: str,
    created_at: str,
    phone: str = "",
) -> bool:
    """
    Sends a premium, responsive HTML concert pass confirmation email.
    Contains complete event timing, date, place, campus arena venue, gate entry rules,
    attendee info, barcode, and dynamic scannable QR verification code.
    """
    try:
        smtp_sender = os.getenv("SMTP_EMAIL", "webflowcommunity@srinivasuniversity.edu.in").strip()
        subject = f"🎟️ Pass Confirmed: Najran Kabeer × Benji Beats Live | EchoSphere 2026 [#{ticket_number}]"

        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = f"EchoSphere Concert Pass <{smtp_sender}>"
        msg["To"] = to_email

        qr_url = f"https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=8&data=https%3A%2F%2Fechosphere.suiet.website%2Fapi%2Ftickets%2Fverify%2F{ticket_number}"

        text_body = f"""
================================================================================
ECHOSPHERE 2026 — OFFICIAL CONCERT ENTRY PASS
Najran Kabeer × Benji Beats Live in Concert
Presented by Webflow Community in collaboration with Rotaract
================================================================================

Hello {recipient_name},

Your official pass for ECHOSPHERE 2026 has been successfully confirmed and registered!
Please present your Pass ID #{ticket_number} at the SUIET Gate on the day of the event.

--------------------------------------------------------------------------------
PASS & ATTENDEE DETAILS
--------------------------------------------------------------------------------
• Pass Number:       #{ticket_number}
• Attendee Name:     {recipient_name}
• Registered Email:  {to_email}
• Mobile Number:     {phone if phone else "On Record"}
• Access Tier:       {tier}
• Amount Paid:       INR {amount:.0f} (Confirmed & Authorized)
• Booking Status:    CONFIRMED & ISSUED
• Verification Hash: {security_hash[:16]}...

--------------------------------------------------------------------------------
EVENT DATE, TIMING & VENUE
--------------------------------------------------------------------------------
• Date:              Monday, 2nd November 2026
• Gates Open:        4:30 PM IST (Security Screening & Early Admission)
• Concert Starts:    5:30 PM IST (Main Stage Live Performances)
• Event Concludes:   10:00 PM IST
• Venue:             Srinivas University Institute of Engineering & Technology (SUIET)
• Arena Location:    Main Campus Arena / Auditorium, NH-66, Mukka, Mangaluru, Karnataka 574146
• Landmark:          Near Surathkal Highway
• Google Maps:       https://maps.google.com/?q=Srinivas+University+Mukka+Mangalore

--------------------------------------------------------------------------------
IMPORTANT GATE ENTRY GUIDELINES
--------------------------------------------------------------------------------
1. MANDATORY ID PROOF: All attendees must present this digital pass along with a 
   valid College Student ID (for students) or any Government-issued Photo ID 
   (Aadhaar / Driving License / Passport / Voter ID).
2. SINGLE-USE PASS: Each sequential pass ID is cryptographically verified and can 
   only be scanned once at the gate. Duplicate entries are blocked by gate collision security.
3. PUNCTUALITY: Security frisking gates open promptly at 4:30 PM IST. Arrive early to avoid queues.
4. PROHIBITED ITEMS: Outside food, beverages, alcohol, tobacco/vapes, and hazardous objects 
   are strictly prohibited inside the campus arena.

We look forward to an electrifying night of live music!

For questions or gate assistance:
Email: webflowcommunity@srinivasuniversity.edu.in
Srinivas University Mukka Campus Helpdesk
================================================================================
"""

        html_body = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>EchoSphere 2026 Concert Pass</title>
  <style>
    body {{
      margin: 0;
      padding: 0;
      background-color: #060712;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      color: #e2e8f0;
      -webkit-font-smoothing: antialiased;
    }}
    table {{
      border-collapse: collapse;
    }}
    .email-container {{
      max-width: 620px;
      margin: 24px auto;
      background: #0b0e22;
      border: 1px solid #232a52;
      border-radius: 20px;
      overflow: hidden;
      box-shadow: 0 25px 60px -15px rgba(0, 0, 0, 0.9);
    }}
    .header-banner {{
      background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 50%, #2563eb 100%);
      padding: 34px 28px 28px;
      text-align: center;
    }}
    .org-subtitle {{
      margin: 0 0 6px 0;
      color: #e0e7ff;
      font-size: 11px;
      letter-spacing: 2.5px;
      font-weight: 800;
      text-transform: uppercase;
    }}
    .event-title {{
      margin: 0;
      color: #ffffff;
      font-size: 28px;
      font-weight: 900;
      letter-spacing: 2px;
      text-transform: uppercase;
    }}
    .artist-tag {{
      margin: 8px 0 0 0;
      color: #f5f3ff;
      font-size: 14px;
      font-weight: 700;
      letter-spacing: 0.5px;
    }}
    .pass-content {{
      padding: 30px 28px;
    }}
    .status-pill {{
      display: inline-block;
      padding: 6px 16px;
      border-radius: 9999px;
      background: rgba(16, 185, 129, 0.15);
      border: 1px solid #10b981;
      color: #34d399;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      margin-bottom: 22px;
    }}
    .ticket-hero-box {{
      background: #060817;
      border: 1px dashed #6366f1;
      border-radius: 16px;
      padding: 22px 18px;
      text-align: center;
      margin-bottom: 26px;
    }}
    .ticket-num-label {{
      font-size: 11px;
      color: #94a3b8;
      text-transform: uppercase;
      letter-spacing: 2px;
      margin-bottom: 6px;
      font-weight: 700;
    }}
    .ticket-num-val {{
      font-size: 42px;
      font-weight: 900;
      letter-spacing: 4px;
      color: #60a5fa;
      font-family: 'Courier New', Courier, monospace;
      line-height: 1.1;
    }}
    .ticket-tier-badge {{
      display: inline-block;
      margin-top: 10px;
      padding: 4px 14px;
      border-radius: 8px;
      background: rgba(99, 102, 241, 0.2);
      border: 1px solid #6366f1;
      color: #c7d2fe;
      font-size: 12px;
      font-weight: 700;
    }}
    .section-heading {{
      font-size: 12px;
      color: #818cf8;
      text-transform: uppercase;
      letter-spacing: 1.5px;
      font-weight: 800;
      margin-bottom: 12px;
      border-bottom: 1px solid #1e2246;
      padding-bottom: 6px;
    }}
    .data-table {{
      width: 100%;
      margin-bottom: 24px;
    }}
    .data-table td {{
      padding: 10px 0;
      border-bottom: 1px solid #181c3b;
      font-size: 13px;
      vertical-align: top;
    }}
    .data-table td.lbl {{
      color: #94a3b8;
      width: 36%;
      font-weight: 600;
    }}
    .data-table td.val {{
      color: #ffffff;
      font-weight: 700;
      text-align: right;
    }}
    .highlight-card {{
      background: #0d1230;
      border: 1px solid #2e3768;
      border-radius: 14px;
      padding: 18px;
      margin-bottom: 24px;
    }}
    .highlight-item {{
      margin-bottom: 12px;
      font-size: 13px;
      line-height: 1.5;
    }}
    .highlight-item:last-child {{
      margin-bottom: 0;
    }}
    .highlight-item strong {{
      color: #ffffff;
      display: inline-block;
      min-width: 110px;
    }}
    .qr-card {{
      background: #ffffff;
      border-radius: 14px;
      padding: 20px;
      text-align: center;
      margin: 24px 0;
      color: #0b0f24;
    }}
    .qr-card img {{
      display: block;
      margin: 0 auto;
      max-width: 180px;
      height: auto;
      border-radius: 8px;
    }}
    .qr-instructions {{
      font-size: 12px;
      color: #475569;
      margin-top: 10px;
      font-weight: 600;
    }}
    .barcode-display {{
      letter-spacing: 6px;
      font-size: 18px;
      font-family: monospace;
      font-weight: 900;
      color: #0b0f24;
      margin-top: 6px;
    }}
    .rules-box {{
      background: rgba(15, 23, 42, 0.7);
      border: 1px solid #1e293b;
      border-radius: 12px;
      padding: 18px;
      font-size: 12px;
      color: #94a3b8;
      line-height: 1.6;
      margin-bottom: 24px;
    }}
    .rules-box h4 {{
      margin: 0 0 10px 0;
      color: #cbd5e1;
      font-size: 12px;
      letter-spacing: 1px;
      text-transform: uppercase;
      font-weight: 800;
    }}
    .rules-box ol {{
      margin: 0;
      padding-left: 18px;
    }}
    .rules-box li {{
      margin-bottom: 6px;
    }}
    .map-btn {{
      display: inline-block;
      margin-top: 10px;
      padding: 8px 16px;
      border-radius: 8px;
      background: #4f46e5;
      color: #ffffff !important;
      text-decoration: none;
      font-size: 12px;
      font-weight: 700;
    }}
    .email-footer {{
      background: #060714;
      padding: 24px;
      text-align: center;
      border-top: 1px solid #191e42;
      font-size: 11px;
      color: #64748b;
      line-height: 1.6;
    }}
  </style>
</head>
<body>
  <div class="email-container">
    
    <!-- Top Brand Header -->
    <div class="header-banner">
      <div class="org-subtitle">Webflow Community × Rotaract Presents</div>
      <h1 class="event-title">ECHOSPHERE 2026</h1>
      <div class="artist-tag">Najran Kabeer × Benji Beats Live in Concert</div>
    </div>

    <!-- Main Content Area -->
    <div class="pass-content">
      
      <!-- Status Badge -->
      <div style="text-align: center;">
        <span class="status-pill">✓ Registration Confirmed • Pass Active</span>
      </div>

      <!-- Hero Ticket ID Box -->
      <div class="ticket-hero-box">
        <div class="ticket-num-label">Official Sequential Pass ID</div>
        <div class="ticket-num-val">#{ticket_number}</div>
        <div>
          <span class="ticket-tier-badge">{tier}</span>
        </div>
      </div>

      <!-- Event Schedule & Venue Details -->
      <div class="section-heading">Concert Schedule &amp; Venue Details</div>
      <div class="highlight-card">
        <div class="highlight-item">
          <strong>📅 Concert Date:</strong>
          <span style="color: #60a5fa; font-weight: 700;">Monday, 2nd November 2026</span>
        </div>
        <div class="highlight-item">
          <strong>⏰ Gates Open:</strong>
          <span style="color: #34d399; font-weight: 700;">4:30 PM IST (Security Entry &amp; Check-In)</span>
        </div>
        <div class="highlight-item">
          <strong>🎵 Live Show:</strong>
          <span style="color: #f1f5f9; font-weight: 700;">5:30 PM IST – 10:00 PM IST</span>
        </div>
        <div class="highlight-item">
          <strong>📍 Campus Venue:</strong>
          <span style="color: #e2e8f0;">Srinivas University Institute of Engineering &amp; Technology (SUIET)</span>
        </div>
        <div class="highlight-item">
          <strong>🏛️ Arena Location:</strong>
          <span style="color: #cbd5e1;">Main Campus Arena / Open-Air Grounds, NH-66, Mukka, Mangaluru, Karnataka 574146</span>
        </div>
        <div style="text-align: left; margin-top: 12px;">
          <a href="https://maps.google.com/?q=Srinivas+University+Mukka+Mangalore" class="map-btn" target="_blank">
            🗺️ Open Venue in Google Maps →
          </a>
        </div>
      </div>

      <!-- Attendee Information Table -->
      <div class="section-heading">Pass Holder Information</div>
      <table class="data-table">
        <tr>
          <td class="lbl">Attendee Name</td>
          <td class="val">{recipient_name}</td>
        </tr>
        <tr>
          <td class="lbl">Registered Email</td>
          <td class="val">{to_email}</td>
        </tr>
        {f'<tr><td class="lbl">Mobile Number</td><td class="val">{phone}</td></tr>' if phone else ''}
        <tr>
          <td class="lbl">Ticket Category</td>
          <td class="val" style="color: #a78bfa;">{tier}</td>
        </tr>
        <tr>
          <td class="lbl">Total Amount</td>
          <td class="val" style="color: #34d399;">₹{amount:.0f} INR (Paid &amp; Authorized)</td>
        </tr>
        <tr>
          <td class="lbl">Gate Entry Token</td>
          <td class="val" style="font-family: monospace; font-size: 11px; color: #94a3b8;">
            {security_hash[:16]}...
          </td>
        </tr>
      </table>

      <!-- QR & Barcode Section -->
      <div class="qr-card">
        <div style="font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 1.5px; color: #475569; margin-bottom: 12px;">
          Gate Admission QR Pass
        </div>
        <img src="{qr_url}" alt="Gate QR Pass #{ticket_number}" width="180" height="180" />
        <div class="barcode-display">||| | ||||| || |||| ||| |||</div>
        <div class="qr-instructions">
          Scan this QR Code or display Pass #{ticket_number} at the SUIET Arena Gate.
        </div>
      </div>

      <!-- Guidelines Box -->
      <div class="rules-box">
        <h4>⚡ Important Gate Entry Guidelines:</h4>
        <ol>
          <li><strong>Mandatory Photo ID:</strong> All attendees must carry a valid College Student ID (for university students) or Government-issued Photo ID (Aadhaar / Driving License / Passport / Voter ID).</li>
          <li><strong>One-Time Entry Only:</strong> Pass #{ticket_number} can only be scanned and admitted once at the turnstiles. Anti-collision security blocks duplicated or shared passes.</li>
          <li><strong>Punctuality:</strong> Gates open at 4:30 PM IST. Please arrive early to clear security frisking and bag checks prior to headliner performance.</li>
          <li><strong>Prohibited Items:</strong> Outside food/beverages, alcohol, tobacco/vapes, hazardous objects, and unauthorized recording rigs are strictly forbidden.</li>
        </ol>
      </div>

      <p style="font-size: 12px; color: #94a3b8; text-align: center; margin: 16px 0 0 0; line-height: 1.5;">
        Save this email or take a screenshot on your phone for instant gate scanning.
      </p>

    </div>

    <!-- Footer -->
    <div class="email-footer">
      <div><strong>EchoSphere 2026</strong> • Official Concert Production</div>
      <div>Organized by Webflow Community in collaboration with Rotaract.</div>
      <div>Srinivas University Institute of Engineering &amp; Technology (SUIET), Mukka, Mangalore.</div>
      <div style="margin-top: 8px; font-family: monospace; font-size: 10px; color: #475569;">
        Verification Digest: {security_hash}
      </div>
    </div>

  </div>
</body>
</html>
"""

        part1 = MIMEText(text_body, "plain", "utf-8")
        part2 = MIMEText(html_body, "html", "utf-8")
        msg.attach(part1)
        msg.attach(part2)

        return _send_email_robust(msg, to_email)

    except Exception as e:
        logger.error(f"Failed to build or send confirmation email to {to_email}: {e}", exc_info=True)
        return False


def send_admin_otp_email(to_email: str, otp_code: str) -> bool:
    """
    Dispatches a clean, high-contrast 6-digit 2FA login passkey to the verified administrator email.
    """
    try:
        smtp_sender = os.getenv("SMTP_EMAIL", "webflowcommunity@srinivasuniversity.edu.in").strip()
        subject = f"🔐 {otp_code} is your EchoSphere Admin 2FA Passkey"

        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = f"EchoSphere Gate Security <{smtp_sender}>"
        msg["To"] = to_email

        text_body = f"""
Hello Administrator,

Your EchoSphere 2026 Admin Gate verification code is:

    {otp_code}

This single-use code expires in 10 minutes.
Authorized recipient: {to_email}

If you did not initiate this login request on the EchoSphere command gate, please review server security immediately.

EchoSphere 2026 • Security Operations
Srinivas University Mukka (SUIET Campus)
"""

        html_body = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>EchoSphere Admin 2FA Passkey</title>
</head>
<body style="margin:0;padding:24px;background-color:#060712;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#f1f5f9;">
  <div style="max-width:460px;margin:24px auto;background:#0d1127;border:1px solid #3730a3;border-radius:18px;padding:32px;box-shadow:0 25px 50px rgba(0,0,0,0.85);">
    <div style="text-align:center;margin-bottom:24px;">
      <span style="display:inline-block;padding:5px 14px;border-radius:9999px;background:rgba(99,102,241,0.2);color:#a5b4fc;font-size:11px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;border:1px solid rgba(99,102,241,0.4);">
        Gate Command 2FA
      </span>
      <h2 style="color:#ffffff;margin:14px 0 4px 0;font-size:22px;font-weight:900;letter-spacing:0.5px;">EchoSphere Security</h2>
      <p style="color:#94a3b8;font-size:12px;margin:0;">Srinivas University Mukka • Gate Operations</p>
    </div>

    <div style="background:#060817;border:1px dashed #6366f1;border-radius:14px;padding:24px;text-align:center;margin:24px 0;">
      <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:2px;margin-bottom:10px;font-weight:700;">
        Single-Use Verification Passkey
      </div>
      <div style="font-size:44px;font-family:'Courier New',monospace;font-weight:900;letter-spacing:10px;color:#60a5fa;line-height:1.1;">
        {otp_code}
      </div>
      <div style="font-size:11px;color:#cbd5e1;margin-top:10px;font-weight:600;">
        ⏱️ Valid for 10 minutes only
      </div>
    </div>

    <div style="background:rgba(15,23,42,0.6);border-radius:10px;padding:12px;font-size:11px;color:#94a3b8;text-align:center;margin-bottom:20px;">
      Dispatched for authorized admin: <strong style="color:#ffffff;">{to_email}</strong>
    </div>

    <p style="font-size:11px;color:#64748b;text-align:center;line-height:1.5;margin:0;">
      If you did not initiate this login request, please discard this message.
    </p>
  </div>
</body>
</html>
"""

        part1 = MIMEText(text_body, "plain", "utf-8")
        part2 = MIMEText(html_body, "html", "utf-8")
        msg.attach(part1)
        msg.attach(part2)

        return _send_email_robust(msg, to_email)

    except Exception as e:
        logger.error(f"Failed to build or send 2FA OTP email to {to_email}: {e}", exc_info=True)
        return False
