"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import confetti from "canvas-confetti";

interface TicketItem {
  id: number;
  ticket_number: string;
  full_name: string;
  email: string;
  phone: string;
  tier: string;
  amount: number;
  currency: string;
  payment_id: string;
  email_sent: boolean | number;
  checked_in: boolean | number;
  checked_in_at: string | null;
  created_at: string;
}

interface StatsData {
  total_sold: number;
  last_ticket_id: string;
  next_ticket_id: string;
  total_capacity: number;
  available_tickets: number;
  checked_in_count: number;
  pending_checkin_count: number;
  total_revenue: number;
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

export default function AdminGatePage() {
  const [apiUrl, setApiUrl] = useState("");

  // Auth flow states: "password" | "otp" | "dashboard"
  const [authStep, setAuthStep] = useState<"password" | "otp" | "dashboard">("password");
  const [passwordInput, setPasswordInput] = useState("");
  const [otpInput, setOtpInput] = useState("");
  const [adminToken, setAdminToken] = useState<string | null>(null);
  const [maskedEmail, setMaskedEmail] = useState<string>("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [isSubmittingAuth, setIsSubmittingAuth] = useState(false);

  // Dashboard states
  const [tickets, setTickets] = useState<TicketItem[]>([]);
  const [stats, setStats] = useState<StatsData | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterTab, setFilterTab] = useState<"all" | "pending" | "checked_in">("all");
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Collision alert modal state
  const [collisionAlert, setCollisionAlert] = useState<{
    ticketNumber: string;
    fullName: string;
    checkedInAt: string;
  } | null>(null);

  // Spot entry / Add person modal state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addForm, setAddForm] = useState({
    fullName: "",
    email: "",
    phone: "",
    tier: "Spot Entry Pass",
    amount: "349",
    sendEmail: true,
  });
  const [isSubmittingAdd, setIsSubmittingAdd] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  // Initialize API url and check existing token in sessionStorage
  useEffect(() => {
    const url = getApiUrl();
    setApiUrl(url);

    if (typeof window !== "undefined") {
      const stored = sessionStorage.getItem("echosphere_admin_token");
      if (stored) {
        setAdminToken(stored);
        setAuthStep("dashboard");
      }
    }
  }, []);

  // Fetch tickets and stats
  const fetchDashboardData = useCallback(async (token: string, silent = false) => {
    if (!token) return;
    if (!silent) setIsRefreshing(true);
    try {
      const effectiveApiUrl = getApiUrl();
      const res = await fetch(`${effectiveApiUrl}/api/admin/tickets`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });

      if (res.status === 401) {
        sessionStorage.removeItem("echosphere_admin_token");
        setAdminToken(null);
        setAuthStep("password");
        setAuthError("Session expired. Please log in again.");
        return;
      }

      if (res.ok) {
        const data = await res.json();
        setTickets(data.tickets || []);
        setStats(data.stats || null);
      }
    } catch (err) {
      console.error("Dashboard fetch error:", err);
    } finally {
      if (!silent) setIsRefreshing(false);
    }
  }, []);

  // Initial fetch and auto-polling every 4 seconds for multi-volunteer live sync
  useEffect(() => {
    if (authStep === "dashboard" && adminToken) {
      void fetchDashboardData(adminToken);
      const interval = setInterval(() => {
        void fetchDashboardData(adminToken, true);
      }, 4000);
      return () => clearInterval(interval);
    }
  }, [authStep, adminToken, fetchDashboardData]);

  // Handle Step 1: Submit Password
  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setIsSubmittingAuth(true);

    try {
      const effectiveApiUrl = getApiUrl();
      const res = await fetch(`${effectiveApiUrl}/api/admin/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: passwordInput.trim() }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Authentication failed.");
      }

      setMaskedEmail(data.masked_email || "admin email");
      setAuthStep("otp");
    } catch (err: unknown) {
      setAuthError(err instanceof Error ? err.message : "Password verification failed.");
    } finally {
      setIsSubmittingAuth(false);
    }
  };

  // Handle Step 2: Submit 6-digit OTP
  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setIsSubmittingAuth(true);

    try {
      const effectiveApiUrl = getApiUrl();
      const res = await fetch(`${effectiveApiUrl}/api/admin/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ otp: otpInput.trim() }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Invalid verification code.");
      }

      const token = data.token;
      sessionStorage.setItem("echosphere_admin_token", token);
      setAdminToken(token);
      setAuthStep("dashboard");
    } catch (err: unknown) {
      setAuthError(err instanceof Error ? err.message : "2FA verification failed.");
    } finally {
      setIsSubmittingAuth(false);
    }
  };

  // Handle Gate Check-in (Tick Button) with Collision Protection
  const handleCheckin = async (ticketNumber: string) => {
    if (!adminToken) return;

    try {
      const effectiveApiUrl = getApiUrl();
      const res = await fetch(`${effectiveApiUrl}/api/admin/checkin`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ ticket_number: ticketNumber }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.detail || "Check-in failed.");
        return;
      }

      // Check for collision / already admitted
      if (data.already_checked_in) {
        setCollisionAlert({
          ticketNumber: data.ticket?.ticket_number || ticketNumber,
          fullName: data.ticket?.full_name || "Attendee",
          checkedInAt: data.checked_in_at || "Earlier",
        });
        return;
      }

      if (data.success) {
        confetti({
          particleCount: 50,
          spread: 60,
          origin: { y: 0.8 },
          colors: ["#10b981", "#3b82f6", "#6366f1"],
        });

        // Update local list instantly
        setTickets((prev) =>
          prev.map((t) =>
            t.ticket_number === ticketNumber
              ? { ...t, checked_in: 1, checked_in_at: data.checked_in_at }
              : t
          )
        );

        if (stats) {
          setStats({
            ...stats,
            checked_in_count: stats.checked_in_count + 1,
            pending_checkin_count: Math.max(0, stats.pending_checkin_count - 1),
          });
        }
      }
    } catch (err) {
      console.error("Checkin error:", err);
    }
  };

  // Handle Undo Check-in (for accidental clicks)
  const handleUndoCheckin = async (ticketNumber: string) => {
    if (!adminToken) return;
    if (!confirm(`Are you sure you want to revert check-in for Pass #${ticketNumber}?`)) return;

    try {
      const effectiveApiUrl = getApiUrl();
      const res = await fetch(`${effectiveApiUrl}/api/admin/checkin`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ ticket_number: ticketNumber, undo: true }),
      });

      if (res.ok) {
        setTickets((prev) =>
          prev.map((t) =>
            t.ticket_number === ticketNumber
              ? { ...t, checked_in: 0, checked_in_at: null }
              : t
          )
        );
        if (stats) {
          setStats({
            ...stats,
            checked_in_count: Math.max(0, stats.checked_in_count - 1),
            pending_checkin_count: stats.pending_checkin_count + 1,
          });
        }
      }
    } catch (err) {
      console.error("Undo error:", err);
    }
  };

  // Handle Add Person / Offline Spot Ticket Creation
  const handleAddPersonSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError(null);
    setIsSubmittingAdd(true);

    try {
      const effectiveApiUrl = getApiUrl();
      const numAmount = parseFloat(addForm.amount);
      if (isNaN(numAmount) || numAmount < 0) {
        throw new Error("Please enter a valid amount (e.g. 349).");
      }

      const res = await fetch(`${effectiveApiUrl}/api/admin/tickets/create`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          full_name: addForm.fullName.trim(),
          email: addForm.email.trim(),
          phone: addForm.phone.trim(),
          tier: addForm.tier.trim(),
          amount: numAmount,
          send_email: addForm.sendEmail,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Failed to create spot ticket.");
      }

      setIsAddModalOpen(false);
      setAddForm({
        fullName: "",
        email: "",
        phone: "",
        tier: "Spot Entry Pass",
        amount: "349",
        sendEmail: true,
      });

      setSuccessBanner(`Created Pass #${data.ticket.ticket_number} for ${data.ticket.full_name}!`);
      setTimeout(() => setSuccessBanner(null), 5000);

      // Refresh list
      if (adminToken) {
        void fetchDashboardData(adminToken);
      }
    } catch (err: unknown) {
      setAddError(err instanceof Error ? err.message : "Failed to add person.");
    } finally {
      setIsSubmittingAdd(false);
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem("echosphere_admin_token");
    setAdminToken(null);
    setAuthStep("password");
    setPasswordInput("");
    setOtpInput("");
  };

  // Filter and search computation
  const filteredTickets = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return tickets.filter((t) => {
      // Tab filter
      const isChecked = Boolean(t.checked_in);
      if (filterTab === "checked_in" && !isChecked) return false;
      if (filterTab === "pending" && isChecked) return false;

      // Query filter
      if (!q) return true;
      return (
        t.ticket_number.toLowerCase().includes(q) ||
        t.full_name.toLowerCase().includes(q) ||
        t.email.toLowerCase().includes(q) ||
        t.phone.toLowerCase().includes(q) ||
        t.payment_id.toLowerCase().includes(q)
      );
    });
  }, [tickets, searchQuery, filterTab]);

  return (
    <div className="min-h-screen bg-[#050716] text-slate-100 flex flex-col font-sans select-none">
      
      {/* ========================================================================= */}
      {/* 1. AUTHENTICATION SCREENS (Password -> 2FA OTP)                           */}
      {/* ========================================================================= */}
      {authStep !== "dashboard" && (
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="relative w-full max-w-md rounded-2xl bg-[#0b0f26]/90 border border-purple-500/30 p-8 shadow-2xl backdrop-blur-2xl space-y-6">
            <div className="text-center space-y-2">
              <div className="w-12 h-12 mx-auto rounded-2xl bg-gradient-to-tr from-purple-600 via-indigo-600 to-blue-500 flex items-center justify-center font-black text-white text-lg shadow-lg shadow-purple-500/30 border border-white/20">
                ES
              </div>
              <h2 className="text-xl font-bold tracking-tight text-white">
                EchoSphere Gate Command
              </h2>
              <p className="text-xs text-slate-400">
                Srinivas University Mukka • Official 2FA Entry Gate
              </p>
            </div>

            {authError && (
              <div className="p-3 rounded-xl bg-red-950/50 border border-red-500/40 text-red-200 text-xs text-center font-medium animate-shake">
                {authError}
              </div>
            )}

            {authStep === "password" ? (
              <form onSubmit={handlePasswordSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">
                    Administrator Master Passkey
                  </label>
                  <input
                    type="password"
                    autoFocus
                    placeholder="Enter security password"
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-white/[0.04] border border-white/10 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-indigo-500 transition"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmittingAuth || !passwordInput}
                  className="cursor-pointer w-full py-3.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 font-bold text-sm text-white shadow-lg shadow-indigo-600/30 transition disabled:opacity-50"
                >
                  {isSubmittingAuth ? "Verifying..." : "Authenticate & Request 2FA Code →"}
                </button>
              </form>
            ) : (
              <form onSubmit={handleOtpSubmit} className="space-y-4">
                <div className="p-3 rounded-xl bg-indigo-950/40 border border-indigo-500/30 text-xs text-indigo-200 text-center space-y-1">
                  <span>6-Digit 2FA Code Dispatched</span>
                  <p className="font-mono font-bold text-white">{maskedEmail}</p>
                </div>

                <div className="space-y-1.5 text-center">
                  <label className="text-xs font-semibold text-slate-300 block">
                    Enter 6-Digit Passkey
                  </label>
                  <input
                    type="text"
                    maxLength={6}
                    autoFocus
                    placeholder="• • • • • •"
                    value={otpInput}
                    onChange={(e) => setOtpInput(e.target.value.replace(/\D/g, ""))}
                    className="w-full px-4 py-3 text-center tracking-[12px] font-mono text-2xl font-black rounded-xl bg-white/[0.04] border border-white/10 text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmittingAuth || otpInput.length < 6}
                  className="cursor-pointer w-full py-3.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 font-bold text-sm text-white shadow-lg shadow-emerald-600/30 transition disabled:opacity-50"
                >
                  {isSubmittingAuth ? "Checking Code..." : "Verify & Enter Command Panel ✓"}
                </button>

                <div className="text-center pt-1">
                  <button
                    type="button"
                    onClick={() => setAuthStep("password")}
                    className="cursor-pointer text-xs text-slate-400 hover:text-white transition"
                  >
                    ← Back to Password
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. ADMIN COMMAND DASHBOARD                                                */}
      {/* ========================================================================= */}
      {authStep === "dashboard" && (
        <div className="flex-1 flex flex-col max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-6">
          
          {/* Top Bar */}
          <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-white/[0.08] pb-5">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
                <span className="text-[10px] font-mono font-bold tracking-widest text-emerald-400 uppercase">
                  LIVE GATE SYNC ACTIVE (AUTO-REFRESH 4S)
                </span>
              </div>
              <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
                EchoSphere Gate Control
                <span className="text-xs px-2 py-0.5 rounded-md bg-purple-950/70 text-purple-300 font-mono font-bold border border-purple-500/30">
                  /lol
                </span>
              </h1>
              <p className="text-xs text-slate-400">
                Srinivas University Mukka • Volunteer & Gate Security Panel
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={() => setIsAddModalOpen(true)}
                className="cursor-pointer px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-indigo-600/30 transition"
              >
                <span>➕</span>
                <span>Spot Entry / Add Person</span>
              </button>

              <button
                type="button"
                onClick={() => adminToken && void fetchDashboardData(adminToken)}
                disabled={isRefreshing}
                className="cursor-pointer px-3.5 py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-slate-300 font-semibold text-xs border border-white/10 transition"
              >
                {isRefreshing ? "Syncing..." : "🔄 Refresh"}
              </button>

              <button
                type="button"
                onClick={handleLogout}
                className="cursor-pointer px-3.5 py-2.5 rounded-xl bg-red-950/30 hover:bg-red-900/50 text-red-300 border border-red-500/30 font-semibold text-xs transition"
              >
                Logout
              </button>
            </div>
          </header>

          {/* Success Banner */}
          {successBanner && (
            <div className="p-3.5 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-200 text-xs font-semibold flex items-center justify-between animate-in fade-in">
              <span>{successBanner}</span>
              <button
                type="button"
                onClick={() => setSuccessBanner(null)}
                className="text-emerald-400 font-bold"
              >
                ✕
              </button>
            </div>
          )}

          {/* Stats Bar */}
          <section className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
            <div className="rounded-2xl bg-white/[0.02] border border-white/[0.08] p-4 space-y-1">
              <span className="text-[10px] uppercase font-mono tracking-wider text-slate-400">
                Total Passes Sold
              </span>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl sm:text-3xl font-black font-mono text-white">
                  {stats?.total_sold ?? tickets.length}
                </span>
                <span className="text-xs text-slate-500 font-mono">/ 2000 max</span>
              </div>
            </div>

            <div className="rounded-2xl bg-emerald-950/20 border border-emerald-500/30 p-4 space-y-1">
              <span className="text-[10px] uppercase font-mono tracking-wider text-emerald-300">
                Checked In at Gate
              </span>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl sm:text-3xl font-black font-mono text-emerald-400">
                  {stats?.checked_in_count ?? tickets.filter((t) => t.checked_in).length}
                </span>
                <span className="text-xs text-emerald-500 font-mono">admitted</span>
              </div>
            </div>

            <div className="rounded-2xl bg-amber-950/20 border border-amber-500/30 p-4 space-y-1">
              <span className="text-[10px] uppercase font-mono tracking-wider text-amber-300">
                Pending Entry
              </span>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl sm:text-3xl font-black font-mono text-amber-400">
                  {stats?.pending_checkin_count ?? tickets.filter((t) => !t.checked_in).length}
                </span>
                <span className="text-xs text-amber-500 font-mono">outside gate</span>
              </div>
            </div>

            <div className="rounded-2xl bg-purple-950/20 border border-purple-500/30 p-4 space-y-1">
              <span className="text-[10px] uppercase font-mono tracking-wider text-purple-300">
                Total Revenue
              </span>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl sm:text-3xl font-black font-mono text-purple-300">
                  ₹{stats?.total_revenue?.toLocaleString("en-IN") ?? "0"}
                </span>
                <span className="text-xs text-purple-500 font-mono">INR</span>
              </div>
            </div>
          </section>

          {/* Search Bar & Filter Tabs */}
          <section className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-lg">
              <input
                type="text"
                placeholder="Search ticket # (e.g. 0001), name, email, or phone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-4 py-3 pl-10 rounded-xl bg-white/[0.04] border border-white/10 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-indigo-500 transition"
              />
              <span className="absolute left-3.5 top-3.5 text-slate-500">🔍</span>
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-3 text-slate-400 hover:text-white"
                >
                  ✕
                </button>
              )}
            </div>

            <div className="flex items-center gap-1.5 bg-white/[0.03] border border-white/[0.08] p-1 rounded-xl text-xs font-semibold">
              <button
                type="button"
                onClick={() => setFilterTab("all")}
                className={`cursor-pointer px-3 py-1.5 rounded-lg transition ${
                  filterTab === "all"
                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                All ({tickets.length})
              </button>
              <button
                type="button"
                onClick={() => setFilterTab("pending")}
                className={`cursor-pointer px-3 py-1.5 rounded-lg transition ${
                  filterTab === "pending"
                    ? "bg-amber-600 text-white shadow-md shadow-amber-600/30"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Pending ({tickets.filter((t) => !t.checked_in).length})
              </button>
              <button
                type="button"
                onClick={() => setFilterTab("checked_in")}
                className={`cursor-pointer px-3 py-1.5 rounded-lg transition ${
                  filterTab === "checked_in"
                    ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/30"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Admitted ({tickets.filter((t) => t.checked_in).length})
              </button>
            </div>
          </section>

          {/* Tickets List View */}
          <section className="space-y-3">
            {filteredTickets.length === 0 ? (
              <div className="text-center py-16 rounded-2xl bg-white/[0.02] border border-white/[0.08] space-y-2">
                <span className="text-3xl block">🎟️</span>
                <p className="text-sm font-semibold text-slate-300">No tickets found</p>
                <p className="text-xs text-slate-500">
                  {searchQuery ? "Try a different search query." : "No attendees in this category."}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {filteredTickets.map((t) => {
                  const isChecked = Boolean(t.checked_in);
                  const isHighNum = parseInt(t.ticket_number, 10) > 2000;

                  return (
                    <div
                      key={t.ticket_number}
                      className={`relative rounded-2xl p-4 border transition-all ${
                        isHighNum
                          ? "bg-red-950/30 border-red-500/50"
                          : isChecked
                          ? "bg-emerald-950/15 border-emerald-500/30"
                          : "bg-[#0b0e22] border-white/[0.08] hover:border-white/20"
                      }`}
                    >
                      {/* Top Header: ID & Status */}
                      <div className="flex items-start justify-between gap-2 border-b border-white/[0.06] pb-3">
                        <div>
                          <span className="text-[10px] font-mono tracking-wider text-slate-400 uppercase block">
                            Pass Number
                          </span>
                          <span className="text-2xl font-mono font-black text-indigo-300 tracking-tight">
                            #{t.ticket_number}
                          </span>
                        </div>

                        <div>
                          {isHighNum ? (
                            <span className="px-2.5 py-1 rounded-full bg-red-900/60 border border-red-500 text-red-200 text-[10px] font-mono font-bold uppercase">
                              REJECT (&gt;2000)
                            </span>
                          ) : isChecked ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-950/80 border border-emerald-500/50 text-emerald-300 text-[10px] font-bold uppercase tracking-wider">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                              ADMITTED
                            </span>
                          ) : (
                            <span className="px-2.5 py-1 rounded-full bg-amber-950/60 border border-amber-500/30 text-amber-300 text-[10px] font-bold uppercase tracking-wider">
                              PENDING
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Attendee Details */}
                      <div className="py-3 space-y-1.5 text-xs">
                        <div className="font-bold text-white text-sm truncate">
                          {t.full_name}
                        </div>
                        <div className="text-slate-400 truncate flex items-center gap-1.5">
                          <span>📧</span> {t.email}
                        </div>
                        <div className="text-slate-400 truncate flex items-center gap-1.5">
                          <span>📞</span> {t.phone}
                        </div>
                        <div className="flex items-center justify-between pt-1 border-t border-white/[0.04]">
                          <span className="text-[11px] font-mono text-purple-300 bg-purple-950/40 px-2 py-0.5 rounded-md border border-purple-500/20">
                            {t.tier}
                          </span>
                          <span className="font-mono font-bold text-slate-200">
                            ₹{t.amount} INR
                          </span>
                        </div>
                        {t.checked_in_at && (
                          <div className="text-[10px] font-mono text-emerald-400">
                            Admitted at: {new Date(t.checked_in_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        )}
                      </div>

                      {/* Action: TICK Button */}
                      <div className="pt-2 flex items-center gap-2">
                        {isChecked ? (
                          <div className="flex-1 flex items-center justify-between gap-2">
                            <span className="text-xs text-emerald-400 font-semibold flex items-center gap-1">
                              ✓ Gate Entry Confirmed
                            </span>
                            <button
                              type="button"
                              onClick={() => handleUndoCheckin(t.ticket_number)}
                              className="cursor-pointer text-[10px] text-slate-400 hover:text-red-300 underline"
                            >
                              Undo
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleCheckin(t.ticket_number)}
                            disabled={isHighNum}
                            className="cursor-pointer flex-1 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-500 hover:from-emerald-500 hover:to-teal-400 text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/30 active:scale-95 transition disabled:opacity-30"
                          >
                            <span className="text-base leading-none">✓</span>
                            <span>TICK (ADMIT ENTRY)</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* ========================================================================= */}
          {/* 3. COLLISION ALERT MODAL                                                  */}
          {/* ========================================================================= */}
          {collisionAlert && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-100">
              <div className="w-full max-w-md rounded-2xl bg-[#1e0a12] border-2 border-red-500 p-6 space-y-5 text-center shadow-2xl">
                <div className="w-16 h-16 mx-auto rounded-full bg-red-600/20 border border-red-500 flex items-center justify-center text-3xl animate-bounce">
                  ⚠️
                </div>

                <div className="space-y-2">
                  <h3 className="text-xl font-black text-red-200 tracking-tight uppercase">
                    COLLISION ALERT: ALREADY ADMITTED!
                  </h3>
                  <p className="text-xs text-red-300/80 leading-relaxed">
                    This ticket has <strong className="text-white underline">ALREADY BEEN CHECKED IN</strong> by another gate volunteer.
                  </p>
                </div>

                <div className="rounded-xl bg-black/40 border border-red-500/30 p-3.5 text-xs text-left space-y-1">
                  <div>
                    <span className="text-slate-400">Pass Number: </span>
                    <span className="font-mono font-bold text-white">#{collisionAlert.ticketNumber}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">Pass Holder: </span>
                    <span className="font-bold text-white">{collisionAlert.fullName}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">Admitted At: </span>
                    <span className="font-mono text-amber-300">
                      {new Date(collisionAlert.checkedInAt).toLocaleTimeString()}
                    </span>
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-red-950/80 border border-red-800 text-[11px] font-bold text-red-300">
                  ⛔ DO NOT ADMIT A SECOND TIME (POSSIBLE DUPLICATE ENTRY OR FAKE PASS)
                </div>

                <button
                  type="button"
                  onClick={() => setCollisionAlert(null)}
                  className="cursor-pointer w-full py-3 rounded-xl bg-red-600 hover:bg-red-500 font-bold text-xs text-white uppercase tracking-wider transition"
                >
                  I Understand • Reject Second Entry
                </button>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* 4. SPOT ENTRY / ADD PARTICIPANT MODAL                                      */}
          {/* ========================================================================= */}
          {isAddModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
              <div className="relative w-full max-w-lg rounded-2xl bg-[#0c1026] border border-white/10 p-6 space-y-5 shadow-2xl text-left">
                <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
                  <div>
                    <h3 className="text-base font-bold text-white">Spot Ticket Entry</h3>
                    <p className="text-xs text-slate-400">Add an offline / cash registrant at gate</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsAddModalOpen(false)}
                    className="text-slate-400 hover:text-white cursor-pointer"
                  >
                    ✕
                  </button>
                </div>

                {addError && (
                  <div className="p-3 rounded-xl bg-red-950/40 border border-red-500/30 text-red-200 text-xs">
                    {addError}
                  </div>
                )}

                <form onSubmit={handleAddPersonSubmit} className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-300">Full Name *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Rahul Sharma"
                      value={addForm.fullName}
                      onChange={(e) => setAddForm({ ...addForm, fullName: e.target.value })}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-white text-xs focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-300">Email Address *</label>
                      <input
                        type="email"
                        required
                        placeholder="attendee@example.com"
                        value={addForm.email}
                        onChange={(e) => setAddForm({ ...addForm, email: e.target.value })}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-white text-xs focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-300">Phone Number *</label>
                      <input
                        type="tel"
                        required
                        placeholder="10-digit number"
                        value={addForm.phone}
                        onChange={(e) => setAddForm({ ...addForm, phone: e.target.value })}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-white text-xs focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-300">Access Tier</label>
                      <input
                        type="text"
                        value={addForm.tier}
                        onChange={(e) => setAddForm({ ...addForm, tier: e.target.value })}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-white text-xs focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-emerald-400 font-mono">
                        Amount Collected (₹) *
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        required
                        placeholder="349"
                        value={addForm.amount}
                        onChange={(e) => setAddForm({ ...addForm, amount: e.target.value })}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-emerald-500/40 text-emerald-300 font-mono font-bold text-xs focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>

                  <label className="flex items-center gap-2 cursor-pointer pt-1 text-xs text-slate-300">
                    <input
                      type="checkbox"
                      checked={addForm.sendEmail}
                      onChange={(e) => setAddForm({ ...addForm, sendEmail: e.target.checked })}
                      className="rounded accent-indigo-600"
                    />
                    <span>Send official EchoSphere digital pass to their email</span>
                  </label>

                  <div className="flex justify-end gap-2 pt-2 border-t border-white/[0.08]">
                    <button
                      type="button"
                      onClick={() => setIsAddModalOpen(false)}
                      className="cursor-pointer px-4 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-xs font-semibold text-slate-300"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmittingAdd}
                      className="cursor-pointer px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 font-bold text-xs text-white shadow-lg shadow-indigo-600/30 disabled:opacity-50"
                    >
                      {isSubmittingAdd ? "Generating Pass..." : "Issue Pass & Register ✓"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
