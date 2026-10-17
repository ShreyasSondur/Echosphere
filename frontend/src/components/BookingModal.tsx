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

// Official Dynamic KonfHub Widget URL with full multi-ticket quantity selection (1 to 10 passes)
// and per-ticket individual attendee details!
const KONFHUB_WIDGET_URL = "https://konfhub.com/widget/echosphere-20";
const KONFHUB_EVENT_URL = "https://konfhub.com/echosphere-20";

export default function BookingModal({
  isOpen,
  onClose,
  stats: _stats,
  onSuccess: _onSuccess,
  apiUrl: _apiUrl,
  confirmedTicketsList,
  paymentFailure,
  onRetryPayment,
}: BookingModalProps) {
  const [isIframeLoaded, setIsIframeLoaded] = useState(false);
  const [confirmedTickets, setConfirmedTickets] = useState<ConfirmedTicket[]>([]);
  const [activeTicketView, setActiveTicketView] = useState<number>(0);

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

  // Reset iframe loading state when modal opens
  useEffect(() => {
    if (isOpen) {
      setIsIframeLoaded(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleClose = () => {
    setConfirmedTickets([]);
    onClose();
  };

  const selectedTicket = confirmedTickets[activeTicketView] || confirmedTickets[0];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-5 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-[#04060f]/85 backdrop-blur-md transition-opacity cursor-pointer"
        onClick={handleClose}
      />

      {/* Main Modal Card */}
      <div className="relative w-full max-w-xl md:max-w-2xl max-h-[94dvh] flex flex-col rounded-2xl bg-[#0b0e21] border border-white/10 shadow-[0_20px_60px_rgba(0,0,0,0.85)] text-slate-100 overflow-hidden z-10 animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between px-4 sm:px-6 py-3.5 sm:py-4 border-b border-white/[0.08] bg-[#0e122b]">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm sm:text-base font-bold text-white tracking-tight">
                {paymentFailure
                  ? "Payment Status"
                  : confirmedTickets.length > 0
                  ? "Booking Confirmation"
                  : "EchoSphere 2026 Passes"}
              </h3>
              {!paymentFailure && confirmedTickets.length === 0 && (
                <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 text-[10px] font-semibold">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Live Gateway
                </span>
              )}
            </div>
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
        <div className="flex-1 overflow-y-auto p-3.5 sm:p-5 space-y-3.5 overscroll-contain">
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
            /* PAYMENT SUCCESSFUL & CONFIRMED TICKETS                    */
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

              {/* Official Ticket Card Preview */}
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
            /* DYNAMIC MULTI-TICKET OFFICIAL CHECKOUT WIDGET            */
            /* ========================================================= */
            <div className="space-y-3">
              
              {/* Event & Pricing Quick Info Bar */}
              <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2 rounded-xl bg-white/[0.03] border border-white/[0.08] text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-white">Early Bird Pass</span>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[11px] font-bold">
                    ₹349 each
                  </span>
                  <span className="text-slate-400 hidden xs:inline">• Arena Access</span>
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                  <svg className="w-3.5 h-3.5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                  <span>Select 1 to 10 passes below • Instant QR Pass per Attendee</span>
                </div>
              </div>

              {/* Dynamic KonfHub Widget Iframe: Supports multi-ticket selection & per-ticket details */}
              <div className="relative w-full rounded-xl overflow-hidden bg-white shadow-[0_4px_25px_rgba(0,0,0,0.5)] min-h-[560px]">
                {!isIframeLoaded && (
                  <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-[#090b17] text-center p-6 space-y-3">
                    <div className="w-10 h-10 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                    <div className="space-y-1">
                      <p className="text-sm font-bold text-white tracking-wide">
                        Loading Ticket Gateway...
                      </p>
                      <p className="text-xs text-slate-400">
                        Connecting securely to KonfHub Gateway
                      </p>
                    </div>
                  </div>
                )}

                <iframe
                  src={KONFHUB_WIDGET_URL}
                  id="konfhub-widget"
                  title="Register for EchoSphere 2.0"
                  width="100%"
                  height="580"
                  allow="payment; camera; microphone; clipboard-write; fullscreen"
                  className="w-full border-0 block"
                  style={{
                    minHeight: "560px",
                    height: "580px",
                    background: "#ffffff",
                    border: "none",
                  }}
                  onLoad={() => setIsIframeLoaded(true)}
                />
              </div>

              {/* Trust Footer & Direct Fallback Link */}
              <div className="pt-1 flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-slate-400">
                <div className="flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5 text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  <span>256-Bit SSL Encrypted • KonfHub Live Gateway (UPI, Cards, NetBanking)</span>
                </div>

                <a
                  href={KONFHUB_EVENT_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-indigo-400 hover:text-indigo-300 transition underline underline-offset-2 flex items-center gap-1"
                >
                  <span>Open in full window</span>
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
