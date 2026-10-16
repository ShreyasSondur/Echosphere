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
  tier: string;
  amount: number;
  currency: string;
  payment_id: string;
  security_hash: string;
  created_at: string;
  email_status: string;
}

interface BookingModalProps {
  isOpen: boolean;
  onClose: () => void;
  stats?: TicketStats | null;
  onSuccess?: (tickets: ConfirmedTicket[]) => void;
  apiUrl: string;
  confirmedTicketsList?: ConfirmedTicket[];
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

const TICKET_PRICE = 349;
const ORIGINAL_PRICE = 499;
const CLAIMED_COUNT = 182;
const TOTAL_EARLY_BIRD = 200;
const SPOTS_LEFT = TOTAL_EARLY_BIRD - CLAIMED_COUNT; // 18 remaining

export default function BookingModal({
  isOpen,
  onClose,
  stats: _stats,
  onSuccess: _onSuccess,
  apiUrl,
  confirmedTicketsList,
}: BookingModalProps) {
  const [ticketCount, setTicketCount] = useState<number>(1);
  const [attendees, setAttendees] = useState<Attendee[]>([
    { fullName: "", email: "", phone: "" },
  ]);

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Confirmed tickets state
  const [confirmedTickets, setConfirmedTickets] = useState<ConfirmedTicket[]>([]);
  const [activeTicketView, setActiveTicketView] = useState<number>(0);

  // Sync if confirmed tickets are passed in
  useEffect(() => {
    if (confirmedTicketsList && confirmedTicketsList.length > 0) {
      setConfirmedTickets(confirmedTicketsList);
      confetti({
        particleCount: 140,
        spread: 80,
        origin: { y: 0.6 },
        colors: ["#6366f1", "#a855f7", "#3b82f6", "#10b981", "#fbbf24"],
      });
    }
  }, [confirmedTicketsList]);

  if (!isOpen) return null;

  const totalAmount = ticketCount * TICKET_PRICE;
  const totalOriginal = ticketCount * ORIGINAL_PRICE;
  const totalSavings = totalOriginal - totalAmount;

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
      const label = ticketCount === 1 ? "your" : `Ticket #${i + 1}`;

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

      // Store pending booking details in sessionStorage so passes are confirmed when Cashfree redirects back
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

      // Function for direct, reliable full-page re-navigation to the official Cashfree Payment Gateway
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

      // Try Cashfree JS SDK v3 with _self target (full page navigation, NOT a modal/popup)
      const CashfreeSDK = typeof window !== "undefined" ? window.Cashfree : undefined;
      if (CashfreeSDK) {
        try {
          const cashfree = CashfreeSDK({
            mode: isProduction ? "production" : "sandbox",
          });
          cashfree.checkout({
            paymentSessionId: orderData.payment_session_id,
            redirectTarget: "_self", // Directly navigates to Cashfree hosted checkout page
          });
          return;
        } catch (sdkErr) {
          console.warn("Cashfree SDK invocation error, using direct gateway redirect:", sdkErr);
        }
      }

      // Direct gateway redirect without any popup
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

  const selectedTicket = confirmedTickets[activeTicketView];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      {/* Dimmed backdrop */}
      <div
        className="fixed inset-0 bg-[#04060f]/80 backdrop-blur-md transition-opacity cursor-pointer"
        onClick={handleClose}
      />

      {/* Main Card */}
      <div className="relative w-full max-w-xl rounded-2xl bg-[#0d1021] border border-white/10 shadow-2xl text-slate-100 overflow-hidden z-10 animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.08] bg-[#0f142b]">
          <div>
            <h3 className="text-base font-bold text-white tracking-tight">
              {confirmedTickets.length > 0 ? "Tickets Confirmed" : "EchoSphere 2026 Passes"}
            </h3>
            <p className="text-xs text-slate-400">
              Najran Kabeer × Benji Beats • Srinivas University Mukka
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="cursor-pointer w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/[0.08] transition"
          >
            ✕
          </button>
        </div>

        {/* Body Content */}
        <div className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
          {confirmedTickets.length > 0 ? (
            /* ========================================================= */
            /* CONFIRMED TICKETS VIEW                                    */
            /* ========================================================= */
            <div className="space-y-5">
              <div className="text-center space-y-1">
                <span className="inline-block text-3xl">🎉</span>
                <h4 className="text-xl font-bold text-white">You&apos;re Going to EchoSphere!</h4>
                <p className="text-xs text-slate-400">
                  {confirmedTickets.length === 1
                    ? "Pass has been emailed to you."
                    : `${confirmedTickets.length} passes have been emailed to their respective holders.`}
                </p>
              </div>

              {/* Multi-ticket selector */}
              {confirmedTickets.length > 1 && (
                <div className="flex items-center gap-2 overflow-x-auto pb-1">
                  {confirmedTickets.map((t, idx) => (
                    <button
                      key={t.ticket_number}
                      type="button"
                      onClick={() => setActiveTicketView(idx)}
                      className={`cursor-pointer px-3 py-1.5 rounded-lg text-xs font-semibold transition whitespace-nowrap ${
                        activeTicketView === idx
                          ? "bg-indigo-600 text-white"
                          : "bg-white/[0.05] text-slate-400 hover:text-white"
                      }`}
                    >
                      Ticket #{t.ticket_number} ({t.full_name.split(" ")[0]})
                    </button>
                  ))}
                </div>
              )}

              {/* Ticket Card Preview */}
              {selectedTicket && (
                <div className="rounded-xl bg-[#131838] border border-indigo-500/30 p-5 space-y-4">
                  <div className="flex justify-between items-start border-b border-white/[0.08] pb-3">
                    <div>
                      <span className="text-[10px] font-mono uppercase tracking-widest text-indigo-400 font-bold">
                        OFFICIAL PASS
                      </span>
                      <h5 className="text-base font-bold text-white">ECHOSPHERE 2026</h5>
                      <span className="text-xs text-slate-400">2nd Nov, 5:30 PM • SUIET Mukka</span>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] uppercase text-slate-400 font-mono block">PASS ID</span>
                      <span className="text-2xl font-mono font-black text-indigo-300">
                        #{selectedTicket.ticket_number}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <span className="text-slate-400 block text-[11px]">Pass Holder</span>
                      <span className="font-semibold text-white">{selectedTicket.full_name}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[11px]">Pass Sent To</span>
                      <span className="font-semibold text-indigo-300 truncate block">
                        {selectedTicket.email}
                      </span>
                    </div>
                  </div>

                  {/* Clean Barcode */}
                  <div className="bg-white rounded-lg p-2.5 text-center">
                    <div className="text-base font-mono font-black tracking-[6px] text-slate-900">
                      |||| | |||| || ||| |||||
                    </div>
                    <span className="text-[10px] font-mono text-slate-600">
                      ES-{selectedTicket.ticket_number}-{selectedTicket.security_hash.slice(0, 8).toUpperCase()}
                    </span>
                  </div>
                </div>
              )}

              <div className="flex justify-center pt-2">
                <button
                  type="button"
                  onClick={handleClose}
                  className="cursor-pointer px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition"
                >
                  Done
                </button>
              </div>
            </div>
          ) : (
            /* ========================================================= */
            /* SIMPLE, INTUITIVE BOOKING FORM                            */
            /* ========================================================= */
            <form onSubmit={handlePayNowClick} className="space-y-6">
              
              {/* 1. Ticket Row */}
              <div className="rounded-xl bg-white/[0.03] border border-white/[0.08] p-4 flex items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white text-sm sm:text-base">
                      Early Bird Ticket
                    </span>
                    <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                      Save ₹150
                    </span>
                  </div>
                  
                  <div className="flex items-baseline gap-1.5 text-xs">
                    <span className="text-lg font-bold text-white">₹{TICKET_PRICE}</span>
                    <span className="line-through text-slate-500 text-xs">₹{ORIGINAL_PRICE}</span>
                    <span className="text-slate-400">• Arena Entry</span>
                  </div>

                  {/* Minimal, elegant marketing urgency */}
                  <div className="pt-1 flex items-center gap-2 text-[11px] text-amber-300">
                    <span>🔥 {CLAIMED_COUNT}/{TOTAL_EARLY_BIRD} booked</span>
                    <span className="text-slate-500">•</span>
                    <span className="text-slate-400">Only {SPOTS_LEFT} left at this price</span>
                  </div>
                </div>

                {/* Clean, Simple Stepper ONLY */}
                <div className="flex items-center bg-[#090b17] border border-white/15 rounded-lg p-1">
                  <button
                    type="button"
                    onClick={() => handleTicketCountChange(ticketCount - 1)}
                    disabled={ticketCount <= 1}
                    className="cursor-pointer w-8 h-8 rounded flex items-center justify-center text-slate-300 hover:text-white hover:bg-white/10 disabled:opacity-25 disabled:cursor-not-allowed text-base font-bold transition"
                  >
                    −
                  </button>
                  <span className="w-8 text-center font-mono font-bold text-sm text-white">
                    {ticketCount}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleTicketCountChange(ticketCount + 1)}
                    disabled={ticketCount >= 10}
                    className="cursor-pointer w-8 h-8 rounded flex items-center justify-center text-slate-300 hover:text-white hover:bg-white/10 disabled:opacity-25 disabled:cursor-not-allowed text-base font-bold transition"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* 2. Attendee Information */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                    {ticketCount === 1 ? "Attendee Information" : `Attendee Details (${ticketCount} Tickets)`}
                  </span>
                  <span className="text-[11px] text-slate-500">Pass sent via email</span>
                </div>

                {/* Vertical list of attendees */}
                <div className="space-y-4">
                  {attendees.map((attendee, index) => (
                    <div
                      key={index}
                      className="rounded-xl bg-white/[0.02] border border-white/[0.06] p-4 space-y-3"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                          <span className="w-4 h-4 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-[10px] font-bold">
                            {index + 1}
                          </span>
                          {index === 0
                            ? ticketCount === 1
                              ? "Your Details"
                              : "Ticket 1 (Primary Contact)"
                            : `Ticket ${index + 1} Attendee`}
                        </span>

                        {index > 0 && attendees[0]?.phone && (
                          <button
                            type="button"
                            onClick={() => copyPhoneFromPrimary(index)}
                            className="cursor-pointer text-[11px] text-indigo-400 hover:underline"
                          >
                            Use same phone
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
                            className={`w-full px-3.5 py-2.5 rounded-lg bg-[#080a18] border text-sm text-white placeholder:text-slate-500 focus:outline-none transition ${
                              fieldErrors[`${index}-fullName`]
                                ? "border-rose-500/70 focus:border-rose-500 bg-rose-500/[0.04]"
                                : "border-white/10 focus:border-indigo-400"
                            }`}
                          />
                          {fieldErrors[`${index}-fullName`] && (
                            <p className="mt-1 text-[11px] text-rose-400 font-medium flex items-center gap-1">
                              <span>⚠</span> {fieldErrors[`${index}-fullName`]}
                            </p>
                          )}
                        </div>

                        <div>
                          <input
                            type="email"
                            placeholder="Email Address (Pass sent here)"
                            value={attendee.email}
                            onChange={(e) => handleAttendeeChange(index, "email", e.target.value)}
                            className={`w-full px-3.5 py-2.5 rounded-lg bg-[#080a18] border text-sm text-white placeholder:text-slate-500 focus:outline-none transition ${
                              fieldErrors[`${index}-email`]
                                ? "border-rose-500/70 focus:border-rose-500 bg-rose-500/[0.04]"
                                : "border-white/10 focus:border-indigo-400"
                            }`}
                          />
                          {fieldErrors[`${index}-email`] && (
                            <p className="mt-1 text-[11px] text-rose-400 font-medium flex items-center gap-1">
                              <span>⚠</span> {fieldErrors[`${index}-email`]}
                            </p>
                          )}
                        </div>

                        <div>
                          <input
                            type="tel"
                            placeholder="Mobile Phone Number (10 digits)"
                            value={attendee.phone}
                            onChange={(e) => handleAttendeeChange(index, "phone", e.target.value)}
                            className={`w-full px-3.5 py-2.5 rounded-lg bg-[#080a18] border text-sm text-white placeholder:text-slate-500 focus:outline-none transition ${
                              fieldErrors[`${index}-phone`]
                                ? "border-rose-500/70 focus:border-rose-500 bg-rose-500/[0.04]"
                                : "border-white/10 focus:border-indigo-400"
                            }`}
                          />
                          {fieldErrors[`${index}-phone`] && (
                            <p className="mt-1 text-[11px] text-rose-400 font-medium flex items-center gap-1">
                              <span>⚠</span> {fieldErrors[`${index}-phone`]}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Error Message */}
              {errorMessage && (
                <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
                  {errorMessage}
                </div>
              )}

              {/* 3. Bottom Sticky Bar: Clean Total & Pay Now CTA */}
              <div className="pt-3 border-t border-white/[0.08] flex items-center justify-between">
                <div>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-xl font-bold text-white">₹{totalAmount}</span>
                    <span className="line-through text-slate-500 text-xs">₹{totalOriginal}</span>
                  </div>
                  <span className="text-[11px] text-emerald-400 block">
                    Saving ₹{totalSavings} on {ticketCount} {ticketCount === 1 ? "ticket" : "tickets"}
                  </span>
                </div>

                <div className="space-y-1 text-right">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="cursor-pointer px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs uppercase tracking-wider transition shadow-lg shadow-indigo-600/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                  >
                    {isSubmitting ? (
                      <>
                        <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Connecting Cashfree...
                      </>
                    ) : (
                      <>
                        Pay Now • ₹{totalAmount} →
                      </>
                    )}
                  </button>
                  <span className="block text-[10px] text-slate-400 font-medium">
                    🔒 Cashfree Gateway • UPI &amp; Cards
                  </span>
                </div>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
