from __future__ import annotations

import os
import re
import time
import asyncio
import logging
import secrets
from typing import Optional, Dict
from collections import defaultdict
from fastapi import FastAPI, HTTPException, Request, Response, BackgroundTasks, Depends, status, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pathlib import Path
from pydantic import BaseModel, Field, field_validator
from dotenv import load_dotenv

# Ensure backend/.env is always loaded regardless of current working directory
backend_dir = Path(__file__).resolve().parent
load_dotenv(backend_dir / ".env")
load_dotenv()

import json

from database import (
    init_db,
    get_ticket_stats,
    create_ticket,
    mark_email_sent,
    get_ticket_by_number,
    get_tickets_by_payment_id,
    save_pending_order,
    get_pending_order,
    get_pending_order_by_buyer,
    get_all_pending_orders,
    get_unfulfilled_pending_orders,
    mark_order_completed,
    mark_order_failed,
    get_all_tickets,
    checkin_ticket,
    undo_checkin_ticket,
    create_manual_ticket,
    save_admin_otp,
    verify_admin_otp,
    validate_admin_session,
    get_tier_settings,
    update_tier_settings,
)
from email_service import (
    send_ticket_confirmation_email,
    send_admin_otp_email,
)
from cashfree_service import (
    create_cashfree_order,
    verify_cashfree_order,
    is_cashfree_configured,
    get_order_payments,
    verify_cashfree_webhook_signature,
)

# Configure logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("echosphere_backend")

ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "idontknow").strip()
ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "shreyas.u.sondur@gmail.com").strip()

# Initialize database
init_db()

SECRET_KEY = os.getenv("SECRET_KEY", "echosphere_secure_secret_token_983749823423")
PORT = int(os.getenv("PORT", "8002"))

app = FastAPI(
    title="EchoSphere - Webflow × Rotaract Concert Ticketing API",
    description="High-security ticketing backend for EchoSphere at Srinivas University Mukka (SUIET).",
    version="2.1.0",
)

# -------------------------------------------------------------
# Security & Rate Limiting Middleware
# -------------------------------------------------------------
rate_limit_records = defaultdict(list)
RATE_LIMIT_WINDOW_SEC = 60
MAX_REQUESTS_PER_WINDOW = 60

@app.middleware("http")
async def security_and_rate_limit_middleware(request: Request, call_next):
    # Preflight OPTIONS requests must never be rate-limited or blocked
    if request.method == "OPTIONS":
        return await call_next(request)

    # Cashfree webhook notifications must not be throttled
    if request.url.path.startswith("/api/payment/cashfree/webhook"):
        return await call_next(request)

    # Respect reverse proxies (Cloudflare, Nginx, Caddy, etc.) for client IP detection
    cf_ip = request.headers.get("cf-connecting-ip")
    x_forwarded = request.headers.get("x-forwarded-for")
    x_real = request.headers.get("x-real-ip")
    if cf_ip:
        client_ip = cf_ip.strip()
    elif x_forwarded:
        client_ip = x_forwarded.split(",")[0].strip()
    elif x_real:
        client_ip = x_real.strip()
    elif request.client:
        client_ip = request.client.host
    else:
        client_ip = "unknown"

    now = time.time()
    window_start = now - RATE_LIMIT_WINDOW_SEC
    rate_limit_records[client_ip] = [t for t in rate_limit_records[client_ip] if t > window_start]
    
    if len(rate_limit_records[client_ip]) >= MAX_REQUESTS_PER_WINDOW:
        logger.warning(f"Rate limit exceeded for IP: {client_ip}")
        return JSONResponse(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            content={"detail": "Too many requests. Please slow down to protect concert ticketing integrity."},
            headers={"Retry-After": str(RATE_LIMIT_WINDOW_SEC)},
        )
    
    rate_limit_records[client_ip].append(now)

    response: Response = await call_next(request)

    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"

    return response

# CORS Configuration
allowed_origins_env = os.getenv(
    "CORS_ORIGINS",
    "https://echosphere.suiet.website,https://www.echosphere.suiet.website,http://localhost:3000,http://127.0.0.1:3000"
)
origins = [origin.strip() for origin in allowed_origins_env.split(",") if origin.strip()]
for default_o in [
    "https://echosphere.suiet.website",
    "https://www.echosphere.suiet.website",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]:
    if default_o not in origins:
        origins.append(default_o)

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_origin_regex=r"^https://([a-zA-Z0-9-]+\.)*suiet\.website$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# -------------------------------------------------------------
# EchoSphere Tier Pricing (INR)
# -------------------------------------------------------------
TIER_PRICING = {
    "Early Bird Ticket": 349.00,
    "VIP Fan Zone": 499.00,
    "Student Pass": 199.00,
    "All-Access Pass": 999.00,
}

EMAIL_REGEX = re.compile(r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$")

class AttendeeItem(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=70, description="Full name of ticket holder")
    email: str = Field(..., description="Valid email address to receive pass")
    phone: str = Field(..., min_length=7, max_length=20, description="Contact phone number")

    @field_validator("full_name")
    @classmethod
    def validate_full_name(cls, v: str) -> str:
        clean = v.strip()
        if len(clean) < 2:
            raise ValueError("Full name must be at least 2 characters.")
        if not re.match(r"^[a-zA-Z\s.'-]+$", clean):
            raise ValueError("Full name should only contain letters and standard characters.")
        return clean

    @field_validator("email")
    @classmethod
    def validate_email_syntax(cls, v: str) -> str:
        clean = v.strip().lower()
        if not EMAIL_REGEX.match(clean):
            raise ValueError(f"Please provide a valid email address ({v}).")
        return clean

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v: str) -> str:
        clean = re.sub(r"[\s\-\(\)\+]", "", v)
        if clean.startswith("91") and len(clean) == 12:
            clean = clean[2:]
        elif clean.startswith("0") and len(clean) == 11:
            clean = clean[1:]
        if len(clean) == 10 and clean[0] in "6789":
            return clean
        if 10 <= len(clean) <= 15:
            return clean
        raise ValueError("Please provide a valid 10-digit mobile phone number.")

class CreateCashfreeOrderRequest(BaseModel):
    amount: float = Field(..., gt=0, description="Total order amount in INR")
    customer_name: str = Field(..., description="Primary customer name")
    customer_email: str = Field(..., description="Primary customer email")
    customer_phone: str = Field(..., description="Primary customer phone")
    ticket_count: int = Field(default=1, ge=1, le=20, description="Number of tickets")
    tier: Optional[str] = Field(default="Early Bird Ticket", description="Ticket tier")
    attendees: Optional[list[AttendeeItem]] = Field(default=None, description="List of attendees")
    return_url: Optional[str] = Field(default=None, description="Optional return URL after checkout")

