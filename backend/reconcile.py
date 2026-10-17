#!/usr/bin/env python3
"""
EchoSphere 2026 - Cashfree Order Reconciliation CLI Script
Target: Query all pending orders against Cashfree, fulfill any paid orders,
issue tickets, dispatch confirmation emails, and update SQLite DB.
"""
from __future__ import annotations

import sys
import os
from pathlib import Path

# Force UTF-8 stdout if available
if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

# Ensure backend directory is in sys.path
backend_dir = Path(__file__).resolve().parent
sys.path.insert(0, str(backend_dir))

from dotenv import load_dotenv
load_dotenv(backend_dir / ".env")
load_dotenv()

from database import init_db, get_ticket_stats
from main import run_reconciliation

def main():
    print("=" * 65)
    print(" [EchoSphere 2026] Cashfree Payment Reconciliation")
    print("=" * 65)
    init_db()
    
    before_stats = get_ticket_stats()
    print(f"📊 Current Tickets Sold: {before_stats['total_sold']}")
    print(f"💰 Current Revenue: ₹{before_stats['total_revenue']}")
    print("-" * 65)
    print("🔍 Inspecting unfulfilled orders against Cashfree Production API...")
    
    res = run_reconciliation(background_tasks=None)
    
    print("-" * 65)
    print(f"Unfulfilled Orders Checked: {res.get('total_unfulfilled_checked', 0)}")
    print(f"Successfully Reconciled:   {res.get('reconciled_count', 0)}")
    print(f"Marked Failed/Dropped:     {res.get('marked_failed_count', 0)}")
    
    if res.get("reconciled_orders"):
        print("\n🎉 Recovered Passes:")
        for r in res["reconciled_orders"]:
            passes_str = ", ".join(f"#{t}" for t in r.get("tickets", []))
            print(f"  • Order {r['order_id']}: {r['customer_name']} ({r['customer_email']}) - ₹{r['amount']} -> {passes_str}")
            
    if res.get("errors"):
        print("\n⚠️ Warnings/Errors:")
        for e in res["errors"]:
            print(f"  • {e['order_id']}: {e['error']}")
            
    after_stats = res.get("updated_stats", before_stats)
    print("=" * 65)
    print(f"✅ Final Tickets Sold: {after_stats['total_sold']} (was {before_stats['total_sold']})")
    print(f"✅ Final Revenue:      ₹{after_stats['total_revenue']} (was ₹{before_stats['total_revenue']})")
    print("=" * 65)

if __name__ == "__main__":
    main()
