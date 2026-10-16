from __future__ import annotations

import os
import json
import sqlite3
import hashlib
import threading
import time
from datetime import datetime, timezone
from typing import Dict, Any, Optional

DB_FILE = os.path.join(os.path.dirname(__file__), "tickets.db")
db_lock = threading.Lock()

def get_connection():
    conn = sqlite3.connect(DB_FILE, check_same_thread=False, timeout=30.0)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    with db_lock:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("PRAGMA journal_mode=WAL;")
        cursor.execute("PRAGMA synchronous=NORMAL;")
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS tickets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ticket_number TEXT UNIQUE NOT NULL,
                full_name TEXT NOT NULL,
                email TEXT NOT NULL,
                phone TEXT NOT NULL,
                tier TEXT NOT NULL,
                amount REAL NOT NULL,
                currency TEXT NOT NULL DEFAULT 'INR',
                payment_id TEXT NOT NULL,
                payment_status TEXT NOT NULL DEFAULT 'completed',
                email_sent INTEGER NOT NULL DEFAULT 0,
                security_hash TEXT NOT NULL,
                created_at TEXT NOT NULL,
                checked_in INTEGER NOT NULL DEFAULT 0,
                checked_in_at TEXT
            )
            """
        )
        # Migrate existing table if checked_in column is missing
        cursor.execute("PRAGMA table_info(tickets)")
        cols = [col["name"] for col in cursor.fetchall()]
        if "checked_in" not in cols:
            cursor.execute("ALTER TABLE tickets ADD COLUMN checked_in INTEGER NOT NULL DEFAULT 0")
        if "checked_in_at" not in cols:
            cursor.execute("ALTER TABLE tickets ADD COLUMN checked_in_at TEXT")

        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS pending_orders (
                order_id TEXT PRIMARY KEY,
                customer_name TEXT NOT NULL,
                customer_email TEXT NOT NULL,
                customer_phone TEXT NOT NULL,
                tier TEXT NOT NULL,
                ticket_count INTEGER NOT NULL,
                amount REAL NOT NULL,
                attendees_json TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'PENDING',
                created_at TEXT NOT NULL
            )
            """
        )
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS admin_otps (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                otp_code TEXT NOT NULL,
                token TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                expires_at INTEGER NOT NULL,
                is_used INTEGER DEFAULT 0
            )
            """
        )
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS admin_sessions (
                token TEXT PRIMARY KEY,
                created_at INTEGER NOT NULL,
                expires_at INTEGER NOT NULL
            )
            """
        )
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS tier_settings (
                tier_name TEXT PRIMARY KEY,
                price REAL NOT NULL,
                original_price REAL NOT NULL,
                claimed_count INTEGER NOT NULL,
                total_count INTEGER NOT NULL,
                badge_text TEXT NOT NULL DEFAULT 'Early Bird Ticket',
                updated_at TEXT NOT NULL
            )
            """
        )
        # Ensure default Early Bird Ticket row exists
        now_iso = datetime.now(timezone.utc).isoformat()
        cursor.execute(
            """
            INSERT OR IGNORE INTO tier_settings (tier_name, price, original_price, claimed_count, total_count, badge_text, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            ("Early Bird Ticket", 349.00, 499.00, 182, 200, "Early Bird Ticket", now_iso),
        )
        conn.commit()
        conn.close()