class InitiateKonfHubRequest(BaseModel):
    customer_name: str = Field(..., description="Primary customer name")
    customer_email: str = Field(..., description="Primary customer email")
    customer_phone: str = Field(..., description="Primary customer phone")
    ticket_count: int = Field(default=1, ge=1, le=20, description="Number of tickets")
    tier: Optional[str] = Field(default="Early Bird Ticket", description="Ticket tier")
    amount: Optional[float] = Field(default=349.0, description="Ticket price")
    attendees: Optional[list[AttendeeItem]] = Field(default=None, description="List of attendees")

class TicketBookingRequest(BaseModel):
    tier: str = Field(default="Early Bird Ticket", description="Selected ticket tier")
    attendees: Optional[list[AttendeeItem]] = Field(default=None, description="List of attendees")
    # Backwards compatibility for single attendee payload:
    full_name: Optional[str] = Field(default=None)
    email: Optional[str] = Field(default=None)
    phone: Optional[str] = Field(default=None)
    payment_method: Optional[str] = Field(default="cashfree", description="Payment method / provider")
    payment_token: Optional[str] = Field(default=None, description="Payment transaction or order token")
    order_id: Optional[str] = Field(default=None, description="Cashfree order ID")

    @field_validator("tier")
    @classmethod
    def validate_tier_name(cls, v: str) -> str:
        if v not in TIER_PRICING:
            return "Early Bird Ticket"
        return v

def background_email_task(
    to_email: str,
    full_name: str,
    ticket_number: str,
    tier: str,
    amount: float,
    security_hash: str,
    created_at: str,
    phone: Optional[str] = None,
):
    success = send_ticket_confirmation_email(
        to_email=to_email,
        recipient_name=full_name,
        ticket_number=ticket_number,
        tier=tier,
        amount=amount,
        security_hash=security_hash,
        created_at=created_at,
        phone=phone or "",
    )
    if success:
        mark_email_sent(ticket_number)
        logger.info(f"Marked pass #{ticket_number} email as sent in DB.")
    else:
        logger.warning(f"Could not deliver email to {to_email} for pass #{ticket_number}.")

# -------------------------------------------------------------
# Endpoints
# -------------------------------------------------------------
@app.get("/")
def root():
    return {
        "event": "EchoSphere 2026",
        "organizers": "Webflow Community in collaboration with Rotaract",
        "venue": "Srinivas University Mukka (SUIET Campus)",
        "artists": "Najran Kabeer × Benjamin Solomon",
        "date": "2nd November 2026",
        "time": "5:30 PM IST",
        "port": PORT,
    }

@app.get("/api/health")
def health_check():
    stats = get_ticket_stats()
    return {
        "status": "healthy",
        "event": "EchoSphere 2026",
        "port": PORT,
        "smtp_configured": bool(os.getenv("SMTP_EMAIL")),
        "cashfree_configured": is_cashfree_configured(),
        "tickets_sold": stats["total_sold"],
        "next_ticket_id": stats["next_ticket_id"],
    }

@app.get("/api/tickets/stats")
def ticket_stats():
    return get_ticket_stats()

@app.get("/api/tickets/tier-settings")
def get_public_tier_settings(tier_name: str = "Early Bird Ticket"):
    """
    Returns live dynamic pricing, scratched price, and scarcity numbers for the frontend.
    """
    return get_tier_settings(tier_name)

@app.get("/api/tickets/tiers")
def list_tiers():
    settings = get_tier_settings("Early Bird Ticket")
    return [
        {
            "id": "early-bird",
            "name": settings["tier_name"],
            "price": settings["price"],
            "original_price": settings["original_price"],
            "currency": "INR",
            "tag": f"{settings['tier_name']} {settings['claimed_count']}/{settings['total_count']}",
            "marketing_badge": f"{settings['claimed_count']}/{settings['total_count']} Claimed",
            "spots_left": settings["spots_left"],
            "total_early_bird": settings["total_count"],
            "claimed_early_bird": settings["claimed_count"],
            "badge_text": settings["badge_text"],
            "savings": settings["savings"],
            "perks": [
                "Full amphitheatre arena access at Srinivas University Mukka",
                "Live concert entry for Najran Kabeer × Benjamin Solomon",
                "Official EchoSphere Digital Security Pass",
                "Complimentary food & festival stalls access",
            ],
        }
    ]

# -------------------------------------------------------------
# Cashfree Payment Gateway Endpoints
# -------------------------------------------------------------
@app.get("/api/payment/cashfree/status")
def cashfree_status():
    env = os.getenv("CASHFREE_ENV", "sandbox").strip().lower()
    return {
        "configured": is_cashfree_configured(),
        "mode": "production" if env in ("production", "prod") else "sandbox",
    }

