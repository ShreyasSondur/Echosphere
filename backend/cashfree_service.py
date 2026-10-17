from __future__ import annotations

import os
import json
import time
import logging
import urllib.request
import urllib.error
from pathlib import Path
from typing import Dict, Any, Optional
from dotenv import load_dotenv

# Ensure .env is loaded
load_dotenv(Path(__file__).resolve().parent / ".env")
load_dotenv()

logger = logging.getLogger("cashfree_service")

CASHFREE_APP_ID = os.getenv("CASHFREE_APP_ID", "").strip()
CASHFREE_SECRET_KEY = os.getenv("CASHFREE_SECRET_KEY", "").strip()
CASHFREE_API_VERSION = os.getenv("CASHFREE_API_VERSION", "2023-08-01").strip()
CASHFREE_ENV = os.getenv("CASHFREE_ENV", "sandbox").strip().lower()

def is_cashfree_configured() -> bool:
    """Returns True if valid Cashfree credentials are set."""
    app_id = os.getenv("CASHFREE_APP_ID", "").strip()
    secret = os.getenv("CASHFREE_SECRET_KEY", "").strip()
    return bool(app_id and secret and not app_id.startswith("your_") and not secret.startswith("your_"))

def get_cashfree_base_url() -> str:
    env = os.getenv("CASHFREE_ENV", "sandbox").strip().lower()
    if env in ("production", "prod"):
        return "https://api.cashfree.com/pg"
    return "https://sandbox.cashfree.com/pg"

