"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import ConcertCanvas3D from "@/components/ConcertCanvas3D";
import LoadingScreen from "@/components/LoadingScreen";
import BookingModal, { ConfirmedTicket, PaymentFailureInfo } from "@/components/BookingModal";

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
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingStatusText, setLoadingStatusText] = useState("CALIBRATING 3D SOUNDSTAGE...");
  const [isVerifyingOrder, setIsVerifyingOrder] = useState(false);
  const [isBookingOpen, setIsBookingOpen] = useState(false);
  const [stats, setStats] = useState<TicketStats | null>(null);
  const [confirmedTickets, setConfirmedTickets] = useState<ConfirmedTicket[]>([]);
  const [paymentFailure, setPaymentFailure] = useState<PaymentFailureInfo | null>(null);

  // Background audio engine states
  const [currentTrack, setCurrentTrack] = useState<string>("/audio/pop_beat.mp3");
  const [currentTrackName, setCurrentTrackName] = useState<string>("Pop Concert Anthem");
  const [isMuted, setIsMuted] = useState(false);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    setApiUrl(getApiUrl());
  }, []);

  // -------------------------------------------------------------
  // Studio Pop Music & Concert Beat Controller
  // -------------------------------------------------------------
  useEffect(() => {
    const audio = new Audio(currentTrack);
    audio.loop = true;
    audio.volume = 0.38;
    audioRef.current = audio;

    const tryPlay = () => {
      audio
        .play()
        .then(() => {
          setIsAudioPlaying(true);
          setIsMuted(false);
        })
        .catch(() => {
          // Autoplay restricted until user touches/clicks
          setIsAudioPlaying(false);
        });
    };

    tryPlay();

    // Unlock on first pointerdown or keydown if browser blocked autoplay
    const unlockAudio = () => {
      if (audioRef.current && audioRef.current.paused) {
        audioRef.current
          .play()
          .then(() => {
            setIsAudioPlaying(true);
            setIsMuted(false);
          })
          .catch(() => {});
      }
    };

    window.addEventListener("pointerdown", unlockAudio, { once: true });
    window.addEventListener("keydown", unlockAudio, { once: true });

    return () => {
      window.removeEventListener("pointerdown", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
      audio.pause();
      audio.src = "";
    };
  }, [currentTrack]);

  const toggleAudio = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isMuted || audio.paused) {
      audio.muted = false;
      audio
        .play()
        .then(() => {
          setIsMuted(false);
          setIsAudioPlaying(true);
        })
        .catch(() => {});
    } else {
      audio.muted = true;
      setIsMuted(true);
      setIsAudioPlaying(false);
    }
  };

  const switchTrack = () => {
    if (currentTrack === "/audio/pop_beat.mp3") {
      setCurrentTrack("/audio/festival_beat.mp3");
      setCurrentTrackName("Festival EDM Beat");
    } else {
      setCurrentTrack("/audio/pop_beat.mp3");
      setCurrentTrackName("Pop Concert Anthem");
    }
  };

  // -------------------------------------------------------------
  // Live Synchronized 3D Stage Calibration Progress
  // -------------------------------------------------------------
  useEffect(() => {
    const statusSequence = [
      { at: 15, text: "INITIALIZING 3D ARENA STAGE RIG..." },
      { at: 35, text: "CALIBRATING POP BEATS & SUBWOOFERS..." },
      { at: 65, text: "POWERING CONCERT LASERS & HOLOGRAPHIC CORE..." },
      { at: 88, text: "NAJRAN KABEER × BENJAMIN SOLOMON LIVE..." },
      { at: 100, text: "SOUNDSTAGE ONLINE • WELCOME TO ECHOSPHERE" },
    ];

    const interval = setInterval(() => {
      setLoadingProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          return 100;
        }
        const step = prev < 30 ? 2.2 : prev < 75 ? 1.6 : 2.0;
        const next = Math.min(Math.round((prev + step) * 10) / 10, 100);
        const match = statusSequence.slice().reverse().find((s) => next >= s.at);
        if (match) setLoadingStatusText(match.text);
        return next;
      });
    }, 50);

    return () => clearInterval(interval);
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
        const status = orderData?.order_status || verData?.order_status || orderData?.payment_status;
        const isPaid = verData?.is_paid === true || status === "PAID" || status === "SUCCESS";

        if (isPaid) {
          const cust = orderData?.customer_details || {};
          const fallbackAttendees = [
            {
              full_name: cust.customer_name || "EchoSphere Attendee",
              email: cust.customer_email || "attendee@srinivasuniversity.edu.in",
              phone: cust.customer_phone || "9876543210",
            },
          ];
          const attendees =
            pending?.attendees && pending.attendees.length > 0
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
            setPaymentFailure(null);
            setIsBookingOpen(true);
            fetchStats();
          } else {
            sessionStorage.removeItem("echosphere_pending_order");
            setPaymentFailure({
              orderId,
              message: bookData.detail || "Could not confirm passes for this transaction.",
            });
            setConfirmedTickets([]);
            setIsBookingOpen(true);
          }
        } else {
          sessionStorage.removeItem("echosphere_pending_order");
          void fetch(`${effectiveApiUrl}/api/payment/cashfree/fail-order/${orderId}`, { method: "POST" });
          setPaymentFailure({
            orderId,
            message: "Payment could not be processed or was cancelled. No tickets were registered.",
          });
          setConfirmedTickets([]);
          setIsBookingOpen(true);
        }
      })
      .catch((err) => {
        console.error("Error verifying payment return:", err);
        sessionStorage.removeItem("echosphere_pending_order");
        setPaymentFailure({
          orderId,
          message: "Unable to verify transaction. Please contact event support if your bank was charged.",
        });
        setConfirmedTickets([]);
        setIsBookingOpen(true);
      })
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
      {/* 1. Synchronized Futuristic Loading Screen HUD Overlay */}
      {isLoading && (
        <LoadingScreen
          progress={loadingProgress}
          statusText={loadingStatusText}
          isAudioPlaying={isAudioPlaying}
          onToggleAudio={toggleAudio}
          currentTrackName={currentTrackName}
          onSwitchTrack={switchTrack}
          onComplete={() => setIsLoading(false)}
        />
      )}

      {/* Verification notification banner after payment redirect */}
      {isVerifyingOrder && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-6 py-3 rounded-full bg-indigo-950/90 border border-indigo-500/50 shadow-2xl backdrop-blur-xl text-white text-xs sm:text-sm font-semibold animate-pulse">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
          <span>Verifying transaction with Cashfree...</span>
        </div>
      )}

      {/* 2. Main Responsive Stage */}
      <main className="relative w-full min-h-[100dvh] bg-[#060714] text-white flex flex-col justify-between select-none overflow-x-hidden">
        {/* Single Synchronized Three.js 3D Concert Stage (Connects loading & hero smoothly) */}
        <div className="fixed inset-0 w-full h-full pointer-events-none select-none z-0 overflow-hidden">
          <ConcertCanvas3D isLoading={isLoading} loadingProgress={loadingProgress} />
        </div>

        {/* Ambient Purple-Blue Lighting Gradients */}
        <div className="fixed inset-0 bg-radial-gradient from-transparent via-[#060714]/30 to-[#060714]/85 pointer-events-none z-10" />
        <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[800px] h-[350px] bg-gradient-to-b from-purple-600/15 via-blue-600/10 to-transparent rounded-full blur-[140px] pointer-events-none z-10" />

        {/* Top Navigation Bar with Audio Controls */}
        <header
          className={`relative z-20 w-full px-3.5 sm:px-8 md:px-14 py-3 sm:py-5 flex items-center justify-between transition-all duration-1000 ${
            isLoading ? "opacity-0 pointer-events-none translate-y-2" : "opacity-100 pointer-events-auto translate-y-0"
          }`}
        >
          {/* Top Left Live Status Pill */}
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.04] border border-white/10 text-[10px] sm:text-[11px] font-mono tracking-wider text-purple-300 backdrop-blur-md">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping shrink-0" />
            <span className="font-semibold">ECHOSPHERE</span>
          </div>

          {/* Top Right Actions: Beat Switcher, Music Toggle & Book Now */}
          <div className="flex items-center gap-1.5 xs:gap-2 sm:gap-2.5">
            {/* Beat Track Selector Pill */}
            <button
              type="button"
              onClick={switchTrack}
              aria-label="Switch background pop beat"
              className="cursor-pointer inline-flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-full bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-[10px] sm:text-[11px] font-mono text-cyan-200 hover:text-cyan-100 transition-all backdrop-blur-xl"
              title={`Switch beat: currently ${currentTrackName}`}
            >
              <svg className="w-3 h-3 text-cyan-400 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path d="M18 3a1 1 0 00-1.196-.98l-10 2A1 1 0 006 5v9.114A4.369 4.369 0 005 14c-1.657 0-3 .895-3 2s1.343 2 3 2 3-.895 3-2V7.82l8-1.6v5.894A4.37 4.37 0 0015 12c-1.657 0-3 .895-3 2s1.343 2 3 2 3-.895 3-2V3z" />
              </svg>
              <span className="hidden md:inline">{currentTrackName}</span>
              <span className="text-[9px] text-slate-400">⇄</span>
            </button>

            {/* Top-Right Music Mute/Unmute Button */}
            <button
              type="button"
              onClick={toggleAudio}
              aria-label={isMuted ? "Unmute background music" : "Mute background music"}
              className="cursor-pointer inline-flex items-center gap-1.5 sm:gap-2 px-2.5 xs:px-3 sm:px-4 py-1.5 sm:py-2 rounded-full bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 text-white transition-all duration-300 shadow-lg shadow-indigo-500/10 backdrop-blur-xl"
              title={isMuted ? "Play Music" : "Mute Music"}
            >
              {!isMuted && isAudioPlaying ? (
                <>
                  <span className="flex items-end gap-0.5 h-3 sm:h-3.5">
                    <span className="w-0.5 h-full bg-gradient-to-t from-indigo-400 to-purple-400 rounded-full animate-pulse" />
                    <span className="w-0.5 h-3/5 bg-gradient-to-t from-blue-400 to-indigo-400 rounded-full animate-bounce" />
                    <span className="w-0.5 h-4/5 bg-gradient-to-t from-purple-400 to-pink-400 rounded-full animate-pulse" />
                    <span className="w-0.5 h-2/5 bg-gradient-to-t from-blue-400 to-purple-400 rounded-full animate-bounce" />
                  </span>
                  <span className="text-[10px] sm:text-[11px] font-mono font-semibold text-purple-200 hidden xs:inline">
                    ON
                  </span>
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                  </svg>
                  <span className="text-[10px] sm:text-[11px] font-mono font-medium text-slate-400 hidden xs:inline">
                    OFF
                  </span>
                </>
              )}
            </button>

            {/* Book Now Button */}
            <button
              onClick={() => {
                setPaymentFailure(null);
                setConfirmedTickets([]);
                setIsBookingOpen(true);
              }}
              className="cursor-pointer px-3.5 xs:px-4 sm:px-6 py-1.5 sm:py-2 rounded-full bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-bold text-[10px] xs:text-[11px] sm:text-xs uppercase tracking-wider transition-all duration-300 shadow-lg shadow-indigo-500/25 hover:shadow-purple-500/40 hover:scale-105"
            >
              Book Now
            </button>
          </div>
        </header>

        {/* Hero Center Body (Optimized for Mobile & Desktop) */}
        <section
          className={`relative z-20 flex-1 flex flex-col items-center justify-center text-center px-3.5 sm:px-6 max-w-5xl mx-auto my-auto py-3 sm:py-8 space-y-3.5 sm:space-y-6 w-full transition-all duration-1000 ${
            isLoading ? "opacity-0 pointer-events-none translate-y-3" : "opacity-100 pointer-events-auto translate-y-0"
          }`}
        >
          {/* Collaboration Badge */}
          <div className="inline-flex items-center gap-1.5 sm:gap-2 px-3 sm:px-5 py-1 sm:py-1.5 rounded-full bg-purple-950/40 border border-purple-500/30 backdrop-blur-xl text-[9px] sm:text-xs font-semibold uppercase tracking-widest text-purple-300 shadow-xl shadow-purple-950/30 max-w-full">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse shrink-0" />
            <span className="truncate">Webflow in collaboration with Rotaract presents</span>
          </div>

          {/* Grand Event Title: ECHOSPHERE */}
          <div className="space-y-1 sm:space-y-3 w-full">
            <h1 className="text-4xl xs:text-5xl sm:text-7xl md:text-8xl lg:text-9xl font-black tracking-tight sm:tracking-tighter text-white leading-[0.95] drop-shadow-[0_15px_35px_rgba(139,92,246,0.35)] break-words">
              ECHO<span className="bg-gradient-to-r from-purple-400 via-indigo-300 to-blue-400 bg-clip-text text-transparent">SPHERE</span>
            </h1>

            {/* Artists Lineup */}
            <div className="flex flex-wrap items-center justify-center gap-1.5 sm:gap-3 text-slate-200 pt-0.5 sm:pt-1">
              <span className="text-sm xs:text-base sm:text-2xl font-black tracking-tight text-white">
                NAJRAN KABEER
              </span>
              <span className="text-[9px] sm:text-xs font-mono font-bold text-purple-400 bg-purple-950/60 border border-purple-800/60 px-2 sm:px-2.5 py-0.5 rounded-full shrink-0">
                FEATURING
              </span>
              <span className="text-sm xs:text-base sm:text-2xl font-black tracking-tight text-blue-300">
                BENJAMIN SOLOMON
              </span>
            </div>
          </div>

          {/* Professional Event Details */}
          <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-4 text-[11px] sm:text-sm font-semibold text-slate-300 bg-white/[0.04] border border-white/[0.09] backdrop-blur-xl px-3.5 sm:px-6 py-2 sm:py-2.5 rounded-2xl shadow-lg shadow-purple-950/20 max-w-full">
            <div className="flex items-center gap-1.5 text-blue-300 shrink-0">
              <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span>2nd November 2026</span>
            </div>
            <span className="text-white/20 hidden xs:inline">•</span>
            <div className="flex items-center gap-1.5 text-purple-300 shrink-0">
              <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-purple-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>5:30 PM IST</span>
            </div>
            <span className="text-white/20 hidden sm:inline">•</span>
            <div className="flex items-center gap-1.5 text-indigo-300 shrink-0">
              <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-indigo-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span>Srinivas University Mukka</span>
            </div>
          </div>

          {/* Clean "BOOK NOW" Button */}
          <div className="pt-1 sm:pt-2 w-full flex justify-center">
            <button
              onClick={() => {
                setPaymentFailure(null);
                setConfirmedTickets([]);
                setIsBookingOpen(true);
              }}
              className="cursor-pointer group relative inline-flex items-center justify-center gap-2 sm:gap-3 w-full max-w-[280px] xs:max-w-xs sm:w-auto px-6 sm:px-12 py-3 sm:py-4.5 rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-black text-base xs:text-lg sm:text-2xl uppercase tracking-wider transition-all duration-300 shadow-[0_0_35px_rgba(99,102,241,0.45)] hover:shadow-[0_0_55px_rgba(168,85,247,0.65)] hover:scale-105 active:scale-95"
            >
              <span>Book Now</span>
              <span className="transition-transform group-hover:translate-x-1.5 text-lg sm:text-2xl font-bold leading-none">
                →
              </span>
            </button>
          </div>

          {/* Live Countdown Timer */}
          <div className="pt-1 flex flex-col items-center space-y-1.5 w-full">
            <span className="text-[9px] sm:text-[10px] font-mono uppercase tracking-widest text-slate-400">
              COUNTDOWN TO 2ND NOV • 5:30 PM
            </span>
            <div className="grid grid-cols-4 gap-1.5 xs:gap-2 sm:gap-3.5 w-full max-w-[300px] xs:max-w-xs sm:max-w-md">
              <div className="flex flex-col items-center px-1.5 sm:px-4 py-1.5 sm:py-2.5 rounded-xl bg-white/[0.03] border border-purple-500/20 backdrop-blur-md">
                <span className="text-lg xs:text-xl sm:text-3xl font-black font-mono text-white">
                  {timeLeft.days}
                </span>
                <span className="text-[8px] xs:text-[9px] sm:text-[10px] font-mono tracking-wider text-purple-300 uppercase">
                  Days
                </span>
              </div>
              <div className="flex flex-col items-center px-1.5 sm:px-4 py-1.5 sm:py-2.5 rounded-xl bg-white/[0.03] border border-purple-500/20 backdrop-blur-md">
                <span className="text-lg xs:text-xl sm:text-3xl font-black font-mono text-white">
                  {String(timeLeft.hours).padStart(2, "0")}
                </span>
                <span className="text-[8px] xs:text-[9px] sm:text-[10px] font-mono tracking-wider text-purple-300 uppercase">
                  Hours
                </span>
              </div>
              <div className="flex flex-col items-center px-1.5 sm:px-4 py-1.5 sm:py-2.5 rounded-xl bg-white/[0.03] border border-blue-500/20 backdrop-blur-md">
                <span className="text-lg xs:text-xl sm:text-3xl font-black font-mono text-white">
                  {String(timeLeft.minutes).padStart(2, "0")}
                </span>
                <span className="text-[8px] xs:text-[9px] sm:text-[10px] font-mono tracking-wider text-blue-300 uppercase">
                  Mins
                </span>
              </div>
              <div className="flex flex-col items-center px-1.5 sm:px-4 py-1.5 sm:py-2.5 rounded-xl bg-white/[0.03] border border-blue-500/20 backdrop-blur-md">
                <span className="text-lg xs:text-xl sm:text-3xl font-black font-mono text-blue-400 animate-pulse">
                  {String(timeLeft.seconds).padStart(2, "0")}
                </span>
                <span className="text-[8px] xs:text-[9px] sm:text-[10px] font-mono tracking-wider text-blue-300 uppercase">
                  Secs
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Official Responsive Footer */}
        <footer
          className={`relative z-20 w-full px-3.5 sm:px-8 md:px-14 py-3 sm:py-5 border-t border-white/[0.08] flex flex-col sm:flex-row items-center justify-between gap-2 text-[10px] sm:text-xs text-slate-400 transition-all duration-1000 ${
            isLoading ? "opacity-0 pointer-events-none translate-y-2" : "opacity-100 pointer-events-auto translate-y-0"
          }`}
        >
          <div className="flex items-center gap-1.5 text-center">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-400 shrink-0" />
            <span>Webflow Community in collaboration with Rotaract</span>
          </div>

          <div className="flex items-center gap-2.5 text-slate-500">
            <span>SUIET Mukka</span>
            <span>•</span>
            <span>Live 2nd November 2026</span>
          </div>
        </footer>

        {/* Booking and Checkout Modal */}
        <BookingModal
          isOpen={isBookingOpen}
          onClose={() => {
            setIsBookingOpen(false);
            setConfirmedTickets([]);
            setPaymentFailure(null);
          }}
          stats={stats}
          confirmedTicketsList={confirmedTickets}
          paymentFailure={paymentFailure}
          onRetryPayment={() => {
            setPaymentFailure(null);
          }}
          onSuccess={() => {
            fetchStats();
          }}
          apiUrl={apiUrl}
        />
      </main>
    </>
  );
}