@app.post("/api/payment/cashfree/create-order")
def create_order(payload: CreateCashfreeOrderRequest):
    stats = get_ticket_stats()
    if stats["available_tickets"] < payload.ticket_count:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Only {stats['available_tickets']} ticket(s) remaining for EchoSphere.",
        )

    order_id = f"ES_{int(time.time() * 1000)}"
    tier_name = payload.tier or "Early Bird Ticket"
    tier_info = get_tier_settings(tier_name)
    per_ticket_price = tier_info["price"]
    calculated_amount = round(per_ticket_price * payload.ticket_count, 2)
    # Use server-calculated amount to prevent tampering, or payload amount if matches
    final_amount = calculated_amount if calculated_amount > 0 else payload.amount

    # Normalize attendee list
    attendee_dicts = []
    if payload.attendees and len(payload.attendees) > 0:
        attendee_dicts = [
            {"full_name": a.full_name, "email": a.email, "phone": a.phone}
            for a in payload.attendees
        ]
    else:
        attendee_dicts = [
            {
                "full_name": payload.customer_name.strip(),
                "email": payload.customer_email.strip().lower(),
                "phone": payload.customer_phone.strip(),
            }
        ]

    # Save pending order in DB for rock-solid webhook/mobile recovery
    save_pending_order(
        order_id=order_id,
        customer_name=payload.customer_name,
        customer_email=payload.customer_email,
        customer_phone=payload.customer_phone,
        tier=tier_name,
        ticket_count=payload.ticket_count,
        amount=final_amount,
        attendees=attendee_dicts,
    )

    try:
        order_res = create_cashfree_order(
            order_id=order_id,
            amount=final_amount,
            customer_name=payload.customer_name,
            customer_email=payload.customer_email,
            customer_phone=payload.customer_phone,
            return_url=payload.return_url,
        )
        env = os.getenv("CASHFREE_ENV", "sandbox").strip().lower()
        mode = "production" if env in ("production", "prod") else "sandbox"
        return {
            "success": True,
            "order_id": order_res.get("order_id", order_id),
            "payment_session_id": order_res.get("payment_session_id"),
            "configured": order_res.get("configured", True),
            "mode": mode,
            "amount": final_amount,
            "currency": "INR",
        }
    except Exception as e:
        logger.error(f"Error creating Cashfree order: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )

@app.post("/api/payment/cashfree/verify-order/{order_id}")
def verify_order(order_id: str, background_tasks: BackgroundTasks):
    try:
        res = verify_cashfree_order(order_id)
        cf_status = str(res.get("order_status", "")).upper()
        
        # Check payments for any successful or failed attempts
        payments = []
        try:
            payments = get_order_payments(order_id)
        except Exception as e:
            logger.warning(f"Could not retrieve payments for {order_id}: {e}")
            payments = []

        is_paid = (cf_status in ("PAID", "SUCCESS")) or any(
            str(p.get("payment_status", "")).upper() == "SUCCESS" for p in payments
        )

        fulfillment = None
        if is_paid:
            try:
                # Fulfill booking immediately and idempotently right inside verify_order
                fulfillment = fulfill_booking(order_id=order_id, background_tasks=background_tasks)
            except Exception as f_err:
                logger.error(f"Error auto-fulfilling booking in verify_order for {order_id}: {f_err}")

        is_failed = False
        if not is_paid:
            if cf_status in ("FAILED", "EXPIRED", "TERMINATED", "USER_DROPPED", "CANCELLED"):
                is_failed = True
            elif payments and all(
                str(p.get("payment_status", "")).upper() in ("FAILED", "USER_DROPPED", "CANCELLED")
                for p in payments
            ):
                is_failed = True
            elif cf_status == "ACTIVE" and len(payments) > 0:
                is_failed = any(
                    str(p.get("payment_status", "")).upper() in ("FAILED", "USER_DROPPED", "CANCELLED")
                    for p in payments
                )

        if is_failed:
            logger.info(f"Order {order_id} marked as FAILED in DB (cf_status={cf_status})")
            mark_order_failed(order_id, reason=f"Order status: {cf_status}")

        return {
            "success": True,
            "data": res,
            "order_status": cf_status,
            "is_paid": is_paid,
            "is_failed": is_failed,
            "payments": payments,
            "tickets": fulfillment.get("tickets") if fulfillment else None,
            "ticket": fulfillment.get("ticket") if fulfillment else None,
        }
    except Exception as e:
        logger.error(f"Error verifying Cashfree order {order_id}: {e}")
        mark_order_failed(order_id, reason=str(e))
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={
                "success": False,
                "is_paid": False,
                "is_failed": True,
                "detail": f"Verification failed: {str(e)}",
            },
        )

@app.post("/api/payment/cashfree/fail-order/{order_id}")
def fail_order(order_id: str):
    """Explicitly marks an order as failed when canceled or dropped by user."""
    mark_order_failed(order_id, reason="Client reported payment failure")
    return {"success": True, "message": f"Order {order_id} marked as failed. No tickets registered."}

@app.get("/api/payment/cashfree/order/{order_id}/payments")
def get_payments(order_id: str):
    try:
        payments = get_order_payments(order_id)
        return {"success": True, "payments": payments}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Could not retrieve payment details: {str(e)}",
        )

# -------------------------------------------------------------
# KonfHub Ticketing & Payment Gateway Endpoints
# -------------------------------------------------------------
KONFHUB_EVENT_URL = os.getenv("KONFHUB_EVENT_URL", "https://konfhub.com/echosphere-20").strip()

@app.get("/api/payment/konfhub/status")
def konfhub_status():
    return {
        "active": True,
        "gateway": "konfhub",
        "event_url": KONFHUB_EVENT_URL,
    }

@app.post("/api/payment/konfhub/initiate")
def initiate_konfhub_order(payload: InitiateKonfHubRequest):
    """
    Step 1: Save attendee intent in pending_orders table BEFORE redirecting to KonfHub.
    This guarantees 100% data capture and zero data loss on the backend!
    """
    stats = get_ticket_stats()
    if stats["available_tickets"] < (payload.ticket_count or 1):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Only {stats['available_tickets']} ticket(s) remaining for EchoSphere.",
        )

    order_id = f"KH_INIT_{int(time.time() * 1000)}_{secrets.token_hex(3)}"
    tier_name = payload.tier or "Early Bird Ticket"
    tier_info = get_tier_settings(tier_name)
    per_ticket_price = tier_info.get("price", 349.0)
    final_amount = round(per_ticket_price * (payload.ticket_count or 1), 2)

    attendee_dicts = []
    if payload.attendees and len(payload.attendees) > 0:
        attendee_dicts = [
            {"full_name": a.full_name.strip(), "email": a.email.strip().lower(), "phone": a.phone.strip()}
            for a in payload.attendees
        ]
    else:
        attendee_dicts = [
            {
                "full_name": payload.customer_name.strip(),
                "email": payload.customer_email.strip().lower(),
                "phone": payload.customer_phone.strip(),
            }
        ]

    save_pending_order(
        order_id=order_id,
        customer_name=payload.customer_name.strip(),
        customer_email=payload.customer_email.strip().lower(),
        customer_phone=payload.customer_phone.strip(),
        tier=tier_name,
        ticket_count=payload.ticket_count or 1,
        amount=final_amount,
        attendees=attendee_dicts,
    )

    logger.info(f"Saved KonfHub checkout intent for {payload.customer_email} ({order_id})")

    return {
        "success": True,
        "order_id": order_id,
        "redirect_url": KONFHUB_EVENT_URL,
        "amount": final_amount,
    }