def get_ticket_stats() -> Dict[str, Any]:
    with db_lock:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT 
                COUNT(*) AS total_sold,
                MAX(id) AS max_id,
                SUM(CASE WHEN checked_in = 1 THEN 1 ELSE 0 END) AS checked_in_count,
                SUM(amount) AS total_revenue
            FROM tickets
        """)
        row = cursor.fetchone()
        total_sold = row["total_sold"] or 0
        max_id = row["max_id"] or 0
        checked_in_count = row["checked_in_count"] or 0
        total_revenue = row["total_revenue"] or 0.0
        
        last_ticket = f"{max_id:04d}" if max_id > 0 else "0000"
        total_capacity = 2000
        available = max(0, total_capacity - total_sold)
        pending_checkin = max(0, total_sold - checked_in_count)
        
        conn.close()
        return {
            "total_sold": total_sold,
            "last_ticket_id": last_ticket,
            "next_ticket_id": f"{(max_id + 1):04d}",
            "total_capacity": total_capacity,
            "available_tickets": available,
            "checked_in_count": checked_in_count,
            "pending_checkin_count": pending_checkin,
            "total_revenue": round(total_revenue, 2),
        }

def create_ticket(
    full_name: str,
    email: str,
    phone: str,
    tier: str,
    amount: float,
    currency: str,
    payment_id: str,
    secret_key: str,
) -> Dict[str, Any]:
    with db_lock:
        conn = get_connection()
        cursor = conn.cursor()
        
        # Atomic calculation of next 4-digit ID starting at 0001 up to 2000
        cursor.execute("SELECT MAX(id) as max_id FROM tickets")
        row = cursor.fetchone()
        next_id = (row["max_id"] or 0) + 1
        
        if next_id > 2000:
            conn.close()
            raise ValueError("Concert is strictly sold out. Maximum limit of 2000 tickets reached.")

        ticket_number = f"{next_id:04d}"  # 0001, 0002, 0003...

        now_iso = datetime.now(timezone.utc).isoformat()
        
        # Create tamper-proof security hash
        hash_seed = f"{ticket_number}:{email.strip().lower()}:{tier}:{secret_key}:{now_iso}"
        sec_hash = hashlib.sha256(hash_seed.encode("utf-8")).hexdigest()

        cursor.execute(
            """
            INSERT INTO tickets (
                id, ticket_number, full_name, email, phone, tier, amount,
                currency, payment_id, payment_status, email_sent, security_hash, created_at, checked_in, checked_in_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 0, NULL)
            """,
            (
                next_id,
                ticket_number,
                full_name.strip(),
                email.strip().lower(),
                phone.strip(),
                tier,
                amount,
                currency or "INR",
                payment_id,
                "completed",
                sec_hash,
                now_iso,
            ),
        )
        conn.commit()
        conn.close()

        return {
            "id": next_id,
            "ticket_number": ticket_number,
            "full_name": full_name.strip(),
            "email": email.strip().lower(),
            "phone": phone.strip(),
            "tier": tier,
            "amount": amount,
            "currency": currency or "INR",
            "payment_id": payment_id,
            "security_hash": sec_hash,
            "created_at": now_iso,
            "email_sent": False,
            "checked_in": 0,
            "checked_in_at": None,
        }

def create_manual_ticket(
    full_name: str,
    email: str,
    phone: str,
    tier: str,
    amount: float,
    secret_key: str,
    payment_method: str = "Cash / Spot Entry",
) -> Dict[str, Any]:
    """Generates an offline / spot entry ticket with custom amount."""
    with db_lock:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT MAX(id) as max_id FROM tickets")
        row = cursor.fetchone()
        next_id = (row["max_id"] or 0) + 1

        if next_id > 2000:
            conn.close()
            raise ValueError("Concert is strictly sold out. Maximum limit of 2000 tickets reached.")

        ticket_number = f"{next_id:04d}"
        now_iso = datetime.now(timezone.utc).isoformat()
        hash_seed = f"{ticket_number}:{email.strip().lower()}:{tier}:{secret_key}:{now_iso}"
        sec_hash = hashlib.sha256(hash_seed.encode("utf-8")).hexdigest()
        payment_id = f"SPOT_{int(time.time()*1000)}"

        cursor.execute(
            """
            INSERT INTO tickets (
                id, ticket_number, full_name, email, phone, tier, amount,
                currency, payment_id, payment_status, email_sent, security_hash, created_at, checked_in, checked_in_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 0, NULL)
            """,
            (
                next_id,
                ticket_number,
                full_name.strip(),
                email.strip().lower(),
                phone.strip(),
                tier,
                amount,
                "INR",
                payment_id,
                "completed",
                sec_hash,
                now_iso,
            ),
        )
        conn.commit()
        conn.close()
        return {
            "id": next_id,
            "ticket_number": ticket_number,
            "full_name": full_name.strip(),
            "email": email.strip().lower(),
            "phone": phone.strip(),
            "tier": tier,
            "amount": amount,
            "currency": "INR",
            "payment_id": payment_id,
            "security_hash": sec_hash,
            "created_at": now_iso,
            "checked_in": 0,
            "checked_in_at": None,
            "email_sent": False,
        }

def mark_email_sent(ticket_number: str):
    with db_lock:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE tickets SET email_sent = 1 WHERE ticket_number = ?",
            (ticket_number,),
        )
        conn.commit()
        conn.close()

def get_ticket_by_number(ticket_number: str) -> Optional[Dict[str, Any]]:
    with db_lock:
        conn = get_connection()
        cursor = conn.cursor()
        clean_num = ticket_number.strip().lstrip("#")
        if clean_num.isdigit():
            clean_num = f"{int(clean_num):04d}"

        cursor.execute(
            "SELECT * FROM tickets WHERE ticket_number = ? OR ticket_number = ?",
            (clean_num, ticket_number.strip()),
        )
        row = cursor.fetchone()
        conn.close()
        if not row:
            return None
        return dict(row)

def get_tickets_by_payment_id(payment_id: str) -> list[Dict[str, Any]]:
    with db_lock:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM tickets WHERE payment_id = ? ORDER BY id ASC",
            (payment_id,),
        )
        rows = cursor.fetchall()
        conn.close()
        return [dict(r) for r in rows]

def get_all_tickets() -> list[Dict[str, Any]]:
    with db_lock:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM tickets ORDER BY id DESC")
        rows = cursor.fetchall()
        conn.close()
        return [dict(r) for r in rows]

def checkin_ticket(ticket_number: str) -> Dict[str, Any]:
    with db_lock:
        conn = get_connection()
        cursor = conn.cursor()
        clean_num = ticket_number.strip().lstrip("#")
        if clean_num.isdigit():
            clean_num = f"{int(clean_num):04d}"

        cursor.execute("SELECT * FROM tickets WHERE ticket_number = ? OR ticket_number = ?", (clean_num, ticket_number.strip()))
        row = cursor.fetchone()
        if not row:
            conn.close()
            return {"success": False, "found": False, "message": f"Pass #{clean_num} does not exist in the database."}

        ticket = dict(row)
        if ticket.get("checked_in") == 1:
            conn.close()
            return {
                "success": False,
                "found": True,
                "already_checked_in": True,
                "checked_in_at": ticket.get("checked_in_at"),
                "ticket": ticket,
                "message": f"⚠️ COLLISION ALERT: Ticket #{ticket['ticket_number']} ({ticket['full_name']}) was ALREADY checked in at {ticket.get('checked_in_at')}! Do not admit twice.",
            }

        now_iso = datetime.now(timezone.utc).isoformat()
        cursor.execute("UPDATE tickets SET checked_in = 1, checked_in_at = ? WHERE id = ?", (now_iso, ticket["id"]))
        conn.commit()
        
        ticket["checked_in"] = 1
        ticket["checked_in_at"] = now_iso
        conn.close()
        return {
            "success": True,
            "found": True,
            "already_checked_in": False,
            "checked_in_at": now_iso,
            "ticket": ticket,
            "message": f"✅ Verified & Admitted: #{ticket['ticket_number']} ({ticket['full_name']})",
        }

def undo_checkin_ticket(ticket_number: str) -> Dict[str, Any]:
    with db_lock:
        conn = get_connection()
        cursor = conn.cursor()
        clean_num = ticket_number.strip().lstrip("#")
        if clean_num.isdigit():
            clean_num = f"{int(clean_num):04d}"

        cursor.execute("UPDATE tickets SET checked_in = 0, checked_in_at = NULL WHERE ticket_number = ? OR ticket_number = ?", (clean_num, ticket_number.strip()))
        conn.commit()
        cursor.execute("SELECT * FROM tickets WHERE ticket_number = ? OR ticket_number = ?", (clean_num, ticket_number.strip()))
        row = cursor.fetchone()
        conn.close()
        return {"success": True, "ticket": dict(row) if row else None}

def save_pending_order(
    order_id: str,
    customer_name: str,
    customer_email: str,
    customer_phone: str,
    tier: str,
    ticket_count: int,
    amount: float,
    attendees: list[Dict[str, Any]],
) -> Dict[str, Any]:
    with db_lock:
        conn = get_connection()
        cursor = conn.cursor()
        now_iso = datetime.now(timezone.utc).isoformat()
        attendees_json = json.dumps(attendees)
        cursor.execute(
            """
            INSERT OR REPLACE INTO pending_orders (
                order_id, customer_name, customer_email, customer_phone,
                tier, ticket_count, amount, attendees_json, status, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)
            """,
            (
                order_id,
                customer_name.strip(),
                customer_email.strip().lower(),
                customer_phone.strip(),
                tier,
                ticket_count,
                amount,
                attendees_json,
                now_iso,
            ),
        )
        conn.commit()
        conn.close()
        return {
            "order_id": order_id,
            "tier": tier,
            "ticket_count": ticket_count,
            "amount": amount,
            "status": "PENDING",
            "created_at": now_iso,
        }

def get_pending_order(order_id: str) -> Optional[Dict[str, Any]]:
    with db_lock:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM pending_orders WHERE order_id = ?", (order_id,))
        row = cursor.fetchone()
        conn.close()
        if not row:
            return None
        res = dict(row)
        try:
            res["attendees"] = json.loads(res.get("attendees_json", "[]"))
        except Exception:
            res["attendees"] = []
        return res

def mark_order_completed(order_id: str):
    with db_lock:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("UPDATE pending_orders SET status = 'COMPLETED' WHERE order_id = ?", (order_id,))
        conn.commit()
        conn.close()

# -------------------------------------------------------------
# 2FA Admin OTP & Session Authentication
# -------------------------------------------------------------
def save_admin_otp(otp_code: str, token: str, ttl_seconds: int = 600):
    with db_lock:
        conn = get_connection()
        cursor = conn.cursor()
        now = int(time.time())
        cursor.execute(
            "INSERT INTO admin_otps (otp_code, token, created_at, expires_at, is_used) VALUES (?, ?, ?, ?, 0)",
            (otp_code.strip(), token.strip(), now, now + ttl_seconds),
        )
        conn.commit()
        conn.close()

def verify_admin_otp(otp_code: str) -> Optional[str]:
    with db_lock:
        conn = get_connection()
        cursor = conn.cursor()
        now = int(time.time())
        cursor.execute(
            "SELECT * FROM admin_otps WHERE otp_code = ? AND is_used = 0 AND expires_at > ? ORDER BY id DESC LIMIT 1",
            (otp_code.strip(), now),
        )
        row = cursor.fetchone()
        if not row:
            conn.close()
            return None

        token = row["token"]
        cursor.execute("UPDATE admin_otps SET is_used = 1 WHERE id = ?", (row["id"],))
        
        # Issue 24-hour admin session
        session_expiry = now + (24 * 3600)
        cursor.execute(
            "INSERT OR REPLACE INTO admin_sessions (token, created_at, expires_at) VALUES (?, ?, ?)",
            (token, now, session_expiry),
        )
        conn.commit()
        conn.close()
        return token

def validate_admin_session(token: str) -> bool:
    if not token:
        return False
    with db_lock:
        conn = get_connection()
        cursor = conn.cursor()
        now = int(time.time())
        cursor.execute(
            "SELECT * FROM admin_sessions WHERE token = ? AND expires_at > ?",
            (token.strip(), now),
        )
        row = cursor.fetchone()
        conn.close()
        return bool(row)

# -------------------------------------------------------------
# Ticket Tier Pricing & Scarcity Management
# -------------------------------------------------------------
def get_tier_settings(tier_name: str = "Early Bird Ticket") -> Dict[str, Any]:
    with db_lock:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM tier_settings WHERE tier_name = ? LIMIT 1",
            (tier_name,),
        )
        row = cursor.fetchone()
        if not row:
            # Fallback default
            conn.close()
            return {
                "tier_name": tier_name,
                "price": 349.00,
                "original_price": 499.00,
                "claimed_count": 182,
                "total_count": 200,
                "spots_left": 18,
                "badge_text": "Early Bird Ticket",
                "savings": 150.00,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
        
        price = float(row["price"])
        orig_price = float(row["original_price"])
        claimed = int(row["claimed_count"])
        total = int(row["total_count"])
        badge = str(row["badge_text"] if "badge_text" in row.keys() else "Early Bird Ticket")
        updated_at = str(row["updated_at"])
        conn.close()
        
        spots_left = max(0, total - claimed)
        savings = max(0.0, orig_price - price)
        return {
            "tier_name": tier_name,
            "price": price,
            "original_price": orig_price,
            "claimed_count": claimed,
            "total_count": total,
            "spots_left": spots_left,
            "badge_text": badge,
            "savings": savings,
            "updated_at": updated_at,
        }

def update_tier_settings(
    tier_name: str,
    price: float,
    original_price: float,
    claimed_count: int,
    total_count: int,
    badge_text: str = "Early Bird Ticket",
) -> Dict[str, Any]:
    with db_lock:
        conn = get_connection()
        cursor = conn.cursor()
        now_iso = datetime.now(timezone.utc).isoformat()
        cursor.execute(
            """
            INSERT INTO tier_settings (tier_name, price, original_price, claimed_count, total_count, badge_text, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(tier_name) DO UPDATE SET
                price = excluded.price,
                original_price = excluded.original_price,
                claimed_count = excluded.claimed_count,
                total_count = excluded.total_count,
                badge_text = excluded.badge_text,
                updated_at = excluded.updated_at
            """,
            (tier_name.strip(), float(price), float(original_price), int(claimed_count), int(total_count), badge_text.strip(), now_iso),
        )
        conn.commit()
        conn.close()
    return get_tier_settings(tier_name)