def create_cashfree_order(
    order_id: str,
    amount: float,
    customer_name: str,
    customer_email: str,
    customer_phone: str,
    return_url: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Creates an order on Cashfree Payment Gateway.
    """
    if not is_cashfree_configured():
        raise RuntimeError(
            "Cashfree API keys not found. Please add your CASHFREE_APP_ID and CASHFREE_SECRET_KEY in backend/.env to connect to the actual Cashfree payment gateway."
        )

    app_id = os.getenv("CASHFREE_APP_ID", "").strip()
    secret = os.getenv("CASHFREE_SECRET_KEY", "").strip()
    api_version = os.getenv("CASHFREE_API_VERSION", "2023-08-01").strip()
    env = os.getenv("CASHFREE_ENV", "sandbox").strip().lower()
    is_prod = env in ("production", "prod")
    base_url = get_cashfree_base_url()

    # Clean phone number (Cashfree expects 10 digits for Indian numbers)
    clean_phone = "".join(filter(str.isdigit, customer_phone))
    if len(clean_phone) > 10:
        clean_phone = clean_phone[-10:]
    elif len(clean_phone) < 10:
        clean_phone = "9876543210"

    # Build compliant return_url
    # Note: Cashfree Production strictly enforces https:// protocol on return_url
    configured_return_url = os.getenv("CASHFREE_RETURN_URL", "").strip()
    if return_url:
        target_return_url = return_url
    elif configured_return_url:
        target_return_url = configured_return_url
    elif is_prod:
        target_return_url = f"https://echosphere.suiet.website/?order_id={order_id}"
    else:
        target_return_url = f"http://localhost:3000/?order_id={order_id}"

    if "{order_id}" in target_return_url:
        target_return_url = target_return_url.replace("{order_id}", order_id)

    if is_prod and target_return_url.startswith("http://"):
        target_return_url = "https://" + target_return_url[7:]

    notify_url = os.getenv(
        "CASHFREE_NOTIFY_URL",
        "https://echosphere.suiet.website/api/payment/cashfree/webhook" if is_prod else ""
    ).strip()

    order_meta: Dict[str, Any] = {
        "return_url": target_return_url,
    }
    if notify_url:
        order_meta["notify_url"] = notify_url

    payload = {
        "order_id": order_id,
        "order_amount": round(amount, 2),
        "order_currency": "INR",
        "customer_details": {
            "customer_id": f"cust_{int(time.time())}_{order_id[:8]}",
            "customer_name": customer_name.strip() or "EchoSphere Attendee",
            "customer_email": customer_email.strip().lower(),
            "customer_phone": clean_phone,
        },
        "order_meta": order_meta,
        "order_note": "EchoSphere 2026 Concert Pass - Najran Kabeer × Benjamin Solomon Live",
        "order_tags": {
            "brand": "EchoSphere",
            "event": "EchoSphere 2026",
            "venue": "SUIET Mukka",
        },
    }

    url = f"{base_url}/orders"
    req_data = json.dumps(payload).encode("utf-8")

    req = urllib.request.Request(
        url,
        data=req_data,
        headers={
            "x-client-id": app_id,
            "x-client-secret": secret,
            "x-api-version": api_version,
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=15) as response:
            res_body = response.read().decode("utf-8")
            data = json.loads(res_body)
            data["configured"] = True
            data["mode"] = "production" if is_prod else "sandbox"
            return data
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8")
        logger.error(f"Cashfree HTTPError {e.code}: {err_body}")
        try:
            err_json = json.loads(err_body)
            msg = err_json.get("message") or err_json.get("detail") or str(err_body)
        except Exception:
            msg = err_body
        raise RuntimeError(f"Cashfree Error ({e.code}): {msg}")
    except Exception as e:
        logger.error(f"Cashfree request failure: {str(e)}")
        raise RuntimeError(f"Failed to connect to Cashfree: {str(e)}")

def verify_cashfree_order(order_id: str) -> Dict[str, Any]:
    """
    Fetches the status of an order directly from Cashfree.
    """
    if not is_cashfree_configured():
        return {
            "configured": False,
            "order_id": order_id,
            "order_status": "PAID",
            "simulated": True,
        }

    app_id = os.getenv("CASHFREE_APP_ID", "").strip()
    secret = os.getenv("CASHFREE_SECRET_KEY", "").strip()
    api_version = os.getenv("CASHFREE_API_VERSION", "2023-08-01").strip()
    base_url = get_cashfree_base_url()

    url = f"{base_url}/orders/{order_id}"
    req = urllib.request.Request(
        url,
        headers={
            "x-client-id": app_id,
            "x-client-secret": secret,
            "x-api-version": api_version,
            "Accept": "application/json",
        },
        method="GET",
    )

    try:
        with urllib.request.urlopen(req, timeout=15) as response:
            res_body = response.read().decode("utf-8")
            data = json.loads(res_body)
            return data
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8")
        logger.error(f"Cashfree verification HTTPError {e.code}: {err_body}")
        raise RuntimeError(f"Cashfree verification error: {err_body}")
    except Exception as e:
        logger.error(f"Cashfree verification failed: {str(e)}")
        raise RuntimeError(f"Could not verify Cashfree order: {str(e)}")

def get_order_payments(order_id: str) -> list[Dict[str, Any]]:
    """
    Fetches all payment attempts and transactions for a specific order.
    Official Cashfree Endpoint: GET /orders/{order_id}/payments
    """
    if not is_cashfree_configured():
        return [
            {
                "cf_payment_id": f"cf_pay_{int(time.time()*1000)}",
                "order_id": order_id,
                "payment_status": "SUCCESS",
                "payment_method": {"upi": {"channel": "intent"}},
                "payment_amount": 349.0,
                "payment_currency": "INR",
                "payment_completion_time": time.strftime("%Y-%m-%dT%H:%M:%S+05:30"),
                "is_simulated": True,
            }
        ]

    app_id = os.getenv("CASHFREE_APP_ID", "").strip()
    secret = os.getenv("CASHFREE_SECRET_KEY", "").strip()
    api_version = os.getenv("CASHFREE_API_VERSION", "2023-08-01").strip()
    base_url = get_cashfree_base_url()

    url = f"{base_url}/orders/{order_id}/payments"
    req = urllib.request.Request(
        url,
        headers={
            "x-client-id": app_id,
            "x-client-secret": secret,
            "x-api-version": api_version,
            "Accept": "application/json",
        },
        method="GET",
    )

    try:
        with urllib.request.urlopen(req, timeout=15) as response:
            res_body = response.read().decode("utf-8")
            return json.loads(res_body)
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8")
        logger.error(f"Cashfree get_order_payments HTTPError {e.code}: {err_body}")
        raise RuntimeError(f"Cashfree payments fetch error: {err_body}")
    except Exception as e:
        logger.error(f"Cashfree get_order_payments failed: {str(e)}")
        raise RuntimeError(f"Could not fetch Cashfree payments: {str(e)}")

def verify_cashfree_webhook_signature(raw_body: str, timestamp: str, signature: str) -> bool:
    """
    Cryptographically verifies the Cashfree Webhook signature using HMAC-SHA256.
    Formula: Base64(HMAC-SHA256(secret_key, timestamp + raw_body)) == signature
    """
    secret = os.getenv("CASHFREE_SECRET_KEY", "").strip()
    if not secret or not timestamp or not signature:
        return False
    
    try:
        import hmac
        import hashlib
        import base64
        signed_payload = f"{timestamp}{raw_body}"
        computed_hmac = hmac.new(
            secret.encode("utf-8"),
            signed_payload.encode("utf-8"),
            hashlib.sha256,
        )
        expected_sig = base64.b64encode(computed_hmac.digest()).decode("utf-8")
        return hmac.compare_digest(expected_sig, signature)
    except Exception as e:
        logger.error(f"Error verifying Cashfree webhook signature: {e}")
        return False