# -------------------------------------------------------------
# Fulfill Booking Helper (Used by API & Webhook)
# -------------------------------------------------------------
def fulfill_booking(
    order_id: str,
    background_tasks: Optional[BackgroundTasks] = None,
    requested_attendees: Optional[list[AttendeeItem]] = None,
    requested_tier: Optional[str] = None,
) -> Dict[str, Any]:
    # 1. Check idempotency: Have tickets already been issued for this payment ID?
    existing_tickets = get_tickets_by_payment_id(order_id)
    if existing_tickets:
        logger.info(f"Order {order_id} already confirmed with {len(existing_tickets)} tickets.")
        primary_ticket = existing_tickets[0]
        return {
            "success": True,
            "message": f"Successfully loaded {len(existing_tickets)} EchoSphere Pass(es)!",
            "count": len(existing_tickets),
            "total_amount": round(primary_ticket["amount"] * len(existing_tickets), 2),
            "currency": "INR",
            "tickets": [
                {
                    "ticket_number": t["ticket_number"],
                    "full_name": t["full_name"],
                    "email": t["email"],
                    "tier": t["tier"],
                    "amount": t["amount"],
                    "currency": t["currency"],
                    "payment_id": t["payment_id"],
                    "security_hash": t["security_hash"],
                    "created_at": t["created_at"],
                    "email_status": "sent" if t.get("email_sent") else "dispatched",
                }
                for t in existing_tickets
            ],
            "ticket": {
                "ticket_number": primary_ticket["ticket_number"],
                "full_name": primary_ticket["full_name"],
                "email": primary_ticket["email"],
                "tier": primary_ticket["tier"],
                "amount": primary_ticket["amount"],
                "currency": primary_ticket["currency"],
                "payment_id": primary_ticket["payment_id"],
                "security_hash": primary_ticket["security_hash"],
                "created_at": primary_ticket["created_at"],
                "email_status": "sent" if primary_ticket.get("email_sent") else "dispatched",
            },
            "event_details": {
                "title": "EchoSphere 2026",
                "organizers": "Webflow Community in collaboration with Rotaract",
                "artists": "Najran Kabeer × Benjamin Solomon",
                "date": "2nd November 2026",
                "time": "5:30 PM IST",
                "venue": "Srinivas University Mukka (SUIET)",
            },
        }

    # 2. Strict Payment Verification with Cashfree (Prevents ticket forgery)
    cf_order = {}
    if is_cashfree_configured():
        try:
            cf_order = verify_cashfree_order(order_id)
        except Exception as e:
            logger.error(f"Failed to verify order {order_id} with Cashfree: {e}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cashfree order verification failed: {str(e)}",
            )
        
        cf_status = str(cf_order.get("order_status", "")).upper()
        if cf_status not in ("PAID", "SUCCESS"):
            # Also check get_order_payments
            try:
                payments = get_order_payments(order_id)
                has_success = any(str(p.get("payment_status", "")).upper() == "SUCCESS" for p in payments)
            except Exception:
                has_success = False

            if not has_success:
                mark_order_failed(order_id, reason=f"Order status: {cf_status}")
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Order {order_id} is not PAID on Cashfree (Current Status: {cf_status}). Tickets cannot be registered.",
                )

    # 3. Retrieve attendees and tier details
    pending = get_pending_order(order_id)
    attendees: list[AttendeeItem] = []
    tier = requested_tier or (pending["tier"] if pending else "Early Bird Ticket")
    
    has_valid_requested = (
        requested_attendees
        and len(requested_attendees) > 0
        and not any("attendee@srinivasuniversity.edu.in" in a.email for a in requested_attendees)
    )

    if has_valid_requested:
        attendees = requested_attendees
    elif pending and pending.get("attendees"):
        for a in pending["attendees"]:
            attendees.append(
                AttendeeItem(
                    full_name=a.get("full_name") or a.get("fullName", "Attendee"),
                    email=a.get("email") or pending.get("customer_email", ""),
                    phone=a.get("phone") or pending.get("customer_phone", "9876543210"),
                )
            )
    else:
        cust = cf_order.get("customer_details", {}) if is_cashfree_configured() else {}
        attendees.append(
            AttendeeItem(
                full_name=cust.get("customer_name") or "EchoSphere Attendee",
                email=cust.get("customer_email") or "webflowcommunity@srinivasuniversity.edu.in",
                phone=cust.get("customer_phone") or "9876543210",
            )
        )

    stats = get_ticket_stats()
    if stats["available_tickets"] < len(attendees):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Only {stats['available_tickets']} ticket(s) remaining for EchoSphere.",
        )

    tier_info = get_tier_settings(tier)
    per_ticket_amount = tier_info["price"]

    # 4. Generate tickets in DB
    created_tickets = []
    for attendee in attendees:
        ticket = create_ticket(
            full_name=attendee.full_name,
            email=attendee.email,
            phone=attendee.phone,
            tier=tier,
            amount=per_ticket_amount,
            currency="INR",
            payment_id=order_id,
            secret_key=SECRET_KEY,
        )
        created_tickets.append(ticket)
        logger.info(f"Booked pass #{ticket['ticket_number']} for {attendee.email} ({tier})")

        # Send individual confirmation email
        if background_tasks:
            background_tasks.add_task(
                background_email_task,
                to_email=ticket["email"],
                full_name=ticket["full_name"],
                ticket_number=ticket["ticket_number"],
                tier=ticket["tier"],
                amount=ticket["amount"],
                security_hash=ticket["security_hash"],
                created_at=ticket["created_at"],
                phone=ticket.get("phone", ""),
            )
        else:
            try:
                background_email_task(
                    to_email=ticket["email"],
                    full_name=ticket["full_name"],
                    ticket_number=ticket["ticket_number"],
                    tier=ticket["tier"],
                    amount=ticket["amount"],
                    security_hash=ticket["security_hash"],
                    created_at=ticket["created_at"],
                    phone=ticket.get("phone", ""),
                )
            except Exception as mail_err:
                logger.error(f"Email dispatch error: {mail_err}")

    mark_order_completed(order_id)
    primary_ticket = created_tickets[0] if created_tickets else None

    return {
        "success": True,
        "message": f"Successfully reserved {len(created_tickets)} EchoSphere Pass(es)!",
        "count": len(created_tickets),
        "total_amount": round(per_ticket_amount * len(created_tickets), 2),
        "currency": "INR",
        "tickets": [
            {
                "ticket_number": t["ticket_number"],
                "full_name": t["full_name"],
                "email": t["email"],
                "tier": t["tier"],
                "amount": t["amount"],
                "currency": t["currency"],
                "payment_id": t["payment_id"],
                "security_hash": t["security_hash"],
                "created_at": t["created_at"],
                "email_status": "dispatched",
            }
            for t in created_tickets
        ],
        "ticket": {
            "ticket_number": primary_ticket["ticket_number"],
            "full_name": primary_ticket["full_name"],
            "email": primary_ticket["email"],
            "tier": primary_ticket["tier"],
            "amount": primary_ticket["amount"],
            "currency": primary_ticket["currency"],
            "payment_id": primary_ticket["payment_id"],
            "security_hash": primary_ticket["security_hash"],
            "created_at": primary_ticket["created_at"],
            "email_status": "dispatched",
        } if primary_ticket else None,
        "event_details": {
            "title": "EchoSphere 2026",
            "organizers": "Webflow Community in collaboration with Rotaract",
            "artists": "Najran Kabeer × Benjamin Solomon",
            "date": "2nd November 2026",
            "time": "5:30 PM IST",
            "venue": "Srinivas University Mukka (SUIET)",
        },
    }

