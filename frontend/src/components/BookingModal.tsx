"use client";

import { useState, useEffect } from "react";
import confetti from "canvas-confetti";

interface TicketStats {
  total_sold: number;
  last_ticket_id: string;
  next_ticket_id: string;
  total_capacity: number;
  available_tickets: number;
}

export interface ConfirmedTicket {
  ticket_number: string;
  full_name: string;
  email: string;
  phone?: string;
  tier: string;
  amount: number;
  currency: string;
  payment_id: string;
  security_hash: string;
  created_at: string;
  email_status: string;
}

export interface PaymentFailureInfo {
  orderId?: string;
  message?: string;
  detail?: string;
}

interface BookingModalProps {
  isOpen: boolean;
  onClose: () => void;
  stats?: TicketStats | null;
  onSuccess?: (tickets: ConfirmedTicket[]) => void;
  apiUrl: string;
  confirmedTicketsList?: ConfirmedTicket[];
  paymentFailure?: PaymentFailureInfo | null;
  onRetryPayment?: () => void;
}

interface Attendee {
  fullName: string;
  email: string;
  phone: string;
}

declare global {
  interface Window {
    Cashfree?: (config: { mode: "sandbox" | "production" }) => {
      checkout: (options: {
        paymentSessionId: string;
        redirectTarget?: "_modal" | "_self" | "_blank";
      }) => Promise<{ error?: { message: string }; paymentDetails?: unknown }>;
    };
  }
}

export interface TierSettings {
  tier_name: string;
  price: number;
  original_price: number;
  claimed_count: number;
  total_count: number;
  spots_left: number;
  badge_text?: string;
  savings?: number;
}

const DEFAULT_TIER_SETTINGS: TierSettings = {
  tier_name: "Early Bird Ticket",
  price: 349,
  original_price: 499,
  claimed_count: 182,
  total_count: 200,
  spots_left: 18,
  badge_text: "Early Bird Ticket",
  savings: 150,
};

