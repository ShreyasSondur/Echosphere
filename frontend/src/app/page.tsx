"use client";

import { useEffect, useState, useCallback } from "react";
import ConcertCanvas3D from "@/components/ConcertCanvas3D";
import LoadingScreen from "@/components/LoadingScreen";
import BookingModal, { ConfirmedTicket } from "@/components/BookingModal";

interface TicketStats {
  total_sold: number;
  last_ticket_id: string;
  next_ticket_id: string;
  total_capacity: number;
  available_tickets: number;
}

const getApiUrl = () => {
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL.replace(/\/$/, "");
  }
  if (typeof window !== "undefined") {
    if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
      return "http://localhost:8002";
    }
    return "";
  }
  return "http://localhost:8002";
};

export default function Home() {
  const [apiUrl, setApiUrl] = useState<string>("http://localhost:8002");
  const [isLoading, setIsLoading] = useState(true);
  const [isVerifyingOrder, setIsVerifyingOrder] = useState(false);
  const [isBookingOpen, setIsBookingOpen] = useState(false);
  const [stats, setStats] = useState<TicketStats | null>(null);
  const [confirmedTickets, setConfirmedTickets] = useState<ConfirmedTicket[]>([]);

  useEffect(() => {
    setApiUrl(getApiUrl());
  }, []);

  // Concert Countdown: 2nd November 2026 at 5:30 PM IST
  const [timeLeft, setTimeLeft] = useState({
    days: 19,
    hours: 8,
    minutes: 58,
    seconds: 32,
  });

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`${apiUrl}/api/tickets/stats`, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch {
      // Graceful fallback
    }
  }, [apiUrl]);

  useEffect(() => {
    let isMounted = true;
    const load = async () => {
      try {
        const res = await fetch(`${apiUrl}/api/tickets/stats`, { cache: "no-store" });
        if (res.ok && isMounted) {
          const data = await res.json();
          setStats(data);
        }
      } catch {
        // Graceful fallback
      }
    };
    void load();
    const interval = setInterval(() => {
      void load();
    }, 6000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [apiUrl]);

  // Handle Return from Cashfree Hosted Payment Gateway
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const orderId = params.get("order_id");
    if (!orderId) return;

    // Clean address bar URL
    window.history.replaceState({}, document.title, window.location.pathname);

    const pendingStr = sessionStorage.getItem("echosphere_pending_order");
    let pending: { tier?: string; attendees?: { full_name: string; email: string; phone: string }[] } | null = null;
    if (pendingStr) {
      try {
        pending = JSON.parse(pendingStr);
      } catch {
        pending = null;
      }
    }

    setIsVerifyingOrder(true);
    const effectiveApiUrl = getApiUrl();

    fetch(`${effectiveApiUrl}/api/payment/cashfree/verify-order/${orderId}`, { method: "POST" })
      .then((res) => res.json())
      .then(async (verData) => {
        const orderData = verData?.data || {};
        const status = orderData?.order_status || orderData?.payment_status;
        if (status === "PAID" || status === "SUCCESS") {
          const cust = orderData?.customer_details || {};
          const fallbackAttendees = [
            {
              full_name: cust.customer_name || "EchoSphere Attendee",
              email: cust.customer_email || "attendee@srinivasuniversity.edu.in",
              phone: cust.customer_phone || "9876543210",
            },
          ];
          const attendees = pending?.attendees && pending.attendees.length > 0
            ? pending.attendees
            : fallbackAttendees;

          const bookRes = await fetch(`${effectiveApiUrl}/api/tickets/book`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              tier: pending?.tier || "Early Bird Ticket",
              payment_method: "cashfree",
              payment_token: orderId,
              order_id: orderId,
              attendees,
            }),
          });
          const bookData = await bookRes.json();
          if (bookRes.ok) {
            sessionStorage.removeItem("echosphere_pending_order");
            const list = bookData.tickets || (bookData.ticket ? [bookData.ticket] : []);
            setConfirmedTickets(list);
            setIsBookingOpen(true);
            fetchStats();
          }
        }
      })
      .catch((err) => console.error("Error verifying payment return:", err))
      .finally(() => setIsVerifyingOrder(false));
  }, [fetchStats]);

  // Live countdown timer calculation for Nov 2, 2026, 5:30 PM
  useEffect(() => {
    const targetDate = new Date("2026-11-02T17:30:00+05:30").getTime();

    const timer = setInterval(() => {
      const now = new Date().getTime();
      const difference = targetDate - now;

      if (difference > 0) {
        setTimeLeft({
          days: Math.floor(difference / (1000 * 60 * 60 * 24)),
          hours: Math.floor((difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
          minutes: Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60)),
          seconds: Math.floor((difference % (1000 * 60)) / 1000),
        });
      }
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  return (
    <>
      {/* 1. Futuristic Purple-Blue Loading Screen */}
      {isLoading && <LoadingScreen onComplete={() => setIsLoading(false)} />}

      {/* Verification notification banner after payment redirect */}
      {isVerifyingOrder && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-6 py-3 rounded-full bg-indigo-950/90 border border-indigo-500/50 shadow-2xl backdrop-blur-xl text-white text-xs sm:text-sm font-semibold animate-pulse">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
          <span>Payment received! Confirming your EchoSphere passes...</span>
        </div>
      )}

      {/* 2. Single Hero Section */}
      <main className="relative w-screen h-screen overflow-hidden bg-[#060714] text-white flex flex-col justify-between select-none">
        {/* Three.js 3D EchoSphere Stage Background */}
        <ConcertCanvas3D />

        {/* Ambient Purple-Blue Lighting Gradients */}
        <div className="absolute inset-0 bg-radial-gradient from-transparent via-[#060714]/30 to-[#060714]/85 pointer-events-none z-10" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[350px] bg-gradient-to-b from-purple-600/15 via-blue-600/10 to-transparent rounded-full blur-[140px] pointer-events-none z-10" />

        {/* Clean Top Navigation Bar: Corner-to-Corner */}
        <header className="relative z-20 w-full px-6 sm:px-10 md:px-14 py-6 flex items-center justify-between">
          {/* Left: Event & Collaboration Brand (Corner) */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-purple-500 via-indigo-500 to-blue-500 flex items-center justify-center font-black text-white text-base shadow-lg shadow-purple-500/25 tracking-wider border border-white/20">
              ES
            </div>
            <div>
              <span className="font-black text-base uppercase tracking-wider text-white">
                ECHOSPHERE
              </span>
              <span className="block text-[10px] font-mono tracking-widest text-purple-300">
                WEBFLOW × ROTARACT
              </span>
            </div>
          </div>

          {/* Top Right Corner: Book Now Action with pointer cursor */}
          <div>
            <button
              onClick={() => setIsBookingOpen(true)}
              className="cursor-pointer px-6 py-2.5 rounded-full bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-bold text-xs uppercase tracking-wider transition-all duration-300 shadow-lg shadow-indigo-500/25 hover:shadow-purple-500/40 hover:scale-105"
            >
              Book Now
            </button>
          </div>
        </header>

        {/* Hero Center Body */}
        <section className="relative z-20 flex-1 flex flex-col items-center justify-center text-center px-6 max-w-5xl mx-auto my-auto space-y-6">

          {/* Collaboration Badge */}
          <div className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-purple-950/40 border border-purple-500/30 backdrop-blur-xl text-[11px] sm:text-xs font-semibold uppercase tracking-widest text-purple-300 shadow-xl shadow-purple-950/30">
            <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
            <span>Webflow in collaboration with Rotaract presents</span>
          </div>

          {/* Grand Event Title: ECHOSPHERE */}
          <div className="space-y-3">
            <h1 className="text-6xl sm:text-8xl md:text-9xl font-black tracking-tighter text-white leading-none drop-shadow-[0_15px_35px_rgba(139,92,246,0.35)]">
              ECHO<span className="bg-gradient-to-r from-purple-400 via-indigo-300 to-blue-400 bg-clip-text text-transparent">SPHERE</span>
            </h1>

            {/* Artists Lineup */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-4 text-slate-200">
              <span className="text-lg sm:text-2xl font-black tracking-tight text-white">
                NAJRAN KABEER
              </span>
              <span className="text-xs font-mono font-bold text-purple-400 bg-purple-950/60 border border-purple-800/60 px-2.5 py-0.5 rounded-full">
                FEATURING
              </span>
              <span className="text-lg sm:text-2xl font-black tracking-tight text-blue-300">
                BENJI BEATS
              </span>
            </div>
          </div>

          {/* Venue & Date Details */}
          <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-5 text-xs sm:text-sm font-semibold text-slate-300 bg-white/[0.02] border border-white/[0.08] backdrop-blur-md px-6 py-2.5 rounded-2xl">
            <span className="flex items-center gap-1.5 text-blue-300">
              <span>📅</span> 2nd November 2026
            </span>
            <span className="text-white/20 hidden sm:inline">•</span>
            <span className="flex items-center gap-1.5 text-purple-300">
              <span>⏰</span> 5:30 PM IST
            </span>
            <span className="text-white/20 hidden sm:inline">•</span>
            <span className="flex items-center gap-1.5 text-indigo-300">
              <span>📍</span> Srinivas University Mukka (SUIET)
            </span>
          </div>

          {/* Clean "BOOK NOW" Button with cursor-pointer */}
          <div className="pt-2">
            <button
              onClick={() => setIsBookingOpen(true)}
              className="cursor-pointer group relative inline-flex items-center justify-center gap-3 px-12 py-5 rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-black text-xl sm:text-2xl uppercase tracking-wider transition-all duration-300 shadow-[0_0_50px_rgba(99,102,241,0.45)] hover:shadow-[0_0_70px_rgba(168,85,247,0.65)] hover:scale-105 active:scale-95"
            >
              <span>Book Now</span>
              <span className="transition-transform group-hover:translate-x-2 text-2xl font-bold leading-none">
                →
              </span>
            </button>
          </div>

          {/* Beautiful Live Countdown Timer */}
          <div className="pt-3 flex flex-col items-center space-y-2">
            <span className="text-[10px] font-mono uppercase tracking-widest text-slate-400">
              COUNTDOWN TO 2ND NOV • 5:30 PM
            </span>
            <div className="grid grid-cols-4 gap-2 sm:gap-3">
              <div className="flex flex-col items-center px-3 sm:px-4 py-2 rounded-xl bg-white/[0.03] border border-purple-500/20 backdrop-blur-md min-w-[64px] sm:min-w-[76px]">
                <span className="text-xl sm:text-2xl font-black font-mono text-white">
                  {timeLeft.days}
                </span>
                <span className="text-[9px] font-mono tracking-wider text-purple-300 uppercase">
                  Days
                </span>
              </div>
              <div className="flex flex-col items-center px-3 sm:px-4 py-2 rounded-xl bg-white/[0.03] border border-purple-500/20 backdrop-blur-md min-w-[64px] sm:min-w-[76px]">
                <span className="text-xl sm:text-2xl font-black font-mono text-white">
                  {String(timeLeft.hours).padStart(2, "0")}
                </span>
                <span className="text-[9px] font-mono tracking-wider text-purple-300 uppercase">
                  Hours
                </span>
              </div>
              <div className="flex flex-col items-center px-3 sm:px-4 py-2 rounded-xl bg-white/[0.03] border border-blue-500/20 backdrop-blur-md min-w-[64px] sm:min-w-[76px]">
                <span className="text-xl sm:text-2xl font-black font-mono text-white">
                  {String(timeLeft.minutes).padStart(2, "0")}
                </span>
                <span className="text-[9px] font-mono tracking-wider text-blue-300 uppercase">
                  Mins
                </span>
              </div>
              <div className="flex flex-col items-center px-3 sm:px-4 py-2 rounded-xl bg-white/[0.03] border border-blue-500/20 backdrop-blur-md min-w-[64px] sm:min-w-[76px]">
                <span className="text-xl sm:text-2xl font-black font-mono text-blue-400 animate-pulse">
                  {String(timeLeft.seconds).padStart(2, "0")}
                </span>
                <span className="text-[9px] font-mono tracking-wider text-blue-300 uppercase">
                  Secs
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Clean Official Footer: Corner-to-Corner with Maximum Space in Between */}
        <footer className="relative z-20 w-full px-6 sm:px-10 md:px-14 py-6 border-t border-white/[0.08] flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
            <span>Webflow Community in collaboration with Rotaract</span>
          </div>

          <div className="text-[11px] font-mono text-slate-400 text-center sm:text-right">
            Srinivas University Institute of Engineering &amp; Technology (SUIET), Mukka
          </div>
        </footer>

        {/* 3. Booking and Checkout Modal (Pass selection & details on the next step) */}
        <BookingModal
          isOpen={isBookingOpen}
          onClose={() => {
            setIsBookingOpen(false);
            setConfirmedTickets([]);
          }}
          stats={stats}
          confirmedTicketsList={confirmedTickets}
          onSuccess={() => {
            fetchStats();
          }}
          apiUrl={apiUrl}
        />
      </main>
    </>
  );
}