# -------------------------------------------------------------
# Ticket Booking Endpoint (Single & Multi-Attendee)
# -------------------------------------------------------------
@app.post("/api/tickets/book", status_code=status.HTTP_201_CREATED)
def book_ticket(
    payload: TicketBookingRequest,
    background_tasks: BackgroundTasks,
):
    order_id = payload.order_id or payload.payment_token
    if not order_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Order ID / Payment token is required to book tickets.",
        )

    # Gather attendees if provided in payload
    attendees: Optional[list[AttendeeItem]] = None
    if payload.attendees and len(payload.attendees) > 0:
        attendees = payload.attendees
    elif payload.full_name and payload.email and payload.phone:
        attendees = [AttendeeItem(full_name=payload.full_name, email=payload.email, phone=payload.phone)]

    return fulfill_booking(
        order_id=order_id,
        background_tasks=background_tasks,
        requested_attendees=attendees,
        requested_tier=payload.tier,
    )

# -------------------------------------------------------------
# Cashfree Webhook Endpoint
# -------------------------------------------------------------
@app.post("/api/payment/cashfree/webhook")
async def cashfree_webhook(request: Request, background_tasks: BackgroundTasks):
    """
    Official Cashfree Webhook endpoint.
    Verifies HMAC-SHA256 signature and automatically fulfills orders when paid.
    """
    raw_body_bytes = await request.body()
    raw_body = raw_body_bytes.decode("utf-8")
    signature = request.headers.get("x-webhook-signature") or request.headers.get("X-Webhook-Signature", "")
    timestamp = request.headers.get("x-webhook-timestamp") or request.headers.get("X-Webhook-Timestamp", "")

    if is_cashfree_configured():
        if not signature or not timestamp or not verify_cashfree_webhook_signature(raw_body, timestamp, signature):
            logger.warning("Cashfree webhook signature mismatch or missing signature headers.")
            return JSONResponse(status_code=status.HTTP_401_UNAUTHORIZED, content={"detail": "Invalid webhook signature"})

    try:
        data = json.loads(raw_body)
    except Exception as e:
        logger.error(f"Malformed Cashfree webhook JSON: {e}")
        return JSONResponse(status_code=status.HTTP_400_BAD_REQUEST, content={"detail": "Invalid JSON"})

    event_type = str(data.get("type", "")).upper()
    order_data = data.get("data", {}).get("order", {}) or data.get("data", {})
    order_id = order_data.get("order_id") or data.get("order_id")

    logger.info(f"Received Cashfree webhook: type={event_type}, order_id={order_id}")

    if order_id and ("PAID" in event_type or "SUCCESS" in event_type or event_type == "ORDER.PAID"):
        try:
            fulfill_booking(order_id=order_id, background_tasks=background_tasks)
            logger.info(f"Webhook successfully fulfilled order {order_id}")
        except Exception as e:
            logger.error(f"Error fulfilling order {order_id} via webhook: {e}")
    elif order_id and any(term in event_type for term in ("FAILED", "USER_DROPPED", "CANCELLED", "EXPIRED")):
        logger.info(f"Cashfree webhook indicates payment failed for order {order_id} (type={event_type})")
        mark_order_failed(order_id, reason=f"Webhook event: {event_type}")

    return {"status": "OK", "order_id": order_id}