export default function BookingModal({
  isOpen,
  onClose,
  stats: _stats,
  onSuccess: _onSuccess,
  apiUrl,
  confirmedTicketsList,
  paymentFailure,
  onRetryPayment,
}: BookingModalProps) {
  const [ticketCount, setTicketCount] = useState<number>(1);
  const [attendees, setAttendees] = useState<Attendee[]>([
    { fullName: "", email: "", phone: "" },
  ]);

  const [tierSettings, setTierSettings] = useState<TierSettings>(DEFAULT_TIER_SETTINGS);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Confirmed tickets state
  const [confirmedTickets, setConfirmedTickets] = useState<ConfirmedTicket[]>([]);
  const [activeTicketView, setActiveTicketView] = useState<number>(0);

  // Fetch live pricing & scarcity from backend whenever modal opens
  useEffect(() => {
    if (!isOpen) return;
    const fetchTierSettings = async () => {
      try {
        const effectiveApiUrl =
          apiUrl ||
          (typeof window !== "undefined" &&
          (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
            ? "http://localhost:8002"
            : "");
        const res = await fetch(
          `${effectiveApiUrl}/api/tickets/tier-settings?tier_name=Early+Bird+Ticket`,
          { cache: "no-store" }
        );
        if (res.ok) {
          const data: TierSettings = await res.json();
          if (data && data.price) {
            setTierSettings(data);
          }
        }
      } catch (err) {
        console.warn("Could not fetch dynamic tier settings, using defaults:", err);
      }
    };
    void fetchTierSettings();
  }, [isOpen, apiUrl]);

  // Sync if confirmed tickets are passed in
  useEffect(() => {
    if (confirmedTicketsList && confirmedTicketsList.length > 0) {
      setConfirmedTickets(confirmedTicketsList);
      try {
        confetti({
          particleCount: 140,
          spread: 80,
          origin: { y: 0.6 },
          colors: ["#6366f1", "#a855f7", "#3b82f6", "#10b981", "#fbbf24"],
        });
      } catch {
        // Confetti fallback
      }
    }
  }, [confirmedTicketsList]);

  if (!isOpen) return null;

  const currentPrice = tierSettings.price || 349;
  const currentOriginalPrice = tierSettings.original_price || 499;
  const totalAmount = ticketCount * currentPrice;
  const totalOriginal = ticketCount * currentOriginalPrice;
  const totalSavings = Math.max(0, totalOriginal - totalAmount);
  const perTicketSavings = Math.max(0, currentOriginalPrice - currentPrice);

  const handleTicketCountChange = (newCount: number) => {
    const valid = Math.min(10, Math.max(1, newCount));
    setTicketCount(valid);
    setAttendees((prev) => {
      const updated = [...prev];
      if (valid > prev.length) {
        for (let i = prev.length; i < valid; i++) {
          updated.push({ fullName: "", email: "", phone: "" });
        }
      } else if (valid < prev.length) {
        return updated.slice(0, valid);
      }
      return updated;
    });
    setFieldErrors({});
  };

  const handleAttendeeChange = (index: number, field: keyof Attendee, val: string) => {
    setAttendees((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: val };
      return copy;
    });
    setFieldErrors((prev) => {
      if (!prev[`${index}-${field}`]) return prev;
      const next = { ...prev };
      delete next[`${index}-${field}`];
      return next;
    });
  };

  const copyPhoneFromPrimary = (index: number) => {
    if (attendees[0]?.phone) {
      handleAttendeeChange(index, "phone", attendees[0].phone);
    }
  };

  const isValidName = (name: string): boolean => {
    const clean = name.trim();
    if (clean.length < 2 || clean.length > 70) return false;
    return /^[a-zA-Z\s.'-]+$/.test(clean);
  };

  const isValidEmail = (email: string): boolean => {
    const clean = email.trim().toLowerCase();
    return /^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$/.test(clean) && clean.includes(".");
  };

  const isValidPhone = (phone: string): boolean => {
    const digitsOnly = phone.replace(/\D/g, "");
    if (digitsOnly.length === 10 && /^[6-9]\d{9}$/.test(digitsOnly)) {
      return true;
    }
    if (digitsOnly.length === 12 && digitsOnly.startsWith("91") && /^[6-9]/.test(digitsOnly.slice(2))) {
      return true;
    }
    if (digitsOnly.length === 11 && digitsOnly.startsWith("0") && /^[6-9]/.test(digitsOnly.slice(1))) {
      return true;
    }
    return digitsOnly.length >= 10 && digitsOnly.length <= 15;
  };

  const validateAttendees = (): { isValid: boolean; firstError: string | null; errors: Record<string, string> } => {
    const errors: Record<string, string> = {};
    let firstError: string | null = null;

    for (let i = 0; i < attendees.length; i++) {
      const a = attendees[i];
      const label = ticketCount === 1 ? "your details" : `Ticket #${i + 1}`;

      // Full Name Validation
      if (!a.fullName.trim()) {
        errors[`${i}-fullName`] = "Full name is required";
        if (!firstError) firstError = `Please enter full name for ${label}.`;
      } else if (!isValidName(a.fullName)) {
        errors[`${i}-fullName`] = "Enter letters only (min 2 characters)";
        if (!firstError) firstError = `Please enter a valid full name for ${label} (letters only).`;
      }

      // Email Validation
      if (!a.email.trim()) {
        errors[`${i}-email`] = "Email address is required";
        if (!firstError) firstError = `Please enter an email address for ${label}.`;
      } else if (!isValidEmail(a.email)) {
        errors[`${i}-email`] = "Enter a valid email address (e.g. name@example.com)";
        if (!firstError) firstError = `Please enter a valid email address for ${label}.`;
      }

      // Phone Validation
      if (!a.phone.trim()) {
        errors[`${i}-phone`] = "Mobile phone number is required";
        if (!firstError) firstError = `Please enter a phone number for ${label}.`;
      } else if (!isValidPhone(a.phone)) {
        errors[`${i}-phone`] = "Enter a valid 10-digit mobile number";
        if (!firstError) firstError = `Please enter a valid 10-digit mobile number for ${label}.`;
      }
    }

    return {
      isValid: Object.keys(errors).length === 0,
      firstError,
      errors,
    };
  };

  const handlePayNowClick = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const validationResult = validateAttendees();
    if (!validationResult.isValid) {
      setFieldErrors(validationResult.errors);
      setErrorMessage(validationResult.firstError || "Please check the highlighted details.");
      return;
    }

    setFieldErrors({});
    setIsSubmitting(true);

    try {
      const primary = attendees[0];
      const returnUrl =
        typeof window !== "undefined"
          ? `${window.location.origin}/?order_id={order_id}`
          : "https://echosphere.suiet.website/?order_id={order_id}";

      const res = await fetch(`${apiUrl}/api/payment/cashfree/create-order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: totalAmount,
          customer_name: primary.fullName.trim(),
          customer_email: primary.email.trim(),
          customer_phone: primary.phone.trim(),
          ticket_count: ticketCount,
          tier: "Early Bird Ticket",
          attendees: attendees.map((a) => ({
            full_name: a.fullName.trim(),
            email: a.email.trim(),
            phone: a.phone.trim(),
          })),
          return_url: returnUrl,
        }),
      });

      const orderData = await res.json();
      if (!res.ok) {
        throw new Error(orderData.detail || "Payment gateway initialization failed.");
      }

      if (!orderData.payment_session_id) {
        throw new Error("No payment session returned from Cashfree.");
      }

      // Store pending booking details in sessionStorage
      if (typeof window !== "undefined") {
        sessionStorage.setItem(
          "echosphere_pending_order",
          JSON.stringify({
            order_id: orderData.order_id,
            tier: "Early Bird Ticket",
            attendees: attendees.map((a) => ({
              full_name: a.fullName.trim(),
              email: a.email.trim(),
              phone: a.phone.trim(),
            })),
          })
        );
      }

      const isProduction = orderData.mode === "production";

      // Redirect directly to Cashfree Payment Gateway
      const redirectToCashfree = () => {
        const checkoutEndpoint = isProduction
          ? "https://api.cashfree.com/pg/view/sessions/checkout"
          : "https://sandbox.cashfree.com/pg/view/sessions/checkout";

        const form = document.createElement("form");
        form.method = "POST";
        form.action = checkoutEndpoint;
        form.target = "_self";
        form.style.display = "none";

        const input = document.createElement("input");
        input.type = "hidden";
        input.name = "payment_session_id";
        input.value = orderData.payment_session_id;

        form.appendChild(input);
        document.body.appendChild(form);
        form.submit();
      };

      // Try Cashfree JS SDK v3 with _self target
      const CashfreeSDK = typeof window !== "undefined" ? window.Cashfree : undefined;
      if (CashfreeSDK) {
        try {
          const cashfree = CashfreeSDK({
            mode: isProduction ? "production" : "sandbox",
          });
          cashfree.checkout({
            paymentSessionId: orderData.payment_session_id,
            redirectTarget: "_self",
          });
          return;
        } catch (sdkErr) {
          console.warn("Cashfree SDK invocation error, using direct gateway redirect:", sdkErr);
        }
      }

      redirectToCashfree();
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : "Error connecting to Cashfree payment gateway."
      );
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setConfirmedTickets([]);
    setFieldErrors({});
    setErrorMessage(null);
    onClose();
  };

  const selectedTicket = confirmedTickets[activeTicketView] || confirmedTickets[0];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-[#04060f]/85 backdrop-blur-md transition-opacity cursor-pointer"
        onClick={handleClose}
      />

      {/* Main Modal Card */}
      <div className="relative w-full max-w-lg md:max-w-xl max-h-[92dvh] sm:max-h-[88vh] flex flex-col rounded-2xl bg-[#0b0e21] border border-white/10 shadow-[0_20px_60px_rgba(0,0,0,0.85)] text-slate-100 overflow-hidden z-10 animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between px-5 sm:px-6 py-3.5 sm:py-4 border-b border-white/[0.08] bg-[#0e122b]">
          <div>
            <h3 className="text-sm sm:text-base font-bold text-white tracking-tight">
              {paymentFailure
                ? "Payment Status"
                : confirmedTickets.length > 0
                ? "Booking Confirmation"
                : "EchoSphere 2026 Passes"}
            </h3>
            <p className="text-[11px] sm:text-xs text-slate-400">
              Najran Kabeer × Benjamin Solomon • Srinivas University Mukka
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close dialog"
            className="cursor-pointer w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/[0.08] transition"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Scrollable Body Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 overscroll-contain">
          {paymentFailure ? (
            /* ========================================================= */
            /* PAYMENT FAILED VIEW                                       */
            /* ========================================================= */
            <div className="space-y-5 text-center py-2">
              <div className="w-16 h-16 mx-auto rounded-full bg-rose-500/10 border border-rose-500/30 flex items-center justify-center shadow-lg shadow-rose-500/10">
                <svg className="w-8 h-8 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>

              <div className="space-y-1">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/10 border border-rose-500/25 text-rose-400 text-xs font-semibold uppercase tracking-wider">
                  <span className="w-2 h-2 rounded-full bg-rose-400" />
                  <span>Payment Unsuccessful</span>
                </div>
                <h4 className="text-xl sm:text-2xl font-black text-white pt-1">
                  Transaction Not Completed
                </h4>
                <p className="text-xs text-slate-400 max-w-md mx-auto">
                  {paymentFailure.message || "Your payment could not be processed or was cancelled. No money was deducted from your account."}
                </p>
              </div>

              {/* Status details card */}
              <div className="rounded-xl bg-white/[0.02] border border-rose-500/20 p-4 text-left space-y-2.5 text-xs">
                <div className="flex justify-between items-center text-slate-400">
                  <span>Booking Status</span>
                  <span className="text-rose-400 font-semibold uppercase font-mono">Not Registered</span>
                </div>
                {paymentFailure.orderId && (
                  <div className="flex justify-between items-center text-slate-400">
                    <span>Reference ID</span>
                    <span className="font-mono text-slate-300">{paymentFailure.orderId}</span>
                  </div>
                )}
                <div className="pt-2 border-t border-white/[0.06] text-[11px] text-slate-400 leading-relaxed">
                  No tickets have been issued or reserved in the database. You may safely retry checkout or contact support if amount was debited.
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    if (onRetryPayment) {
                      onRetryPayment();
                    } else {
                      handleClose();
                    }
                  }}
                  className="cursor-pointer w-full sm:w-auto px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs uppercase tracking-wider transition shadow-lg shadow-indigo-600/30"
                >
                  Try Again
                </button>
                <button
                  type="button"
                  onClick={handleClose}
                  className="cursor-pointer w-full sm:w-auto px-5 py-2.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-slate-300 hover:text-white font-medium text-xs transition border border-white/10"
                >
                  Close
                </button>
              </div>
            </div>
          ) : confirmedTickets.length > 0 ? (
            /* ========================================================= */
            /* PAYMENT SUCCESSFUL & CONFIRMED TICKETS (NO BARCODE)      */
            /* ========================================================= */
            <div className="space-y-5">
              {/* Payment Success Banner */}
              <div className="text-center space-y-2">
                <div className="w-14 h-14 mx-auto rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                  <svg className="w-7 h-7 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div>
                  <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 text-[11px] font-bold uppercase tracking-wider mb-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    <span>Payment Successful</span>
                  </div>
                  <h4 className="text-xl sm:text-2xl font-black text-white">
                    You&apos;re Going to EchoSphere!
                  </h4>
                  <p className="text-xs text-slate-300">
                    {confirmedTickets.length === 1
                      ? "Your official pass has been confirmed and emailed to you."
                      : `All ${confirmedTickets.length} passes have been confirmed and dispatched via email.`}
                  </p>
                </div>
              </div>

              {/* Multi-ticket selector if multiple passes were booked */}
              {confirmedTickets.length > 1 && (
                <div className="flex items-center gap-2 overflow-x-auto pb-1">
                  {confirmedTickets.map((t, idx) => (
                    <button
                      key={t.ticket_number}
                      type="button"
                      onClick={() => setActiveTicketView(idx)}
                      className={`cursor-pointer px-3 py-1.5 rounded-lg text-xs font-semibold transition whitespace-nowrap ${
                        activeTicketView === idx
                          ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                          : "bg-white/[0.05] text-slate-400 hover:text-white border border-white/[0.08]"
                      }`}
                    >
                      Pass #{t.ticket_number} ({t.full_name.split(" ")[0]})
                    </button>
                  ))}
                </div>
              )}

              {/* Official Ticket Card Preview (Clean, VIP, NO BARCODE) */}
              {selectedTicket && (
                <div className="relative rounded-2xl bg-gradient-to-b from-[#131738] to-[#0c0f24] border border-indigo-500/30 p-5 sm:p-6 space-y-4 shadow-xl">
                  {/* Card Header */}
                  <div className="flex justify-between items-start border-b border-white/[0.08] pb-3.5">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono uppercase tracking-widest text-indigo-400 font-bold">
                          OFFICIAL ENTRY PASS
                        </span>
                        <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[10px] font-bold uppercase">
                          Confirmed
                        </span>
                      </div>
                      <h5 className="text-lg font-black text-white pt-0.5">ECHOSPHERE 2026</h5>
                      <span className="text-xs text-slate-400">Najran Kabeer × Benjamin Solomon</span>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] uppercase text-slate-400 font-mono block">PASS ID</span>
                      <span className="text-2xl sm:text-3xl font-mono font-black text-indigo-300">
                        #{selectedTicket.ticket_number}
                      </span>
                    </div>
                  </div>

                  {/* Pass Details Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div className="space-y-0.5">
                      <span className="text-slate-400 text-[11px] block">Pass Holder</span>
                      <span className="font-bold text-white text-sm">{selectedTicket.full_name}</span>
                    </div>
                    <div className="space-y-0.5">
                      <span className="text-slate-400 text-[11px] block">Dispatched To</span>
                      <span className="font-semibold text-indigo-300 truncate block">
                        {selectedTicket.email}
                      </span>
                    </div>
                    <div className="space-y-0.5">
                      <span className="text-slate-400 text-[11px] block">Date &amp; Time</span>
                      <span className="font-semibold text-slate-200">2nd November 2026 • 5:30 PM IST</span>
                    </div>
                    <div className="space-y-0.5">
                      <span className="text-slate-400 text-[11px] block">Venue</span>
                      <span className="font-semibold text-slate-200">Srinivas University Mukka (SUIET)</span>
                    </div>
                  </div>

                  {/* Transaction & Security Footer */}
                  <div className="pt-3 border-t border-white/[0.08] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] font-mono text-slate-400">
                    <div>
                      <span>Tier: </span>
                      <span className="text-white font-semibold">{selectedTicket.tier}</span>
                      <span> • ₹{selectedTicket.amount}</span>
                    </div>
                    <div className="truncate max-w-full sm:max-w-[220px]">
                      <span>Ref: </span>
                      <span className="text-slate-300">{selectedTicket.payment_id}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Success Action Buttons */}
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    if (typeof window !== "undefined") window.print();
                  }}
                  className="cursor-pointer w-full sm:w-auto px-5 py-2.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-slate-200 hover:text-white font-semibold text-xs transition border border-white/10 flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                  </svg>
                  <span>Print Pass</span>
                </button>
                <button
                  type="button"
                  onClick={handleClose}
                  className="cursor-pointer w-full sm:w-auto px-7 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs uppercase tracking-wider transition shadow-lg shadow-indigo-600/30"
                >
                  Done
                </button>
              </div>
            </div>
          ) : (
            /* ========================================================= */
            /* CLEAN, INTUITIVE BOOKING FORM                             */
            /* ========================================================= */
            <form onSubmit={handlePayNowClick} className="space-y-5">
              
              {/* 1. Ticket Selection Card */}
              <div className="rounded-xl bg-white/[0.03] border border-white/[0.08] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white text-sm sm:text-base">
                      {tierSettings.badge_text || tierSettings.tier_name || "Early Bird Ticket"}
                    </span>
                    {perTicketSavings > 0 && (
                      <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                        Save ₹{perTicketSavings}
                      </span>
                    )}
                  </div>
                  
                  <div className="flex items-baseline gap-1.5 text-xs">
                    <span className="text-lg font-bold text-white">₹{currentPrice}</span>
                    {currentOriginalPrice > currentPrice && (
                      <span className="line-through text-slate-500 text-xs">₹{currentOriginalPrice}</span>
                    )}
                    <span className="text-slate-400">• Arena Access</span>
                  </div>

                  {/* Clean Scarcity Indicator (No emojis) */}
                  <div className="pt-1 flex items-center gap-2 text-[11px] text-indigo-300">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                    <span>{tierSettings.claimed_count}/{tierSettings.total_count} Booked</span>
                    <span className="text-slate-600">•</span>
                    <span className="text-slate-400">
                      {tierSettings.spots_left > 0 ? `Only ${tierSettings.spots_left} left at this rate` : "Tier selling fast"}
                    </span>
                  </div>
                </div>

                {/* Touch-Friendly Stepper */}
                <div className="flex items-center self-start sm:self-center bg-[#090b17] border border-white/15 rounded-xl p-1">
                  <button
                    type="button"
                    onClick={() => handleTicketCountChange(ticketCount - 1)}
                    disabled={ticketCount <= 1}
                    aria-label="Decrease passes"
                    className="cursor-pointer w-9 h-9 rounded-lg flex items-center justify-center text-slate-300 hover:text-white hover:bg-white/10 disabled:opacity-25 disabled:cursor-not-allowed text-lg font-bold transition"
                  >
                    −
                  </button>
                  <span className="w-10 text-center font-mono font-bold text-sm text-white">
                    {ticketCount}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleTicketCountChange(ticketCount + 1)}
                    disabled={ticketCount >= 10}
                    aria-label="Increase passes"
                    className="cursor-pointer w-9 h-9 rounded-lg flex items-center justify-center text-slate-300 hover:text-white hover:bg-white/10 disabled:opacity-25 disabled:cursor-not-allowed text-lg font-bold transition"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* 2. Attendee Details Form */}
              <div className="space-y-3.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                    {ticketCount === 1 ? "Attendee Information" : `Attendee Details (${ticketCount} Passes)`}
                  </span>
                  <span className="text-[11px] text-slate-500">Official Pass sent via Email</span>
                </div>

                {/* Attendee inputs */}
                <div className="space-y-3.5">
                  {attendees.map((attendee, index) => (
                    <div
                      key={index}
                      className="rounded-xl bg-white/[0.02] border border-white/[0.06] p-3.5 sm:p-4 space-y-3"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                          <span className="w-4 h-4 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-[10px] font-bold">
                            {index + 1}
                          </span>
                          {index === 0
                            ? ticketCount === 1
                              ? "Primary Contact"
                              : "Pass 1 (Primary Contact)"
                            : `Pass ${index + 1} Attendee`}
                        </span>

                        {index > 0 && attendees[0]?.phone && (
                          <button
                            type="button"
                            onClick={() => copyPhoneFromPrimary(index)}
                            className="cursor-pointer text-[11px] text-indigo-400 hover:text-indigo-300 transition"
                          >
                            Copy phone from primary
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="sm:col-span-2">
                          <input
                            type="text"
                            placeholder="Full Name"
                            value={attendee.fullName}
                            onChange={(e) => handleAttendeeChange(index, "fullName", e.target.value)}
                            className={`w-full min-h-[44px] px-3.5 py-2.5 rounded-lg bg-[#080a18] border text-sm text-white placeholder:text-slate-500 focus:outline-none transition ${
                              fieldErrors[`${index}-fullName`]
                                ? "border-rose-500/70 focus:border-rose-500 bg-rose-500/[0.04]"
                                : "border-white/10 focus:border-indigo-400"
                            }`}
                          />
                          {fieldErrors[`${index}-fullName`] && (
                            <p className="mt-1 text-[11px] text-rose-400 font-medium flex items-center gap-1.5">
                              <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                              </svg>
                              <span>{fieldErrors[`${index}-fullName`]}</span>
                            </p>
                          )}
                        </div>

                        <div>
                          <input
                            type="email"
                            placeholder="Email Address"
                            value={attendee.email}
                            onChange={(e) => handleAttendeeChange(index, "email", e.target.value)}
                            className={`w-full min-h-[44px] px-3.5 py-2.5 rounded-lg bg-[#080a18] border text-sm text-white placeholder:text-slate-500 focus:outline-none transition ${
                              fieldErrors[`${index}-email`]
                                ? "border-rose-500/70 focus:border-rose-500 bg-rose-500/[0.04]"
                                : "border-white/10 focus:border-indigo-400"
                            }`}
                          />
                          {fieldErrors[`${index}-email`] && (
                            <p className="mt-1 text-[11px] text-rose-400 font-medium flex items-center gap-1.5">
                              <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                              </svg>
                              <span>{fieldErrors[`${index}-email`]}</span>
                            </p>
                          )}
                        </div>

                        <div>
                          <input
                            type="tel"
                            placeholder="Mobile Phone (10 digits)"
                            value={attendee.phone}
                            onChange={(e) => handleAttendeeChange(index, "phone", e.target.value)}
                            className={`w-full min-h-[44px] px-3.5 py-2.5 rounded-lg bg-[#080a18] border text-sm text-white placeholder:text-slate-500 focus:outline-none transition ${
                              fieldErrors[`${index}-phone`]
                                ? "border-rose-500/70 focus:border-rose-500 bg-rose-500/[0.04]"
                                : "border-white/10 focus:border-indigo-400"
                            }`}
                          />
                          {fieldErrors[`${index}-phone`] && (
                            <p className="mt-1 text-[11px] text-rose-400 font-medium flex items-center gap-1.5">
                              <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                              </svg>
                              <span>{fieldErrors[`${index}-phone`]}</span>
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Error Message Alert */}
              {errorMessage && (
                <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                  <svg className="w-4 h-4 shrink-0 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* 3. Bottom Sticky Bar: Total & CTA */}
              <div className="pt-3 border-t border-white/[0.08] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-xl font-black text-white">₹{totalAmount}</span>
                    {totalOriginal > totalAmount && (
                      <span className="line-through text-slate-500 text-xs">₹{totalOriginal}</span>
                    )}
                  </div>
                  <span className="text-[11px] text-emerald-400 block font-medium">
                    Saving ₹{totalSavings} on {ticketCount} {ticketCount === 1 ? "pass" : "passes"}
                  </span>
                </div>

                <div className="space-y-1 sm:text-right">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="cursor-pointer w-full sm:w-auto px-6 py-3 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-bold text-xs uppercase tracking-wider transition shadow-lg shadow-indigo-600/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {isSubmitting ? (
                      <>
                        <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>Connecting to Gateway...</span>
                      </>
                    ) : (
                      <>
                        <span>Pay Now • ₹{totalAmount}</span>
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                        </svg>
                      </>
                    )}
                  </button>
                  <div className="flex items-center justify-center sm:justify-end gap-1.5 text-[10px] text-slate-400 pt-0.5">
                    <svg className="w-3 h-3 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                    <span>Cashfree Gateway • UPI, Cards &amp; NetBanking</span>
                  </div>
                </div>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
