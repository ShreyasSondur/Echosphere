import os
import json
import sqlite3
import hashlib
import threading
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
                currency TEXT NOT NULL DEFAULT 'USD',
                payment_id TEXT NOT NULL,
                payment_status TEXT NOT NULL DEFAULT 'completed',
                email_sent INTEGER NOT NULL DEFAULT 0,
                security_hash TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
            """
        )
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
        conn.commit()
        conn.close()

def get_ticket_stats() -> Dict[str, Any]:
    with db_lock:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) AS total_sold, MAX(id) as max_id FROM tickets")
        row = cursor.fetchone()
        total_sold = row["total_sold"] or 0
        max_id = row["max_id"] or 0
        
        last_ticket = f"{max_id:03d}" if max_id > 0 else "000"
        total_capacity = 500
        available = max(0, total_capacity - total_sold)
        
        conn.close()
        return {
            "total_sold": total_sold,
            "last_ticket_id": last_ticket,
            "next_ticket_id": f"{(max_id + 1):03d}",
            "total_capacity": total_capacity,
            "available_tickets": available,
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
        
        # Atomic calculation of next ID starting at 001
        cursor.execute("SELECT MAX(id) as max_id FROM tickets")
        row = cursor.fetchone()
        next_id = (row["max_id"] or 0) + 1
        ticket_number = f"{next_id:03d}"  # 001, 002, 003...

        now_iso = datetime.now(timezone.utc).isoformat()
        
        # Create tamper-proof security hash
        hash_seed = f"{ticket_number}:{email.strip().lower()}:{tier}:{secret_key}:{now_iso}"
        sec_hash = hashlib.sha256(hash_seed.encode("utf-8")).hexdigest()

        cursor.execute(
            """
            INSERT INTO tickets (
                id, ticket_number, full_name, email, phone, tier, amount,
                currency, payment_id, payment_status, email_sent, security_hash, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
            """,
            (
                next_id,
                ticket_number,
                full_name.strip(),
                email.strip().lower(),
                phone.strip(),
                tier,
                amount,
                currency,
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
            "currency": currency,
            "payment_id": payment_id,
            "security_hash": sec_hash,
            "created_at": now_iso,
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
        cursor.execute(
            "SELECT * FROM tickets WHERE ticket_number = ?",
            (ticket_number,),
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