# -------------------------------------------------------------
# KonfHub Official Webhook Receiver
# -------------------------------------------------------------
@app.post("/api/payment/konfhub/webhook")
async def konfhub_webhook(request: Request, background_tasks: BackgroundTasks):
    """
    Official KonfHub Webhook receiver.
    Receives real-time Attendee Registration events from KonfHub,
    extracts attendee info, atomically issues the next ticket (#0135+),
    and sends the official EchoSphere confirmation pass email.
    """
    raw_body_bytes = await request.body()
    raw_body = raw_body_bytes.decode("utf-8")
    logger.info(f"Received KonfHub webhook payload: {raw_body}")

    try:
        payload = json.loads(raw_body)
    except Exception as e:
        logger.error(f"Malformed KonfHub webhook JSON: {e}")
        return JSONResponse(status_code=status.HTTP_400_BAD_REQUEST, content={"detail": "Invalid JSON"})

    data = payload.get("data") if isinstance(payload.get("data"), dict) else payload

    # 1. Resolve KonfHub Order / Ticket ID for tracking & idempotency
    raw_id = (
        data.get("order_id")
        or data.get("ticket_id")
        or data.get("registration_id")
        or data.get("booking_id")
        or payload.get("order_id")
        or payload.get("ticket_id")
        or f"KH_{int(time.time() * 1000)}"
    )
    kh_payment_id = f"KH_{str(raw_id).lstrip('KH_')}"

    # 2. Check Idempotency: Prevent duplicate pass issuance
    existing_tickets = get_tickets_by_payment_id(kh_payment_id)
    if existing_tickets:
        logger.info(f"KonfHub order {kh_payment_id} already confirmed ({len(existing_tickets)} tickets). Returning OK.")
        return {"status": "OK", "message": "Already processed", "payment_id": kh_payment_id}

    # 3. Extract buyer details to link with our pending_orders table
    buyer_email = (
        data.get("email")
        or data.get("email_id")
        or (data.get("buyer_details") if isinstance(data.get("buyer_details"), dict) else {}).get("email")
        or (data.get("buyer_details") if isinstance(data.get("buyer_details"), dict) else {}).get("email_id")
        or (data.get("registration_details") if isinstance(data.get("registration_details"), dict) else {}).get("email")
        or payload.get("email")
        or payload.get("email_id")
    )
    if buyer_email:
        buyer_email = str(buyer_email).strip().lower()

    buyer_phone = (
        data.get("phone")
        or data.get("phone_number")
        or data.get("mobile")
        or (data.get("buyer_details") if isinstance(data.get("buyer_details"), dict) else {}).get("phone")
        or (data.get("buyer_details") if isinstance(data.get("buyer_details"), dict) else {}).get("phone_number")
        or (data.get("registration_details") if isinstance(data.get("registration_details"), dict) else {}).get("phone")
        or payload.get("phone")
    )
    if buyer_phone:
        buyer_phone = str(buyer_phone).strip()

    buyer_name = (
        data.get("name")
        or data.get("full_name")
        or (data.get("buyer_details") if isinstance(data.get("buyer_details"), dict) else {}).get("name")
        or (data.get("buyer_details") if isinstance(data.get("buyer_details"), dict) else {}).get("full_name")
        or (data.get("registration_details") if isinstance(data.get("registration_details"), dict) else {}).get("name")
        or payload.get("name")
        or "EchoSphere Attendee"
    )

    attendees_to_issue = []

    # Priority A: Check if this booking matches a pending order from our website form!
    # Our website form records distinct names, emails, and phones for EACH of the 1 to 10 attendees.
    matched_pending = None
    if buyer_email:
        matched_pending = get_pending_order_by_buyer(buyer_email, buyer_phone)

    if matched_pending and matched_pending.get("attendees"):
        pending_attendees = matched_pending["attendees"]
        logger.info(
            f"Found matching website pending order {matched_pending['order_id']} with {len(pending_attendees)} attendees for {buyer_email}"
        )
        for att in pending_attendees:
            a_name = att.get("full_name") or att.get("name") or buyer_name or "EchoSphere Attendee"
            a_email = att.get("email") or buyer_email
            a_phone = att.get("phone") or buyer_phone or ""
            if a_email:
                attendees_to_issue.append({
                    "name": str(a_name).strip(),
                    "email": str(a_email).strip().lower(),
                    "phone": str(a_phone).strip(),
                })
        # Mark pending order completed
        mark_order_completed(matched_pending["order_id"])

    # Priority B: Check if KonfHub payload included distinct attendees array
    if not attendees_to_issue:
        attendees_list = data.get("attendees") or payload.get("attendees")
        if isinstance(attendees_list, list) and len(attendees_list) > 0:
            for att in attendees_list:
                if isinstance(att, dict):
                    a_name = att.get("name") or att.get("full_name") or att.get("attendee_name") or buyer_name
                    a_email = att.get("email") or att.get("email_id") or att.get("attendee_email")
                    a_phone = att.get("phone") or att.get("phone_number") or att.get("mobile") or ""
                    if a_email:
                        attendees_to_issue.append({
                            "name": str(a_name).strip(),
                            "email": str(a_email).strip().lower(),
                            "phone": str(a_phone).strip(),
                        })

    # Priority C: Fallback to buyer details (handling multi-ticket quantity if > 1)
    if not attendees_to_issue and buyer_email:
        raw_qty = (
            data.get("ticket_quantity")
            or data.get("quantity")
            or data.get("no_of_tickets")
            or payload.get("ticket_quantity")
            or payload.get("quantity")
            or 1
        )
        try:
            qty = max(1, min(15, int(raw_qty)))
        except Exception:
            qty = 1

        for i in range(1, qty + 1):
            suffix = f" (Pass {i}/{qty})" if qty > 1 and i > 1 else ""
            attendees_to_issue.append({
                "name": f"{buyer_name}{suffix}".strip(),
                "email": buyer_email,
                "phone": buyer_phone or "",
            })

    if not attendees_to_issue:
        logger.warning(f"KonfHub webhook received without identifiable attendee email: {payload}")
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content={"status": "ignored", "reason": "No attendee email found in payload"}
        )

    # 4. Resolve tier & price
    tier_info = get_tier_settings("Early Bird Ticket")
    tier_name = str(data.get("ticket_name") or payload.get("ticket_name") or "Early Bird Ticket")
    raw_amount = float(
        data.get("amount_paid")
        or data.get("ticket_price")
        or payload.get("amount_paid")
        or tier_info.get("price", 349.0)
    )
    if len(attendees_to_issue) > 1 and raw_amount > 400.0:
        amount_per_ticket = round(raw_amount / len(attendees_to_issue), 2)
    else:
        amount_per_ticket = float(tier_info.get("price", 349.0))

    created_tickets = []
    for attendee in attendees_to_issue:
        ticket = create_ticket(
            full_name=attendee["name"],
            email=attendee["email"],
            phone=attendee["phone"],
            tier=tier_name,
            amount=amount_per_ticket,
            currency="INR",
            payment_id=kh_payment_id,
            secret_key=SECRET_KEY,
        )
        created_tickets.append(ticket)
        logger.info(
            f"Booked KonfHub pass #{ticket['ticket_number']} for {ticket['email']} (Payment: {kh_payment_id})"
        )

        # Dispatch official confirmation email with pass
        background_tasks.add_task(
            send_ticket_confirmation_email,
            to_email=ticket["email"],
            recipient_name=ticket["full_name"],
            ticket_number=ticket["ticket_number"],
            tier=ticket["tier"],
            amount=ticket["amount"],
            security_hash=ticket["security_hash"],
            created_at=ticket["created_at"],
            phone=ticket.get("phone", ""),
        )

    return {
        "status": "success",
        "message": f"Successfully issued {len(created_tickets)} pass(es)",
        "payment_id": kh_payment_id,
        "tickets": [t["ticket_number"] for t in created_tickets],
    }

@app.get("/api/admin/pending-orders")
def admin_get_pending_orders(auth_token: Optional[str] = Header(None)):
    validate_admin_session(auth_token)
    return {"status": "ok", "orders": get_all_pending_orders(limit=150)}

@app.post("/api/admin/fulfill-pending-order/{order_id}")
def admin_fulfill_pending_order(
    order_id: str,
    background_tasks: BackgroundTasks,
    auth_token: Optional[str] = Header(None)
):
    validate_admin_session(auth_token)
    order = get_pending_order(order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
        
    attendees = order.get("attendees") or []
    if not attendees:
        raise HTTPException(status_code=400, detail="No attendees found in this order")
        
    created = []
    tier_info = get_tier_settings(order.get("tier", "Early Bird Ticket"))
    tier_name = order.get("tier", "Early Bird Ticket")
    total_amount = float(order.get("amount") or 349.0)
    amount_per_ticket = round(total_amount / len(attendees), 2) if len(attendees) > 0 else float(tier_info.get("price", 349.0))
    
    for att in attendees:
        ticket = create_ticket(
            full_name=att.get("full_name") or order.get("customer_name"),
            email=att.get("email") or order.get("customer_email"),
            phone=att.get("phone") or order.get("customer_phone"),
            tier=tier_name,
            amount=amount_per_ticket,
            currency="INR",
            payment_id=order_id,
            secret_key=SECRET_KEY,
        )
        created.append(ticket)
        background_tasks.add_task(
            send_ticket_confirmation_email,
            to_email=ticket["email"],
            recipient_name=ticket["full_name"],
            ticket_number=ticket["ticket_number"],
            tier=ticket["tier"],
            amount=ticket["amount"],
            security_hash=ticket["security_hash"],
            created_at=ticket["created_at"],
            phone=ticket.get("phone", ""),
        )
        
    mark_order_completed(order_id)
    return {
        "status": "ok",
        "message": f"Successfully fulfilled {len(created)} tickets for order {order_id}",
        "tickets": created,
    }

# -------------------------------------------------------------
# Cashfree Order Reconciliation Engine & Background Worker
# -------------------------------------------------------------
def run_reconciliation(background_tasks: Optional[BackgroundTasks] = None) -> Dict[str, Any]:
    """
    Automated Cashfree Reconciliation Engine:
    Inspects all unfulfilled pending orders, verifies each against Cashfree API,
    and automatically issues tickets and confirmation emails for any paid orders.
    """
    if not is_cashfree_configured():
        return {
            "success": False,
            "message": "Cashfree is not configured. Reconciliation skipped.",
            "reconciled_count": 0,
        }

    unfulfilled = get_unfulfilled_pending_orders()
    reconciled_orders = []
    failed_orders = []
    already_valid = []
    errors = []

    if unfulfilled:
        logger.info(f"[Reconciliation] Checking {len(unfulfilled)} unfulfilled pending orders against Cashfree.")

    for po in unfulfilled:
        order_id = po["order_id"]
        # Skip KonfHub orders from Cashfree API verification
        if order_id.startswith("KH_"):
            continue

        # Double-check idempotency in case tickets were just issued
        existing = get_tickets_by_payment_id(order_id)
        if existing:
            mark_order_completed(order_id)
            already_valid.append(order_id)
            continue

        try:
            cf_order = verify_cashfree_order(order_id)
            cf_status = str(cf_order.get("order_status", "")).upper()

            is_paid = cf_status in ("PAID", "SUCCESS")
            if not is_paid:
                try:
                    payments = get_order_payments(order_id)
                    is_paid = any(str(p.get("payment_status", "")).upper() == "SUCCESS" for p in payments)
                except Exception:
                    is_paid = False

            if is_paid:
                logger.info(
                    f"[Reconciliation] Found PAID order {order_id} ({po.get('customer_name')}, {po.get('customer_email')}). Fulfilling pass..."
                )
                res = fulfill_booking(order_id=order_id, background_tasks=background_tasks)
                reconciled_orders.append({
                    "order_id": order_id,
                    "customer_name": po.get("customer_name"),
                    "customer_email": po.get("customer_email"),
                    "amount": po.get("amount"),
                    "tickets": [t["ticket_number"] for t in res.get("tickets", [])],
                })
            elif cf_status in ("FAILED", "USER_DROPPED", "CANCELLED", "EXPIRED"):
                mark_order_failed(order_id, reason=f"Cashfree status: {cf_status}")
                failed_orders.append(order_id)
        except Exception as e:
            logger.error(f"[Reconciliation] Error verifying order {order_id}: {e}")
            errors.append({"order_id": order_id, "error": str(e)})

    stats = get_ticket_stats()
    return {
        "success": True,
        "total_unfulfilled_checked": len(unfulfilled),
        "reconciled_count": len(reconciled_orders),
        "reconciled_orders": reconciled_orders,
        "marked_failed_count": len(failed_orders),
        "errors": errors,
        "updated_stats": stats,
    }

@app.on_event("startup")
async def start_periodic_reconciler():
    """Starts background periodic reconciliation task running every 60s."""
    async def periodic_worker():
        await asyncio.sleep(6)  # Give server 6s to boot up cleanly
        while True:
            try:
                await asyncio.to_thread(run_reconciliation)
            except Exception as ex:
                logger.error(f"[Background Reconciler Worker] Exception: {ex}")
            await asyncio.sleep(60)

    asyncio.create_task(periodic_worker())

@app.get("/api/tickets/verify/{ticket_number}")
def verify_ticket(ticket_number: str):
    ticket = get_ticket_by_number(ticket_number)
    if not ticket:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Pass #{ticket_number} not found or invalid.",
        )
    return {
        "valid": True,
        "ticket_number": ticket["ticket_number"],
        "full_name": ticket["full_name"],
        "tier": ticket["tier"],
        "payment_status": ticket["payment_status"],
        "email_sent": bool(ticket["email_sent"]),
        "checked_in": bool(ticket.get("checked_in")),
        "checked_in_at": ticket.get("checked_in_at"),
        "created_at": ticket["created_at"],
    }

# -------------------------------------------------------------
# Admin /lol Command Center Endpoints (2FA Protected)
# -------------------------------------------------------------
class AdminLoginRequest(BaseModel):
    password: str

class AdminVerifyOtpRequest(BaseModel):
    otp: str

class AdminCheckinRequest(BaseModel):
    ticket_number: str
    undo: Optional[bool] = False

class AdminManualTicketRequest(BaseModel):
    full_name: str
    email: str
    phone: str
    tier: Optional[str] = "Spot Entry Pass"
    amount: float
    send_email: Optional[bool] = True
    admit_now: Optional[bool] = False

def require_admin(request: Request) -> str:
    auth = request.headers.get("Authorization", "")
    token = ""
    if auth.startswith("Bearer "):
        token = auth[7:].strip()
    elif "admin_token" in request.cookies:
        token = request.cookies.get("admin_token", "").strip()

    if not token or not validate_admin_session(token):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Unauthorized. Please authenticate with master password and 2FA.",
        )
    return token

@app.post("/api/admin/login")
def admin_login(payload: AdminLoginRequest, background_tasks: BackgroundTasks):
    """
    Step 1 of 2FA Admin Authentication:
    Validates the admin password (default: 'idontknow') and dispatches 6-digit OTP to admin email.
    """
    clean_pass = payload.password.strip().lower()
    expected_pass = ADMIN_PASSWORD.lower()

    if clean_pass != expected_pass:
        logger.warning("Failed admin password attempt.")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect administrator password.",
        )

    # Dynamic ADMIN_EMAIL lookup
    active_admin_email = os.getenv("ADMIN_EMAIL", ADMIN_EMAIL).strip()

    # Generate 6-digit OTP and temporary session token
    otp_code = f"{secrets.randbelow(900000) + 100000}"
    temp_token = secrets.token_hex(24)

    save_admin_otp(otp_code=otp_code, token=temp_token, ttl_seconds=600)

    # Dispatch OTP email to admin email in background
    background_tasks.add_task(send_admin_otp_email, active_admin_email, otp_code)
    logger.info(f"Admin 2FA OTP generated for {active_admin_email}")

    masked = active_admin_email[:3] + "***@" + active_admin_email.split("@")[-1] if "@" in active_admin_email else "Admin Email"

    return {
        "success": True,
        "message": f"6-digit 2FA code sent to {masked}",
        "masked_email": masked,
    }

@app.post("/api/admin/verify-otp")
def admin_verify_otp(payload: AdminVerifyOtpRequest):
    """
    Step 2 of 2FA Admin Authentication:
    Validates the 6-digit OTP and issues a 24-hour admin session token.
    """
    session_token = verify_admin_otp(payload.otp.strip())
    if not session_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired 2FA code. Please request a new code.",
        )

    return {
        "success": True,
        "token": session_token,
        "message": "Welcome to EchoSphere Gate Command Center.",
    }

@app.get("/api/admin/tickets")
def admin_get_tickets(admin_token: str = Depends(require_admin)):
    """
    Fetches real-time concert ticketing roster and gate statistics.
    """
    stats = get_ticket_stats()
    tickets = get_all_tickets()
    return {
        "success": True,
        "stats": stats,
        "total": len(tickets),
        "tickets": tickets,
    }

@app.post("/api/admin/checkin")
def admin_checkin(payload: AdminCheckinRequest, admin_token: str = Depends(require_admin)):
    """
    Atomic gate check-in with duplicate entry and volunteer collision prevention.
    """
    if payload.undo:
        res = undo_checkin_ticket(payload.ticket_number)
        return {"success": True, "undo": True, "ticket": res.get("ticket")}
    
    res = checkin_ticket(payload.ticket_number)
    return res

@app.post("/api/admin/tickets/create")
def admin_create_ticket(
    payload: AdminManualTicketRequest,
    background_tasks: BackgroundTasks,
    admin_token: str = Depends(require_admin),
):
    """
    Spot / offline ticket generation with variable amount.
    Delivers confirmation email immediately to attendee and returns delivery status.
    """
    stats = get_ticket_stats()
    if stats["total_sold"] >= 2000:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Maximum concert capacity of 2000 tickets reached.",
        )

    ticket = create_manual_ticket(
        full_name=payload.full_name,
        email=payload.email,
        phone=payload.phone,
        tier=payload.tier or "Spot Entry Pass",
        amount=payload.amount,
        secret_key=SECRET_KEY,
        payment_method="Cash / Offline Entry",
    )

    if payload.admit_now:
        checkin_res = checkin_ticket(ticket["ticket_number"])
        ticket["checked_in"] = 1
        ticket["checked_in_at"] = checkin_res.get("checked_in_at")

    email_sent_immediately = False
    if payload.send_email:
        # Deliver immediately so the attendee standing at the desk receives the pass right away
        try:
            email_sent_immediately = send_ticket_confirmation_email(
                to_email=ticket["email"],
                recipient_name=ticket["full_name"],
                ticket_number=ticket["ticket_number"],
                tier=ticket["tier"],
                amount=ticket["amount"],
                security_hash=ticket["security_hash"],
                created_at=ticket["created_at"],
                phone=ticket["phone"],
            )
            if email_sent_immediately:
                mark_email_sent(ticket["ticket_number"])
                ticket["email_sent"] = True
                logger.info(f"Spot pass #{ticket['ticket_number']} confirmed & emailed immediately to {ticket['email']}")
            else:
                background_tasks.add_task(
                    background_email_task,
                    to_email=ticket["email"],
                    full_name=ticket["full_name"],
                    ticket_number=ticket["ticket_number"],
                    tier=ticket["tier"],
                    amount=ticket["amount"],
                    security_hash=ticket["security_hash"],
                    created_at=ticket["created_at"],
                    phone=ticket["phone"],
                )
        except Exception as ex:
            logger.error(f"Error during direct spot ticket email delivery: {ex}")
            background_tasks.add_task(
                background_email_task,
                to_email=ticket["email"],
                full_name=ticket["full_name"],
                ticket_number=ticket["ticket_number"],
                tier=ticket["tier"],
                amount=ticket["amount"],
                security_hash=ticket["security_hash"],
                created_at=ticket["created_at"],
                phone=ticket["phone"],
            )

    msg = f"Pass #{ticket['ticket_number']} created for {ticket['full_name']}."
    if email_sent_immediately:
        msg += f" Confirmation pass emailed directly to {ticket['email']}."
    elif payload.send_email:
        msg += f" Email dispatched to {ticket['email']}."

    return {
        "success": True,
        "message": msg,
        "ticket": ticket,
        "email_sent": email_sent_immediately,
    }

@app.post("/api/admin/tickets/{ticket_number}/resend-email")
def admin_resend_ticket_email(
    ticket_number: str,
    admin_token: str = Depends(require_admin),
):
    """
    Resends concert pass confirmation email to an attendee on demand.
    """
    ticket = get_ticket_by_number(ticket_number)
    if not ticket:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Ticket #{ticket_number} not found in database.",
        )

    sent = send_ticket_confirmation_email(
        to_email=ticket["email"],
        recipient_name=ticket["full_name"],
        ticket_number=ticket["ticket_number"],
        tier=ticket["tier"],
        amount=ticket["amount"],
        security_hash=ticket["security_hash"],
        created_at=ticket["created_at"],
        phone=ticket.get("phone", ""),
    )
    if sent:
        mark_email_sent(ticket["ticket_number"])
        return {
            "success": True,
            "message": f"Concert pass re-sent successfully to {ticket['email']}!",
        }
    else:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to deliver email to {ticket['email']}. Please check SMTP connectivity.",
        )


class AdminUpdateTierSettingsRequest(BaseModel):
    tier_name: Optional[str] = "Early Bird Ticket"
    price: float = Field(..., gt=0, description="Actual ticket price charged to user")
    original_price: float = Field(..., gt=0, description="Scratched/strikethrough original price")
    claimed_count: int = Field(..., ge=0, description="Booked / claimed count")
    total_count: int = Field(..., ge=1, description="Total early bird capacity")
    badge_text: Optional[str] = "Early Bird Ticket"

@app.get("/api/admin/tier-settings")
def admin_get_tier_settings(
    tier_name: str = "Early Bird Ticket",
    admin_token: str = Depends(require_admin),
):
    """
    Get current tier pricing & scarcity for admin management panel.
    """
    return {
        "success": True,
        "settings": get_tier_settings(tier_name),
    }

@app.put("/api/admin/tier-settings")
def admin_update_tier_settings(
    payload: AdminUpdateTierSettingsRequest,
    admin_token: str = Depends(require_admin),
):
    """
    Updates live ticket price, scratched price, booked count, and total spots in database.
    This immediately reflects on frontend booking modal and Cashfree order amounts.
    """
    tier_name = payload.tier_name or "Early Bird Ticket"
    updated = update_tier_settings(
        tier_name=tier_name,
        price=payload.price,
        original_price=payload.original_price,
        claimed_count=payload.claimed_count,
        total_count=payload.total_count,
        badge_text=payload.badge_text or tier_name,
    )
    logger.info(
        f"Admin updated tier settings for '{tier_name}': price=₹{payload.price}, orig=₹{payload.original_price}, booked={payload.claimed_count}/{payload.total_count}"
    )
    return {
        "success": True,
        "message": f"Pricing updated: ₹{updated['price']} (scratched: ₹{updated['original_price']}), {updated['claimed_count']}/{updated['total_count']} booked.",
        "settings": updated,
    }

@app.post("/api/admin/reconcile-orders")
def admin_reconcile_orders(
    background_tasks: BackgroundTasks,
    admin_token: str = Depends(require_admin),
):
    """
    On-demand reconciliation button in Gate Command Center:
    Pulls latest payment statuses from Cashfree and issues any missing tickets.
    """
    res = run_reconciliation(background_tasks=background_tasks)
    return res


