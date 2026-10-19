"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import confetti from "canvas-confetti";
import * as XLSX from "xlsx";

interface ParsedAttendee {
  fullName: string;
  email: string;
  phone: string;
  tier?: string;
  amount?: number;
  isValid: boolean;
  validationError?: string;
}

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

interface TierSettingsData {
  tier_name: string;
  price: number;
  original_price: number;
  claimed_count: number;
  total_count: number;
  spots_left: number;
  badge_text: string;
  savings: number;
  updated_at?: string;
}

interface ToastMessage {
  id: string;
  type: "success" | "error" | "info";
  message: string;
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
  // Auth flow states: "password" | "otp" | "dashboard"
  const [authStep, setAuthStep] = useState<"password" | "otp" | "dashboard">("password");
  const [passwordInput, setPasswordInput] = useState("");
  const [otpInput, setOtpInput] = useState("");
  const [adminToken, setAdminToken] = useState<string | null>(null);
  const [maskedEmail, setMaskedEmail] = useState<string>("shreyas.u.sondur@gmail.com");
  const [authError, setAuthError] = useState<string | null>(null);
  const [isSubmittingAuth, setIsSubmittingAuth] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Dashboard states
  const [tickets, setTickets] = useState<TicketItem[]>([]);
  const [stats, setStats] = useState<StatsData | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterTab, setFilterTab] = useState<"all" | "pending" | "checked_in" | "spot">("all");
  const [viewMode, setViewMode] = useState<"table" | "cards">("table");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastSyncedTime, setLastSyncedTime] = useState<Date | null>(null);

  // Rapid Check-in input
  const [rapidInput, setRapidInput] = useState("");
  const [isRapidProcessing, setIsRapidProcessing] = useState(false);

  // Email resending per ticket state (tracking ticket_number -> boolean)
  const [resendingMap, setResendingMap] = useState<Record<string, boolean>>({});

  // Toast notifications
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

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
    admitNow: false,
  });
  const [isSubmittingAdd, setIsSubmittingAdd] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Edit Attendee Modal state
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingTicket, setEditingTicket] = useState<TicketItem | null>(null);
  const [editForm, setEditForm] = useState({
    fullName: "",
    email: "",
    phone: "",
    tier: "Early Bird Ticket",
    amount: "349",
    resendEmailNow: true,
  });
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Delete Confirmation Modal state (Requires Password: LOL)
  const [deleteModalTicket, setDeleteModalTicket] = useState<TicketItem | null>(null);
  const [deletePasswordInput, setDeletePasswordInput] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Tier Pricing & Gateway Settings Modal state
  const [isTierModalOpen, setIsTierModalOpen] = useState(false);
  const [currentTierSettings, setCurrentTierSettings] = useState<TierSettingsData | null>(null);
  const [tierForm, setTierForm] = useState({
    tier_name: "Early Bird Ticket",
    price: "349",
    original_price: "499",
    claimed_count: "182",
    total_count: "200",
    badge_text: "Early Bird Ticket",
  });
  const [isSavingTier, setIsSavingTier] = useState(false);
  const [isReconciling, setIsReconciling] = useState(false);

  // Bulk Upload (Excel / CSV) modal state
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [bulkStep, setBulkStep] = useState<"upload" | "preview" | "importing" | "success">("upload");
  const [parsedAttendees, setParsedAttendees] = useState<ParsedAttendee[]>([]);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [selectedFileSize, setSelectedFileSize] = useState<string | null>(null);
  const [bulkTier, setBulkTier] = useState("Spot Entry Pass");
  const [bulkAmount, setBulkAmount] = useState("349");
  const [bulkSendEmail, setBulkSendEmail] = useState(true);
  const [bulkAdmitNow, setBulkAdmitNow] = useState(false);
  const [isSubmittingBulk, setIsSubmittingBulk] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [bulkSuccessResult, setBulkSuccessResult] = useState<{
    count: number;
    firstTicket: string;
    lastTicket: string;
    message: string;
  } | null>(null);

  const otpInputRef = useRef<HTMLInputElement>(null);

  const addToast = useCallback((message: string, type: "success" | "error" | "info" = "info") => {
    const id = `${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  // Initialize and check existing token in sessionStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = sessionStorage.getItem("echosphere_admin_token");
      if (stored) {
        setAdminToken(stored);
        setAuthStep("dashboard");
      }
    }
  }, []);

  // Fetch live tier settings
  const fetchTierSettings = useCallback(async () => {
    try {
      const effectiveApiUrl = getApiUrl();
      const res = await fetch(`${effectiveApiUrl}/api/tickets/tier-settings?tier_name=Early+Bird+Ticket`, {
        cache: "no-store",
      });
      if (res.ok) {
        const data: TierSettingsData = await res.json();
        setCurrentTierSettings(data);
        setTierForm({
          tier_name: data.tier_name || "Early Bird Ticket",
          price: String(data.price || 349),
          original_price: String(data.original_price || 499),
          claimed_count: String(data.claimed_count || 182),
          total_count: String(data.total_count || 200),
          badge_text: data.badge_text || data.tier_name || "Early Bird Ticket",
        });
      }
    } catch (err) {
      console.error("Error fetching tier settings:", err);
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
        setLastSyncedTime(new Date());
      }
    } catch (err) {
      console.error("Dashboard fetch error:", err);
    } finally {
      if (!silent) setIsRefreshing(false);
    }
  }, []);

  // Auto-polling every 4 seconds for live multi-gate sync
  useEffect(() => {
    if (authStep === "dashboard" && adminToken) {
      void fetchDashboardData(adminToken);
      void fetchTierSettings();
      const interval = setInterval(() => {
        void fetchDashboardData(adminToken, true);
      }, 4000);
      return () => clearInterval(interval);
    }
  }, [authStep, adminToken, fetchDashboardData, fetchTierSettings]);

  // Focus OTP input on step change
  useEffect(() => {
    if (authStep === "otp") {
      setTimeout(() => otpInputRef.current?.focus(), 150);
    }
  }, [authStep]);

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

      setMaskedEmail(data.masked_email || "shreyas.u.sondur@gmail.com");
      setAuthStep("otp");
      addToast(`2FA code sent to ${data.masked_email || "shreyas.u.sondur@gmail.com"}`, "info");
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
      addToast("Gate Command Center verified and authorized.", "success");
    } catch (err: unknown) {
      setAuthError(err instanceof Error ? err.message : "2FA verification failed.");
    } finally {
      setIsSubmittingAuth(false);
    }
  };

  // Handle Gate Check-in
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
        addToast(data.detail || "Check-in failed.", "error");
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
          particleCount: 40,
          spread: 55,
          origin: { y: 0.8 },
          colors: ["#3b82f6", "#10b981", "#6366f1"],
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

        addToast(`Pass #${ticketNumber} admitted successfully!`, "success");
      }
    } catch (err) {
      console.error("Checkin error:", err);
      addToast("Network error during check-in.", "error");
    }
  };

  // Rapid Pass Lookup & Check-in
  const handleRapidCheckin = async (e: React.FormEvent) => {
    e.preventDefault();
    const query = rapidInput.trim();
    if (!query) return;

    // Normalize ticket number if digit
    const cleanNum = query.replace(/^#/, "");
    const formatted = /^\d+$/.test(cleanNum) ? cleanNum.padStart(4, "0") : cleanNum;

    // Find ticket in current list
    const found = tickets.find(
      (t) =>
        t.ticket_number === formatted ||
        t.ticket_number === cleanNum ||
        t.phone.includes(query) ||
        t.email.toLowerCase() === query.toLowerCase()
    );

    if (found) {
      if (found.checked_in) {
        setCollisionAlert({
          ticketNumber: found.ticket_number,
          fullName: found.full_name,
          checkedInAt: found.checked_in_at || "Earlier",
        });
        setRapidInput("");
        return;
      }
      setIsRapidProcessing(true);
      await handleCheckin(found.ticket_number);
      setIsRapidProcessing(false);
      setRapidInput("");
    } else {
      setIsRapidProcessing(true);
      await handleCheckin(formatted);
      setIsRapidProcessing(false);
      setRapidInput("");
    }
  };

  // Handle Undo Check-in
  const handleUndoCheckin = async (ticketNumber: string) => {
    if (!adminToken) return;

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
        addToast(`Reverted admission for Pass #${ticketNumber}`, "info");
      }
    } catch (err) {
      console.error("Undo error:", err);
      addToast("Failed to revert admission.", "error");
    }
  };

  // Handle Resend Email
  const handleResendEmail = async (ticketNumber: string, email: string) => {
    if (!adminToken) return;
    setResendingMap((prev) => ({ ...prev, [ticketNumber]: true }));

    try {
      const effectiveApiUrl = getApiUrl();
      const res = await fetch(`${effectiveApiUrl}/api/admin/tickets/${ticketNumber}/resend-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Failed to dispatch email.");
      }

      setTickets((prev) =>
        prev.map((t) => (t.ticket_number === ticketNumber ? { ...t, email_sent: 1 } : t))
      );
      addToast(`Pass #${ticketNumber} re-sent directly to ${email}!`, "success");
    } catch (err: unknown) {
      addToast(err instanceof Error ? err.message : "Failed to deliver email.", "error");
    } finally {
      setResendingMap((prev) => ({ ...prev, [ticketNumber]: false }));
    }
  };

  // Open Edit Attendee Modal
  const handleOpenEditModal = (ticket: TicketItem) => {
    setEditingTicket(ticket);
    setEditForm({
      fullName: ticket.full_name,
      email: ticket.email,
      phone: ticket.phone || "",
      tier: ticket.tier || "Early Bird Ticket",
      amount: String(ticket.amount ?? 349),
      resendEmailNow: true,
    });
    setEditError(null);
    setIsEditModalOpen(true);
  };

  // Handle Edit Attendee Submit
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminToken || !editingTicket) return;
    setEditError(null);
    setIsSubmittingEdit(true);

    try {
      const effectiveApiUrl = getApiUrl();
      const numAmount = parseFloat(editForm.amount);
      if (isNaN(numAmount) || numAmount < 0) {
        throw new Error("Please enter a valid amount (e.g. 349).");
      }

      const trimmedEmail = editForm.email.trim();
      if (!trimmedEmail || !trimmedEmail.includes("@") || !trimmedEmail.includes(".")) {
        throw new Error("Please enter a valid email address.");
      }

      const res = await fetch(`${effectiveApiUrl}/api/admin/tickets/${editingTicket.ticket_number}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          full_name: editForm.fullName.trim(),
          email: trimmedEmail,
          phone: editForm.phone.trim(),
          tier: editForm.tier.trim(),
          amount: numAmount,
          resend_email: editForm.resendEmailNow,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Failed to update ticket details.");
      }

      const updatedTicket: TicketItem = data.ticket;
      setTickets((prev) =>
        prev.map((t) => (t.ticket_number === editingTicket.ticket_number ? { ...t, ...updatedTicket } : t))
      );

      if (editForm.resendEmailNow && data.email_sent) {
        addToast(`Pass #${editingTicket.ticket_number} updated & pass re-sent directly to ${trimmedEmail}!`, "success");
      } else if (editForm.resendEmailNow && !data.email_sent) {
        addToast(`Pass #${editingTicket.ticket_number} updated! Email delivery failed; try the Resend button.`, "info");
      } else {
        addToast(`Pass #${editingTicket.ticket_number} details updated successfully!`, "success");
      }

      setIsEditModalOpen(false);
      setEditingTicket(null);
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : "Failed to update attendee.");
    } finally {
      setIsSubmittingEdit(false);
    }
  };

  // Open Delete Confirmation Modal
  const handleOpenDeleteModal = (ticket: TicketItem) => {
    setDeleteModalTicket(ticket);
    setDeletePasswordInput("");
    setDeleteError(null);
  };

  // Handle Delete Ticket with Password (LOL)
  const handleDeleteTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminToken || !deleteModalTicket) return;

    const pwd = deletePasswordInput.trim();
    if (pwd.toUpperCase() !== "LOL") {
      setDeleteError("Incorrect confirmation password. Password must be 'LOL'.");
      return;
    }

    setDeleteError(null);
    setIsDeleting(true);

    try {
      const effectiveApiUrl = getApiUrl();
      const res = await fetch(`${effectiveApiUrl}/api/admin/tickets/${deleteModalTicket.ticket_number}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ password: pwd }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Failed to delete ticket.");
      }

      setTickets((prev) => prev.filter((t) => t.ticket_number !== deleteModalTicket.ticket_number));
      if (data.stats) {
        setStats(data.stats);
      }

      addToast(`Pass #${deleteModalTicket.ticket_number} deleted permanently.`, "info");
      setDeleteModalTicket(null);

      if (editingTicket?.ticket_number === deleteModalTicket.ticket_number) {
        setIsEditModalOpen(false);
        setEditingTicket(null);
      }
    } catch (err: unknown) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete pass.");
    } finally {
      setIsDeleting(false);
    }
  };

  // Handle Spot Entry / Add Person Form Submit
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
          admit_now: addForm.admitNow,
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
        admitNow: false,
      });

      const deliveredMsg = data.email_sent
        ? `Pass #${data.ticket.ticket_number} created & confirmation email delivered to ${data.ticket.email}!`
        : `Pass #${data.ticket.ticket_number} created successfully!`;

      addToast(deliveredMsg, "success");

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

  // -------------------------------------------------------------
  // Bulk Upload (Excel / CSV) Handlers
  // -------------------------------------------------------------
  const handleDownloadTemplate = (format: "xlsx" | "csv") => {
    if (format === "csv") {
      const csvContent =
        "Full Name,Email Address,Phone Number,Tier (Optional),Amount (Optional)\n" +
        "Rahul Sharma,rahul.sharma@example.com,9876543210,Spot Entry Pass,349\n" +
        "Ananya Rao,ananya.rao@example.com,9845123456,Spot Entry Pass,349\n" +
        "Mohammed Farhan,m.farhan@example.com,9741234567,Spot Entry Pass,349\n";
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", "echosphere_attendees_template.csv");
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      addToast("Downloaded CSV template", "info");
    } else {
      try {
        const wb = XLSX.utils.book_new();
        const wsData = [
          ["Full Name", "Email Address", "Phone Number", "Tier (Optional)", "Amount (Optional)"],
          ["Rahul Sharma", "rahul.sharma@example.com", "9876543210", "Spot Entry Pass", 349],
          ["Ananya Rao", "ananya.rao@example.com", "9845123456", "Spot Entry Pass", 349],
          ["Mohammed Farhan", "m.farhan@example.com", "9741234567", "Spot Entry Pass", 349],
        ];
        const ws = XLSX.utils.aoa_to_sheet(wsData);
        ws["!cols"] = [{ wch: 24 }, { wch: 30 }, { wch: 18 }, { wch: 20 }, { wch: 16 }];
        XLSX.utils.book_append_sheet(wb, ws, "Attendees");
        XLSX.writeFile(wb, "echosphere_attendees_template.xlsx");
        addToast("Downloaded Excel template (.xlsx)", "info");
      } catch {
        const effectiveApiUrl = getApiUrl();
        window.open(`${effectiveApiUrl}/api/admin/tickets/template?format=xlsx`, "_blank");
      }
    }
  };

  const handleFileSelect = (file: File) => {
    setBulkError(null);
    setSelectedFileName(file.name);
    setSelectedFileSize(`${(file.size / 1024).toFixed(1)} KB`);

    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!["xlsx", "xls", "csv"].includes(ext || "")) {
      setBulkError("Invalid file format. Please upload an Excel (.xlsx, .xls) or CSV file.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const buffer = e.target?.result as ArrayBuffer;
        const workbook = XLSX.read(buffer, { type: "array" });
        const firstSheetName = workbook.SheetNames[0];
        if (!firstSheetName) {
          throw new Error("No worksheets found in this spreadsheet.");
        }
        const worksheet = workbook.Sheets[firstSheetName];
        const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];

        if (!rawRows || rawRows.length === 0) {
          throw new Error("The selected file is empty.");
        }

        const nonEmptyRows = rawRows.filter(
          (row) => row && row.some((cell) => cell !== null && cell !== undefined && String(cell).trim() !== "")
        );

        if (nonEmptyRows.length === 0) {
          throw new Error("No data rows found in this sheet.");
        }

        // Header column auto-detection
        let headerIdx = -1;
        let colName = -1;
        let colEmail = -1;
        let colPhone = -1;
        let colTier = -1;
        let colAmount = -1;

        for (let i = 0; i < Math.min(5, nonEmptyRows.length); i++) {
          const row = nonEmptyRows[i];
          const lowerRow = row.map((c) => String(c || "").trim().toLowerCase());
          const hasName = lowerRow.some((c) => ["name", "attendee", "participant", "student"].some((k) => c.includes(k)));
          const hasEmail = lowerRow.some((c) => ["email", "mail"].some((k) => c.includes(k)));
          const hasPhone = lowerRow.some((c) => ["phone", "mobile", "contact", "cell"].some((k) => c.includes(k)));

          if ((hasName && hasEmail) || (hasEmail && hasPhone) || (hasName && hasPhone)) {
            headerIdx = i;
            lowerRow.forEach((cellStr, cIdx) => {
              if (["full name", "fullname", "name", "attendee", "participant"].some((k) => cellStr.includes(k)) && colName === -1) {
                colName = cIdx;
              } else if (["email", "mail", "e-mail"].some((k) => cellStr.includes(k)) && colEmail === -1) {
                colEmail = cIdx;
              } else if (["phone", "mobile", "contact", "cell", "whatsapp"].some((k) => cellStr.includes(k)) && colPhone === -1) {
                colPhone = cIdx;
              } else if (["tier", "ticket type", "pass", "category"].some((k) => cellStr.includes(k)) && colTier === -1) {
                colTier = cIdx;
              } else if (["amount", "price", "fee", "cost", "paid"].some((k) => cellStr.includes(k)) && colAmount === -1) {
                colAmount = cIdx;
              }
            });
            break;
          }
        }

        const dataStart = headerIdx !== -1 ? headerIdx + 1 : 0;
        if (colName === -1 || colEmail === -1) {
          colName = 0;
          colEmail = 1;
          colPhone = 2;
          colTier = 3;
          colAmount = 4;
        }

        const attendees: ParsedAttendee[] = [];
        const seenEmails = new Set<string>();

        for (let i = dataStart; i < nonEmptyRows.length; i++) {
          const row = nonEmptyRows[i];
          const rawName = row[colName];
          const rawEmail = row[colEmail];
          const rawPhone = colPhone !== -1 ? row[colPhone] : "";
          const rawTier = colTier !== -1 ? row[colTier] : undefined;
          const rawAmount = colAmount !== -1 ? row[colAmount] : undefined;

          const name = String(rawName || "").trim();
          const email = String(rawEmail || "").trim().toLowerCase();
          
          let phoneStr = String(rawPhone !== undefined && rawPhone !== null ? rawPhone : "").trim();
          if (phoneStr.endsWith(".0")) phoneStr = phoneStr.slice(0, -2);
          let digits = phoneStr.replace(/\D/g, "");
          if (digits.startsWith("91") && digits.length === 12) {
            digits = digits.slice(2);
          } else if (digits.startsWith("0") && digits.length === 11) {
            digits = digits.slice(1);
          }

          let isValid = true;
          let validationError = "";

          if (!name || name.length < 2) {
            isValid = false;
            validationError = "Missing or invalid name";
          } else if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            isValid = false;
            validationError = "Invalid email format";
          } else if (seenEmails.has(email)) {
            isValid = false;
            validationError = "Duplicate email in file";
          }

          if (email) seenEmails.add(email);

          let parsedAmt: number | undefined = undefined;
          if (rawAmount !== undefined && rawAmount !== null && String(rawAmount).trim() !== "") {
            const num = parseFloat(String(rawAmount));
            if (!isNaN(num) && num >= 0) parsedAmt = num;
          }

          attendees.push({
            fullName: name,
            email,
            phone: digits || "9876543210",
            tier: rawTier ? String(rawTier).trim() : undefined,
            amount: parsedAmt,
            isValid,
            validationError: validationError || undefined,
          });
        }

        if (attendees.length === 0) {
          throw new Error("No participant records could be read from this sheet.");
        }

        setParsedAttendees(attendees);
        setBulkStep("preview");
      } catch (err: unknown) {
        setBulkError(err instanceof Error ? err.message : "Failed to parse spreadsheet file.");
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleBulkSubmit = async () => {
    const validAttendees = parsedAttendees.filter((a) => a.isValid);
    if (validAttendees.length === 0) {
      setBulkError("No valid attendee records found to import. Please check your file.");
      return;
    }

    if (stats && stats.available_tickets < validAttendees.length) {
      setBulkError(
        `Cannot issue ${validAttendees.length} passes. Only ${stats.available_tickets} spots remain before reaching the 2000 capacity limit.`
      );
      return;
    }

    setBulkError(null);
    setIsSubmittingBulk(true);
    setBulkStep("importing");

    try {
      const effectiveApiUrl = getApiUrl();
      const defaultAmt = parseFloat(bulkAmount) || 349.0;

      const payload = {
        attendees: validAttendees.map((a) => ({
          full_name: a.fullName,
          email: a.email,
          phone: a.phone,
          tier: a.tier || bulkTier,
          amount: a.amount !== undefined ? a.amount : defaultAmt,
        })),
        tier: bulkTier,
        amount: defaultAmt,
        send_email: bulkSendEmail,
        admit_now: bulkAdmitNow,
      };

      const res = await fetch(`${effectiveApiUrl}/api/admin/tickets/bulk-create`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Failed to bulk create passes.");
      }

      setBulkSuccessResult({
        count: data.count,
        firstTicket: data.first_ticket,
        lastTicket: data.last_ticket,
        message: data.message,
      });
      setBulkStep("success");

      try {
        confetti({
          particleCount: 160,
          spread: 90,
          origin: { y: 0.6 },
          colors: ["#6366f1", "#a855f7", "#3b82f6", "#10b981", "#fbbf24"],
        });
      } catch {}

      addToast(data.message, "success");

      if (adminToken) {
        void fetchDashboardData(adminToken);
      }
    } catch (err: unknown) {
      setBulkError(err instanceof Error ? err.message : "Bulk creation failed.");
      setBulkStep("preview");
    } finally {
      setIsSubmittingBulk(false);
    }
  };

  // Handle Update Tier Settings (Pricing, Scarcity & Gateway)
  const handleSaveTierSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminToken) return;
    setIsSavingTier(true);

    const numPrice = parseFloat(tierForm.price);
    const numOrig = parseFloat(tierForm.original_price);
    const numClaimed = parseInt(tierForm.claimed_count, 10);
    const numTotal = parseInt(tierForm.total_count, 10);

    if (isNaN(numPrice) || numPrice <= 0) {
      addToast("Please enter a valid ticket selling price.", "error");
      setIsSavingTier(false);
      return;
    }
    if (isNaN(numOrig) || numOrig < numPrice) {
      addToast("Original crossed price should be greater than or equal to selling price.", "error");
      setIsSavingTier(false);
      return;
    }
    if (isNaN(numClaimed) || numClaimed < 0) {
      addToast("Please enter a valid claimed/booked count.", "error");
      setIsSavingTier(false);
      return;
    }
    if (isNaN(numTotal) || numTotal <= 0) {
      addToast("Total capacity must be greater than zero.", "error");
      setIsSavingTier(false);
      return;
    }

    try {
      const effectiveApiUrl = getApiUrl();
      const res = await fetch(`${effectiveApiUrl}/api/admin/tier-settings`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          tier_name: tierForm.tier_name.trim(),
          price: numPrice,
          original_price: numOrig,
          claimed_count: numClaimed,
          total_count: numTotal,
          badge_text: tierForm.badge_text.trim() || tierForm.tier_name.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Failed to update pricing settings.");
      }

      setCurrentTierSettings(data.settings);
      setIsTierModalOpen(false);
      addToast(
        `Pricing updated! ₹${numPrice} (crossed ₹${numOrig}) is now live on the booking gateway.`,
        "success"
      );
    } catch (err: unknown) {
      addToast(err instanceof Error ? err.message : "Failed to update pricing.", "error");
    } finally {
      setIsSavingTier(false);
    }
  };

  // Reconcile and recover missing Cashfree orders
  const handleReconcileOrders = async () => {
    if (!adminToken) return;
    setIsReconciling(true);
    try {
      const effectiveApiUrl = getApiUrl();
      const res = await fetch(`${effectiveApiUrl}/api/admin/reconcile-orders`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Reconciliation failed.");
      }

      if (data.reconciled_count > 0) {
        addToast(
          `🎉 Reconciled ${data.reconciled_count} paid order(s)! Passes generated and confirmation emails sent.`,
          "success"
        );
      } else {
        addToast(
          `✓ All ${data.total_unfulfilled_checked || 0} pending orders are already in sync with Cashfree.`,
          "info"
        );
      }
      // Refresh dashboard list immediately
      void fetchDashboardData(adminToken);
    } catch (err: unknown) {
      addToast(
        err instanceof Error ? err.message : "Error syncing with Cashfree.",
        "error"
      );
    } finally {
      setIsReconciling(false);
    }
  };

  // Export Roster to CSV
  const handleExportCSV = () => {
    if (!tickets.length) {
      addToast("No ticket data to export.", "info");
      return;
    }

    const headers = [
      "Pass ID",
      "Full Name",
      "Email Address",
      "Phone Number",
      "Tier",
      "Amount (INR)",
      "Status",
      "Admitted At",
      "Email Sent",
      "Payment ID",
      "Created At",
    ];

    const rows = tickets.map((t) => [
      `"${t.ticket_number}"`,
      `"${t.full_name.replace(/"/g, '""')}"`,
      `"${t.email}"`,
      `"${t.phone}"`,
      `"${t.tier}"`,
      t.amount,
      t.checked_in ? "ADMITTED" : "PENDING",
      t.checked_in_at ? `"${t.checked_in_at}"` : '""',
      t.email_sent ? "SENT" : "PENDING",
      `"${t.payment_id}"`,
      `"${t.created_at}"`,
    ]);

    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `echosphere_roster_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    addToast("Attendee roster exported successfully.", "success");
  };

  const handleLogout = () => {
    sessionStorage.removeItem("echosphere_admin_token");
    setAdminToken(null);
    setAuthStep("password");
    setPasswordInput("");
    setOtpInput("");
    addToast("Signed out of gate control.", "info");
  };

  // Filter and search computation
  const filteredTickets = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return tickets.filter((t) => {
      // Tab filter
      const isChecked = Boolean(t.checked_in);
      const isSpot = t.payment_id.startsWith("SPOT_") || t.tier.toLowerCase().includes("spot");
      if (filterTab === "checked_in" && !isChecked) return false;
      if (filterTab === "pending" && isChecked) return false;
      if (filterTab === "spot" && !isSpot) return false;

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

  // Live preview values for Tier Settings Modal
  const previewPrice = parseFloat(tierForm.price) || 349;
  const previewOrig = parseFloat(tierForm.original_price) || 499;
  const previewClaimed = parseInt(tierForm.claimed_count, 10) || 182;
  const previewTotal = parseInt(tierForm.total_count, 10) || 200;
  const previewSavings = Math.max(0, previewOrig - previewPrice);
  const previewSpotsLeft = Math.max(0, previewTotal - previewClaimed);

  return (
    <div className="min-h-screen bg-[#070913] text-slate-100 flex flex-col font-sans selection:bg-indigo-500 selection:text-white">
      {/* Toast Notification Container */}
      <div className="fixed top-5 right-5 z-50 flex flex-col gap-2.5 max-w-sm w-full pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto px-4 py-3 rounded-xl border text-xs font-semibold shadow-xl backdrop-blur-md flex items-center justify-between gap-3 transition-all animate-in fade-in slide-in-from-top-2 ${
              toast.type === "success"
                ? "bg-emerald-950/80 border-emerald-500/40 text-emerald-200"
                : toast.type === "error"
                ? "bg-rose-950/80 border-rose-500/40 text-rose-200"
                : "bg-slate-900/90 border-slate-700/60 text-slate-200"
            }`}
          >
            <div className="flex items-center gap-2">
              <span>{toast.type === "success" ? "✓" : toast.type === "error" ? "⚠️" : "ℹ️"}</span>
              <span>{toast.message}</span>
            </div>
            <button
              type="button"
              onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
              className="text-slate-400 hover:text-white"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      {/* ========================================================================= */}
      {/* 1. AUTHENTICATION SCREENS (Password -> 2FA OTP)                           */}
      {/* ========================================================================= */}
      {authStep !== "dashboard" && (
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="relative w-full max-w-md rounded-2xl bg-[#0c1024]/90 border border-slate-800/80 p-8 shadow-2xl backdrop-blur-2xl space-y-6">
            <div className="text-center space-y-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-950/50 border border-indigo-500/30 text-[11px] font-semibold text-indigo-300">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                EchoSphere Gate Command
              </div>
              <h2 className="text-xl font-bold tracking-tight text-white">
                Operations &amp; Security Desk
              </h2>
              <p className="text-xs text-slate-400">
                Srinivas University Mukka (SUIET) • Gate Check-In &amp; Ticketing
              </p>
            </div>

            {authError && (
              <div className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-500/30 text-rose-200 text-xs font-medium text-center">
                {authError}
              </div>
            )}

            {authStep === "password" ? (
              <form onSubmit={handlePasswordSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <label className="font-semibold text-slate-300">Master Gate Passkey</label>
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="text-slate-400 hover:text-slate-200 text-[11px]"
                    >
                      {showPassword ? "Hide" : "Show"}
                    </button>
                  </div>
                  <input
                    type={showPassword ? "text" : "password"}
                    autoFocus
                    placeholder="Enter security key"
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-slate-900/60 border border-slate-800 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-indigo-500 transition"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmittingAuth || !passwordInput}
                  className="w-full py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 font-bold text-xs text-white shadow-lg shadow-indigo-600/20 transition disabled:opacity-50"
                >
                  {isSubmittingAuth ? "Verifying..." : "Continue to 2FA Passkey →"}
                </button>
              </form>
            ) : (
              <form onSubmit={handleOtpSubmit} className="space-y-4">
                <div className="p-3 rounded-xl bg-indigo-950/40 border border-indigo-500/20 text-xs text-indigo-200 text-center space-y-1">
                  <span>Single-use 2FA code dispatched to</span>
                  <p className="font-mono font-bold text-white">{maskedEmail}</p>
                </div>

                <div className="space-y-1.5 text-center">
                  <label className="text-xs font-semibold text-slate-300 block">
                    6-Digit Passkey
                  </label>
                  <input
                    ref={otpInputRef}
                    type="text"
                    maxLength={6}
                    autoFocus
                    placeholder="• • • • • •"
                    value={otpInput}
                    onChange={(e) => setOtpInput(e.target.value.replace(/\D/g, ""))}
                    className="w-full px-4 py-3 text-center tracking-[12px] font-mono text-2xl font-black rounded-xl bg-slate-900/60 border border-slate-800 text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmittingAuth || otpInput.length < 6}
                  className="w-full py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 font-bold text-xs text-white shadow-lg shadow-emerald-600/20 transition disabled:opacity-50"
                >
                  {isSubmittingAuth ? "Checking Passkey..." : "Authorize Gate Desk ✓"}
                </button>

                <div className="text-center pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setAuthStep("password");
                      setOtpInput("");
                    }}
                    className="text-xs text-slate-400 hover:text-slate-200 transition"
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
          <header className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-slate-800/80 pb-5">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider">
                  Live Gate Sync Active
                </span>
                {lastSyncedTime && (
                  <span className="text-[10px] text-slate-500">
                    • Synced {lastSyncedTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                  </span>
                )}
              </div>
              <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight flex items-center gap-2 mt-0.5">
                EchoSphere Gate Operations
                <span className="text-[11px] font-normal px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                  SUIET Arena
                </span>
              </h1>
              <p className="text-xs text-slate-400">
                Najran Kabeer × Benjamin Solomon Live • 2nd November 2026
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  void fetchTierSettings();
                  setIsTierModalOpen(true);
                }}
                className="px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs flex items-center gap-1.5 shadow-sm transition"
                title="Edit live ticket price, strikethrough price, and scarcity display"
              >
                <span>⚙️</span>
                <span>Edit Pricing &amp; Scarcity</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsBulkModalOpen(true);
                  setBulkStep("upload");
                  setBulkError(null);
                  setBulkSuccessResult(null);
                  setParsedAttendees([]);
                  setSelectedFileName(null);
                }}
                className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold text-xs flex items-center gap-1.5 shadow-sm transition"
                title="Bulk upload participants via Excel (.xlsx) or CSV"
              >
                <span>📊</span>
                <span>Bulk Import (Excel / CSV)</span>
              </button>

              <button
                type="button"
                onClick={() => setIsAddModalOpen(true)}
                className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs flex items-center gap-2 shadow-sm transition"
              >
                <span>+</span>
                <span>Issue Spot Pass</span>
              </button>

              <button
                type="button"
                onClick={handleExportCSV}
                className="px-3 py-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 font-medium text-xs border border-slate-700/60 transition flex items-center gap-1.5"
                title="Export full roster to CSV"
              >
                <span>📥</span>
                <span>Export CSV</span>
              </button>


              <button
                type="button"
                onClick={handleLogout}
                className="px-3 py-2 rounded-xl bg-slate-800/40 hover:bg-rose-950/40 text-slate-400 hover:text-rose-300 border border-slate-800 hover:border-rose-900/50 text-xs transition"
              >
                Sign Out
              </button>
            </div>
          </header>

          {/* Pricing & Gateway Live Banner */}
          {currentTierSettings && (
            <div className="rounded-2xl bg-gradient-to-r from-purple-950/30 via-slate-900/40 to-indigo-950/30 border border-purple-500/20 p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-600/20 border border-purple-500/30 flex items-center justify-center text-lg">
                  🎟️
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white text-sm">
                      {currentTierSettings.badge_text || currentTierSettings.tier_name}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950 border border-emerald-500/40 text-emerald-400">
                      Save ₹{currentTierSettings.savings}
                    </span>
                    <span className="text-[10px] font-mono text-purple-300 bg-purple-900/40 px-2 py-0.5 rounded border border-purple-700/50">
                      KonfHub Live Gateway
                    </span>
                  </div>
                  <div className="text-xs text-slate-400 flex items-center gap-2 mt-0.5">
                    <span className="font-mono font-bold text-white text-sm">
                      ₹{currentTierSettings.price}
                    </span>
                    <span className="line-through text-slate-500 text-xs">
                      ₹{currentTierSettings.original_price}
                    </span>
                    <span>•</span>
                    <span className="text-amber-300 font-medium">
                      🔥 {currentTierSettings.claimed_count}/{currentTierSettings.total_count} booked ({currentTierSettings.spots_left} spots left)
                    </span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  void fetchTierSettings();
                  setIsTierModalOpen(true);
                }}
                className="px-3 py-1.5 rounded-xl bg-purple-600/80 hover:bg-purple-500 text-white font-semibold text-xs border border-purple-400/30 transition shadow-sm"
              >
                Edit Pricing &amp; Gateway →
              </button>
            </div>
          )}

          {/* Key Metric Highlights */}
          <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <div className="rounded-2xl bg-slate-900/40 border border-slate-800/80 p-4 space-y-1">
              <span className="text-[11px] font-medium text-slate-400">Total Registered</span>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl sm:text-3xl font-bold font-mono text-white">
                  {stats?.total_sold ?? tickets.length}
                </span>
                <span className="text-xs text-slate-500 font-mono">/ 2,000 capacity</span>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-1 mt-2 overflow-hidden">
                <div
                  className="bg-indigo-500 h-1 rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.min(100, (((stats?.total_sold ?? tickets.length) / 2000) * 100))}%`,
                  }}
                />
              </div>
            </div>

            <div className="rounded-2xl bg-emerald-950/20 border border-emerald-900/40 p-4 space-y-1">
              <span className="text-[11px] font-medium text-emerald-300">Admitted at Gate</span>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl sm:text-3xl font-bold font-mono text-emerald-400">
                  {stats?.checked_in_count ?? tickets.filter((t) => t.checked_in).length}
                </span>
                <span className="text-xs text-emerald-500/80 font-mono">
                  {stats?.total_sold
                    ? `${Math.round(((stats.checked_in_count / stats.total_sold) * 100))}% check-in`
                    : "inside arena"}
                </span>
              </div>
            </div>

            <div className="rounded-2xl bg-amber-950/20 border border-amber-900/40 p-4 space-y-1">
              <span className="text-[11px] font-medium text-amber-300">Pending Entry</span>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl sm:text-3xl font-bold font-mono text-amber-400">
                  {stats?.pending_checkin_count ?? tickets.filter((t) => !t.checked_in).length}
                </span>
                <span className="text-xs text-amber-500/80 font-mono">outside gate</span>
              </div>
            </div>

            <div className="rounded-2xl bg-slate-900/40 border border-slate-800/80 p-4 space-y-1">
              <span className="text-[11px] font-medium text-slate-400">Total Revenue</span>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl sm:text-3xl font-bold font-mono text-slate-200">
                  ₹{stats?.total_revenue?.toLocaleString("en-IN") ?? "0"}
                </span>
                <span className="text-xs text-slate-500 font-mono">INR</span>
              </div>
            </div>
          </section>

          {/* Rapid Pass Check-In & Search */}
          <section className="rounded-2xl bg-slate-900/50 border border-slate-800/80 p-4 space-y-3">
            <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
              {/* Rapid Pass Entry Form */}
              <form onSubmit={handleRapidCheckin} className="flex items-center gap-2 flex-1 max-w-md">
                <div className="relative flex-1">
                  <input
                    type="text"
                    placeholder="Quick admit by Pass # (e.g. 0005) or phone..."
                    value={rapidInput}
                    onChange={(e) => setRapidInput(e.target.value)}
                    className="w-full px-3.5 py-2.5 pl-9 rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-500 text-xs focus:outline-none focus:border-indigo-500 transition"
                  />
                  <span className="absolute left-3 top-2.5 text-slate-500 text-xs">⚡</span>
                </div>
                <button
                  type="submit"
                  disabled={isRapidProcessing || !rapidInput.trim()}
                  className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition disabled:opacity-40"
                >
                  {isRapidProcessing ? "Admitting..." : "Admit ✓"}
                </button>
              </form>

              {/* View Toggle & Search */}
              <div className="flex items-center gap-2">
                <div className="relative w-64">
                  <input
                    type="text"
                    placeholder="Filter roster..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full px-3 py-2 pl-8 rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-500 text-xs focus:outline-none focus:border-indigo-500 transition"
                  />
                  <span className="absolute left-2.5 top-2.5 text-slate-500 text-xs">🔍</span>
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      className="absolute right-2.5 top-2 text-slate-400 hover:text-white text-xs"
                    >
                      ✕
                    </button>
                  )}
                </div>

                <div className="flex items-center bg-slate-950 border border-slate-800 rounded-xl p-1 text-xs">
                  <button
                    type="button"
                    onClick={() => setViewMode("table")}
                    className={`px-2.5 py-1 rounded-lg transition ${
                      viewMode === "table" ? "bg-slate-800 text-white" : "text-slate-400 hover:text-slate-200"
                    }`}
                    title="Table View"
                  >
                    ☰ Table
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode("cards")}
                    className={`px-2.5 py-1 rounded-lg transition ${
                      viewMode === "cards" ? "bg-slate-800 text-white" : "text-slate-400 hover:text-slate-200"
                    }`}
                    title="Card View"
                  >
                    ⊞ Cards
                  </button>
                </div>
              </div>
            </div>

            {/* Filter Tabs */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1 text-xs font-medium">
              <button
                type="button"
                onClick={() => setFilterTab("all")}
                className={`px-3 py-1.5 rounded-lg transition ${
                  filterTab === "all"
                    ? "bg-indigo-600 text-white"
                    : "text-slate-400 hover:text-white bg-slate-950/60 border border-slate-800/60"
                }`}
              >
                All Passes ({tickets.length})
              </button>
              <button
                type="button"
                onClick={() => setFilterTab("pending")}
                className={`px-3 py-1.5 rounded-lg transition ${
                  filterTab === "pending"
                    ? "bg-amber-600 text-white"
                    : "text-slate-400 hover:text-white bg-slate-950/60 border border-slate-800/60"
                }`}
              >
                Pending Entry ({tickets.filter((t) => !t.checked_in).length})
              </button>
              <button
                type="button"
                onClick={() => setFilterTab("checked_in")}
                className={`px-3 py-1.5 rounded-lg transition ${
                  filterTab === "checked_in"
                    ? "bg-emerald-600 text-white"
                    : "text-slate-400 hover:text-white bg-slate-950/60 border border-slate-800/60"
                }`}
              >
                Admitted ({tickets.filter((t) => t.checked_in).length})
              </button>
              <button
                type="button"
                onClick={() => setFilterTab("spot")}
                className={`px-3 py-1.5 rounded-lg transition ${
                  filterTab === "spot"
                    ? "bg-purple-600 text-white"
                    : "text-slate-400 hover:text-white bg-slate-950/60 border border-slate-800/60"
                }`}
              >
                Spot Passes ({tickets.filter((t) => t.payment_id.startsWith("SPOT_") || t.tier.toLowerCase().includes("spot")).length})
              </button>
            </div>
          </section>

          {/* Attendee Roster View */}
          <section className="space-y-3">
            {filteredTickets.length === 0 ? (
              <div className="text-center py-16 rounded-2xl bg-slate-900/30 border border-slate-800/80 space-y-2">
                <span className="text-3xl block">🎟️</span>
                <p className="text-sm font-semibold text-slate-300">No matching tickets found</p>
                <p className="text-xs text-slate-500">
                  {searchQuery ? "Try a different search query or filter." : "No attendees in this category."}
                </p>
              </div>
            ) : viewMode === "table" ? (
              /* TABLE VIEW */
              <div className="rounded-2xl border border-slate-800/80 overflow-hidden bg-slate-900/30">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-800 bg-slate-950/70 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                        <th className="py-3 px-4">Pass ID</th>
                        <th className="py-3 px-4">Attendee</th>
                        <th className="py-3 px-4">Contact</th>
                        <th className="py-3 px-4">Tier &amp; Amount</th>
                        <th className="py-3 px-4">Gate Status</th>
                        <th className="py-3 px-4">Email Pass</th>
                        <th className="py-3 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {filteredTickets.map((t) => {
                        const isChecked = Boolean(t.checked_in);
                        const isSpot = t.payment_id.startsWith("SPOT_") || t.tier.toLowerCase().includes("spot");
                        const isResending = Boolean(resendingMap[t.ticket_number]);

                        return (
                          <tr
                            key={t.ticket_number}
                            className={`transition hover:bg-slate-800/30 ${
                              isChecked ? "bg-emerald-950/10" : ""
                            }`}
                          >
                            {/* Pass ID */}
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono font-bold text-sm text-indigo-300">
                                  #{t.ticket_number}
                                </span>
                                {isSpot && (
                                  <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-purple-950 text-purple-300 border border-purple-800">
                                    SPOT
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* Attendee Name */}
                            <td className="py-3 px-4">
                              <div className="font-semibold text-white truncate max-w-[160px]">
                                {t.full_name}
                              </div>
                              <div className="text-[10px] text-slate-400 font-mono">
                                Registered: {new Date(t.created_at).toLocaleDateString([], { month: "short", day: "numeric" })}
                              </div>
                            </td>

                            {/* Contact Details */}
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-1.5 group">
                                <span className="text-slate-300 truncate max-w-[170px]" title={t.email}>
                                  {t.email}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleOpenEditModal(t)}
                                  className="text-slate-500 hover:text-indigo-300 p-0.5 rounded transition"
                                  title="Edit attendee email and details"
                                >
                                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                  </svg>
                                </button>
                              </div>
                              <div className="text-[10px] text-slate-400 font-mono">
                                {t.phone || "No phone"}
                              </div>
                            </td>

                            {/* Tier & Price */}
                            <td className="py-3 px-4">
                              <div className="text-slate-300 font-medium">
                                {t.tier}
                              </div>
                              <div className="font-mono font-bold text-emerald-400 text-[11px]">
                                ₹{t.amount} INR
                              </div>
                            </td>

                            {/* Gate Status */}
                            <td className="py-3 px-4">
                              {isChecked ? (
                                <div>
                                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 text-[10px] font-semibold">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                                    Admitted
                                  </span>
                                  {t.checked_in_at && (
                                    <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                                      {new Date(t.checked_in_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-950/60 border border-amber-500/30 text-amber-300 text-[10px] font-semibold">
                                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                                  Pending
                                </span>
                              )}
                            </td>

                            {/* Email Pass Status & Resend */}
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-2">
                                <span
                                  className={`text-[10px] px-2 py-0.5 rounded font-mono ${
                                    t.email_sent
                                      ? "bg-slate-800 text-slate-300 border border-slate-700"
                                      : "bg-amber-950/40 text-amber-300 border border-amber-800"
                                  }`}
                                >
                                  {t.email_sent ? "Sent ✓" : "Pending"}
                                </span>
                                <button
                                  type="button"
                                  disabled={isResending}
                                  onClick={() => handleResendEmail(t.ticket_number, t.email)}
                                  className="text-[10px] text-indigo-400 hover:text-indigo-300 underline font-medium disabled:opacity-40"
                                  title="Resend confirmation pass email"
                                >
                                  {isResending ? "Sending..." : "Resend"}
                                </button>
                              </div>
                            </td>

                            {/* Actions */}
                            <td className="py-3 px-4 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleOpenEditModal(t)}
                                  className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-medium text-xs border border-slate-700 transition flex items-center gap-1 shadow-sm"
                                  title="Edit attendee details (email, phone, name)"
                                >
                                  <svg className="w-3.5 h-3.5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                  </svg>
                                  <span>Edit</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleOpenDeleteModal(t)}
                                  className="p-1.5 rounded-lg bg-rose-950/40 hover:bg-rose-900/70 text-rose-400 hover:text-rose-200 border border-rose-800/50 transition flex items-center justify-center shadow-sm"
                                  title="Delete Pass (Password: LOL)"
                                >
                                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                </button>
                                {isChecked ? (
                                  <button
                                    type="button"
                                    onClick={() => handleUndoCheckin(t.ticket_number)}
                                    className="text-[11px] text-slate-400 hover:text-rose-300 underline font-medium"
                                  >
                                    Undo Admission
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => handleCheckin(t.ticket_number)}
                                    className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs shadow-sm transition"
                                  >
                                    Admit ✓
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              /* CARD VIEW */
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {filteredTickets.map((t) => {
                  const isChecked = Boolean(t.checked_in);
                  const isSpot = t.payment_id.startsWith("SPOT_") || t.tier.toLowerCase().includes("spot");
                  const isResending = Boolean(resendingMap[t.ticket_number]);

                  return (
                    <div
                      key={t.ticket_number}
                      className={`relative rounded-2xl p-4 border transition-all ${
                        isChecked
                          ? "bg-emerald-950/15 border-emerald-500/30"
                          : "bg-slate-900/40 border-slate-800/80 hover:border-slate-700"
                      }`}
                    >
                      {/* Top Header */}
                      <div className="flex items-start justify-between gap-2 border-b border-slate-800/80 pb-3">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-mono tracking-wider text-slate-400 uppercase">
                              Pass Number
                            </span>
                            {isSpot && (
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-semibold bg-purple-950 text-purple-300 border border-purple-800">
                                SPOT
                              </span>
                            )}
                          </div>
                          <span className="text-2xl font-mono font-black text-indigo-300 tracking-tight">
                            #{t.ticket_number}
                          </span>
                        </div>

                        <div>
                          {isChecked ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 text-[10px] font-semibold uppercase">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                              Admitted
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-950/60 border border-amber-500/30 text-amber-300 text-[10px] font-semibold uppercase">
                              Pending
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Attendee Details */}
                      <div className="py-3 space-y-1.5 text-xs">
                        <div className="flex items-center justify-between">
                          <div className="font-bold text-white text-sm truncate">
                            {t.full_name}
                          </div>
                          <button
                            type="button"
                            onClick={() => handleOpenEditModal(t)}
                            className="text-[11px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1 px-2 py-0.5 rounded bg-indigo-950/50 hover:bg-indigo-900/60 border border-indigo-500/30 transition"
                            title="Edit Attendee Details"
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                            Edit
                          </button>
                        </div>
                        <div className="text-slate-400 truncate flex items-center gap-1.5">
                          <span>📧</span> {t.email}
                        </div>
                        <div className="text-slate-400 truncate flex items-center gap-1.5">
                          <span>📞</span> {t.phone || "No phone"}
                        </div>
                        <div className="flex items-center justify-between pt-1 border-t border-slate-800/60">
                          <span className="text-[11px] font-mono text-indigo-300 bg-indigo-950/40 px-2 py-0.5 rounded-md border border-indigo-500/20">
                            {t.tier}
                          </span>
                          <span className="font-mono font-bold text-slate-200">
                            ₹{t.amount} INR
                          </span>
                        </div>
                        {t.checked_in_at && (
                          <div className="text-[10px] font-mono text-emerald-400 pt-0.5">
                            Admitted at: {new Date(t.checked_in_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="pt-2 flex items-center justify-between gap-2 border-t border-slate-800/60">
                        <button
                          type="button"
                          disabled={isResending}
                          onClick={() => handleResendEmail(t.ticket_number, t.email)}
                          className="text-[10px] text-slate-400 hover:text-indigo-300 underline"
                        >
                          {isResending ? "Resending..." : "Resend Pass Email"}
                        </button>

                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenEditModal(t)}
                            className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700 transition"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenDeleteModal(t)}
                            className="p-1.5 rounded-lg bg-rose-950/40 hover:bg-rose-900/70 text-rose-400 hover:text-rose-200 border border-rose-800/50 transition flex items-center justify-center"
                            title="Delete Pass (Password: LOL)"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                          {isChecked ? (
                            <button
                              type="button"
                              onClick={() => handleUndoCheckin(t.ticket_number)}
                              className="text-[11px] text-slate-400 hover:text-rose-300 underline font-medium px-2 py-1"
                            >
                              Undo
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleCheckin(t.ticket_number)}
                              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs shadow-sm transition"
                            >
                              Admit Attendee ✓
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* ========================================================================= */}
          {/* 3. TICKET PRICING, SCARCITY & PAYMENT GATEWAY MODAL                       */}
          {/* ========================================================================= */}
          {isTierModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in">
              <div className="relative w-full max-w-4xl max-h-[92vh] overflow-y-auto rounded-2xl bg-[#0c1024] border border-purple-500/30 p-6 space-y-6 shadow-2xl text-left">
                {/* Modal Header */}
                <div className="flex items-start justify-between border-b border-slate-800 pb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-purple-400" />
                      <span className="text-[10px] font-mono font-bold tracking-widest text-purple-400 uppercase">
                        LIVE PRICING &amp; GATEWAY ENGINE
                      </span>
                    </div>
                    <h3 className="text-lg font-bold text-white mt-1">
                      Concert Ticket Pricing &amp; Scarcity Settings
                    </h3>
                    <p className="text-xs text-slate-400">
                      Changes made here instantly update the public Booking Modal and Cashfree transaction amounts.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsTierModalOpen(false)}
                    className="text-slate-400 hover:text-white p-1 text-base"
                  >
                    ✕
                  </button>
                </div>

                {/* Quick Presets */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider text-[10px]">
                    Quick Scenario Presets
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { name: "Early Bird Ticket", price: "349", orig: "499", booked: "182", total: "200" },
                      { name: "General Admission", price: "499", orig: "699", booked: "250", total: "500" },
                      { name: "VIP Fan Pit", price: "699", orig: "999", booked: "45", total: "50" },
                      { name: "Flash Sale", price: "299", orig: "499", booked: "95", total: "100" },
                    ].map((p) => (
                      <button
                        key={p.name}
                        type="button"
                        onClick={() =>
                          setTierForm({
                            tier_name: p.name,
                            badge_text: p.name,
                            price: p.price,
                            original_price: p.orig,
                            claimed_count: p.booked,
                            total_count: p.total,
                          })
                        }
                        className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white transition"
                      >
                        ⚡ {p.name} (₹{p.price} / ₹{p.orig} • {p.booked}/{p.total})
                      </button>
                    ))}
                  </div>
                </div>

                {/* 2-Column Layout: Form Controls (Left) vs Interactive Live Preview (Right) */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                  {/* Left Column: Form Controls */}
                  <form onSubmit={handleSaveTierSettings} className="space-y-4">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-300">
                        Tier Title / Badge Label *
                      </label>
                      <input
                        type="text"
                        required
                        value={tierForm.badge_text}
                        onChange={(e) =>
                          setTierForm({
                            ...tierForm,
                            badge_text: e.target.value,
                            tier_name: e.target.value,
                          })
                        }
                        placeholder="e.g. Early Bird Ticket"
                        className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-white text-xs focus:outline-none focus:border-purple-500 font-semibold"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-emerald-400 font-mono">
                          Selling Price (₹) *
                        </label>
                        <input
                          type="number"
                          step="1"
                          min="1"
                          required
                          value={tierForm.price}
                          onChange={(e) => setTierForm({ ...tierForm, price: e.target.value })}
                          className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-emerald-500/40 text-emerald-300 font-mono font-bold text-sm focus:outline-none focus:border-emerald-500"
                        />
                        <span className="text-[10px] text-slate-500 block">Actual amount charged</span>
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-slate-400 font-mono">
                          Crossed Price (₹) *
                        </label>
                        <input
                          type="number"
                          step="1"
                          min="1"
                          required
                          value={tierForm.original_price}
                          onChange={(e) =>
                            setTierForm({ ...tierForm, original_price: e.target.value })
                          }
                          className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 font-mono font-semibold text-sm focus:outline-none focus:border-purple-500"
                        />
                        <span className="text-[10px] text-slate-500 block">Strikethrough original</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-amber-300 font-mono">
                          Claimed / Booked *
                        </label>
                        <input
                          type="number"
                          step="1"
                          min="0"
                          required
                          value={tierForm.claimed_count}
                          onChange={(e) =>
                            setTierForm({ ...tierForm, claimed_count: e.target.value })
                          }
                          className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-amber-500/30 text-amber-300 font-mono font-bold text-sm focus:outline-none focus:border-amber-500"
                        />
                        <span className="text-[10px] text-slate-500 block">Shows: &quot;X/Y booked&quot;</span>
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-slate-300 font-mono">
                          Total Tier Spots *
                        </label>
                        <input
                          type="number"
                          step="1"
                          min="1"
                          required
                          value={tierForm.total_count}
                          onChange={(e) => setTierForm({ ...tierForm, total_count: e.target.value })}
                          className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-white font-mono font-bold text-sm focus:outline-none focus:border-purple-500"
                        />
                        <span className="text-[10px] text-slate-500 block">Capacity for this tier</span>
                      </div>
                    </div>

                    {/* Calculated Metrics */}
                    <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 text-xs space-y-1.5 font-mono">
                      <div className="flex justify-between">
                        <span className="text-slate-400">Discount Savings:</span>
                        <span className="text-emerald-400 font-bold">
                          ₹{previewSavings} ({Math.round(((previewSavings / Math.max(1, previewOrig)) * 100))}% off)
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Remaining Spots:</span>
                        <span className="text-amber-300 font-bold">
                          {previewSpotsLeft} tickets left
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Scarcity Progress:</span>
                        <span className="text-indigo-300 font-bold">
                          {previewClaimed}/{previewTotal} ({Math.round(((previewClaimed / Math.max(1, previewTotal)) * 100))}%)
                        </span>
                      </div>
                    </div>

                    {/* Payment Gateway Information Box */}
                    <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                          <span>🔒</span>
                          <span>Cashfree Gateway Info</span>
                        </span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-950 text-emerald-400 border border-emerald-800">
                          Production Live
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 space-y-1 font-mono">
                        <div>API Version: 2023-08-01</div>
                        <div>Currency: INR (₹)</div>
                        <div className="truncate text-slate-500">
                          Return URL: https://echosphere.suiet.website/?order_id=&#123;order_id&#125;
                        </div>
                        <div className="text-indigo-400 pt-1">
                          ✓ Dynamic pricing updates propagate directly into Cashfree checkout tokens.
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                      <button
                        type="button"
                        onClick={() => setIsTierModalOpen(false)}
                        className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={isSavingTier}
                        className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 font-bold text-xs text-white shadow-lg shadow-purple-600/30 transition disabled:opacity-50"
                      >
                        {isSavingTier ? "Publishing Changes..." : "Save & Publish Pricing Live →"}
                      </button>
                    </div>
                  </form>

                  {/* Right Column: Interactive Live Preview (Mirrors the Booking Modal Screenshot) */}
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider text-[10px] block">
                      Live Customer Preview (Booking Modal)
                    </label>

                    <div className="rounded-2xl bg-[#080b18] border border-white/10 p-5 shadow-2xl space-y-4">
                      {/* Ticket Box matching screenshot */}
                      <div className="rounded-xl bg-[#0d122b]/80 border border-indigo-500/20 p-4 space-y-2.5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-white text-base">
                              {tierForm.badge_text || "Early Bird Ticket"}
                            </span>
                            {previewSavings > 0 && (
                              <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                                Save ₹{previewSavings}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center bg-black/40 border border-white/10 rounded-lg px-2.5 py-1 text-xs text-slate-300 gap-2 font-mono">
                            <span>-</span>
                            <span className="font-bold text-white">1</span>
                            <span>+</span>
                          </div>
                        </div>

                        <div className="flex items-baseline gap-2 text-xs">
                          <span className="text-xl font-black text-white font-mono">
                            ₹{previewPrice}
                          </span>
                          {previewOrig > previewPrice && (
                            <span className="line-through text-slate-500 font-mono text-sm">
                              ₹{previewOrig}
                            </span>
                          )}
                          <span className="text-slate-400">• Arena Entry</span>
                        </div>

                        <div className="pt-1 flex items-center gap-2 text-xs text-amber-300 font-medium">
                          <span>🔥 {previewClaimed}/{previewTotal} booked</span>
                          <span className="text-slate-600">•</span>
                          <span className="text-slate-400">
                            {previewSpotsLeft > 0
                              ? `Only ${previewSpotsLeft} left at this price`
                              : "Sold out at this tier"}
                          </span>
                        </div>
                      </div>

                      {/* Attendee Info Stub */}
                      <div className="space-y-2 pt-1 border-t border-white/[0.06]">
                        <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex justify-between">
                          <span>ATTENDEE INFORMATION</span>
                          <span className="text-[10px] text-slate-500">Pass sent via email</span>
                        </div>
                        <div className="rounded-xl bg-black/30 border border-white/[0.06] p-3 text-xs text-slate-500 space-y-2">
                          <div className="text-slate-300 font-medium">1 Your Details</div>
                          <div className="h-7 rounded bg-white/[0.03] border border-white/[0.06] flex items-center px-2.5 text-slate-600 text-[11px]">
                            Full Name
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="h-7 rounded bg-white/[0.03] border border-white/[0.06] flex items-center px-2 text-slate-600 text-[10px] truncate">
                              Email Address
                            </div>
                            <div className="h-7 rounded bg-white/[0.03] border border-white/[0.06] flex items-center px-2 text-slate-600 text-[10px] truncate">
                              Mobile Number
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Bottom Total & Pay Now CTA matching screenshot */}
                      <div className="pt-2 border-t border-white/[0.08] flex items-center justify-between">
                        <div>
                          <div className="flex items-baseline gap-1.5">
                            <span className="text-xl font-black text-white font-mono">
                              ₹{previewPrice}
                            </span>
                            {previewOrig > previewPrice && (
                              <span className="line-through text-slate-500 text-xs font-mono">
                                ₹{previewOrig}
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] text-emerald-400 font-medium block">
                            Saving ₹{previewSavings} on 1 ticket
                          </span>
                        </div>

                        <div className="text-right space-y-1">
                          <button
                            type="button"
                            className="px-5 py-2.5 rounded-xl bg-indigo-600 text-white font-bold text-xs uppercase tracking-wider shadow-lg shadow-indigo-600/30 flex items-center gap-1.5"
                          >
                            PAY NOW • ₹{previewPrice} →
                          </button>
                          <span className="text-[10px] text-slate-400 block font-medium">
                            🔒 Cashfree Gateway • UPI &amp; Cards
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* 4. COLLISION ALERT MODAL                                                  */}
          {/* ========================================================================= */}
          {collisionAlert && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
              <div className="w-full max-w-md rounded-2xl bg-[#140b10] border border-rose-500/50 p-6 space-y-4 shadow-2xl">
                <div className="w-12 h-12 mx-auto rounded-full bg-rose-950 border border-rose-500/50 flex items-center justify-center text-xl text-rose-300">
                  ⚠️
                </div>

                <div className="text-center space-y-1">
                  <h3 className="text-base font-bold text-rose-200 uppercase tracking-tight">
                    Duplicate Admission Detected
                  </h3>
                  <p className="text-xs text-rose-300/80">
                    This ticket has already been admitted at the gate.
                  </p>
                </div>

                <div className="rounded-xl bg-black/50 border border-rose-900/50 p-3.5 text-xs space-y-1.5 font-mono">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Pass Number:</span>
                    <span className="font-bold text-white">#{collisionAlert.ticketNumber}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Pass Holder:</span>
                    <span className="font-bold text-white">{collisionAlert.fullName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Admitted At:</span>
                    <span className="text-amber-300">
                      {new Date(collisionAlert.checkedInAt).toLocaleTimeString()}
                    </span>
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-rose-950/60 border border-rose-800 text-[11px] font-semibold text-rose-300 text-center">
                  Do not admit twice. Duplicate passes or screenshots are rejected.
                </div>

                <button
                  type="button"
                  onClick={() => setCollisionAlert(null)}
                  className="w-full py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 font-semibold text-xs text-white transition"
                >
                  Acknowledge &amp; Deny Second Entry
                </button>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* 5. SPOT ENTRY / ADD PASS MODAL                                            */}
          {/* ========================================================================= */}
          {isAddModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
              <div className="relative w-full max-w-lg rounded-2xl bg-[#0d1022] border border-slate-800 p-6 space-y-5 shadow-2xl text-left">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div>
                    <h3 className="text-base font-bold text-white">Spot Pass Issuance</h3>
                    <p className="text-xs text-slate-400">
                      Generate official sequential pass &amp; dispatch confirmation email
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsAddModalOpen(false)}
                    className="text-slate-400 hover:text-white"
                  >
                    ✕
                  </button>
                </div>

                {addError && (
                  <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-500/30 text-rose-200 text-xs">
                    {addError}
                  </div>
                )}

                <form onSubmit={handleAddPersonSubmit} className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-300">Attendee Full Name *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Rahul Sharma"
                      value={addForm.fullName}
                      onChange={(e) => setAddForm({ ...addForm, fullName: e.target.value })}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-white text-xs focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-300">Email Address *</label>
                      <input
                        type="email"
                        required
                        placeholder="attendee@example.com"
                        value={addForm.email}
                        onChange={(e) => setAddForm({ ...addForm, email: e.target.value })}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-white text-xs focus:outline-none focus:border-indigo-500"
                      />
                      <p className="text-[10px] text-slate-500">
                        Digital pass with scannable QR code is delivered here immediately.
                      </p>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-300">Phone Number *</label>
                      <input
                        type="tel"
                        required
                        placeholder="10-digit number"
                        value={addForm.phone}
                        onChange={(e) => setAddForm({ ...addForm, phone: e.target.value })}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-white text-xs focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>

                  {/* Tier Chips */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-300">Quick Tier Selection</label>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { label: "Early Bird", price: String(currentTierSettings?.price || "349") },
                        { label: "Spot Entry Pass", price: "349" },
                        { label: "VIP Fan Pit", price: "699" },
                      ].map((t) => (
                        <button
                          key={t.label}
                          type="button"
                          onClick={() => setAddForm({ ...addForm, tier: t.label, amount: t.price })}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                            addForm.tier === t.label
                              ? "bg-indigo-600/30 border-indigo-500 text-indigo-200"
                              : "bg-slate-900 border-slate-800 text-slate-400 hover:text-white"
                          }`}
                        >
                          {t.label} (₹{t.price})
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-300">Tier Name</label>
                      <input
                        type="text"
                        value={addForm.tier}
                        onChange={(e) => setAddForm({ ...addForm, tier: e.target.value })}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-white text-xs focus:outline-none focus:border-indigo-500"
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
                        value={addForm.amount}
                        onChange={(e) => setAddForm({ ...addForm, amount: e.target.value })}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-emerald-500/40 text-emerald-300 font-mono font-bold text-xs focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>

                  {/* Actions Checkbox */}
                  <div className="space-y-2 pt-1 border-t border-slate-800/80">
                    <label className="flex items-center gap-2.5 text-xs text-slate-300">
                      <input
                        type="checkbox"
                        checked={addForm.sendEmail}
                        onChange={(e) => setAddForm({ ...addForm, sendEmail: e.target.checked })}
                        className="rounded accent-indigo-600"
                      />
                      <span>Dispatch official EchoSphere digital pass to email immediately</span>
                    </label>

                    <label className="flex items-center gap-2.5 text-xs text-slate-300">
                      <input
                        type="checkbox"
                        checked={addForm.admitNow}
                        onChange={(e) => setAddForm({ ...addForm, admitNow: e.target.checked })}
                        className="rounded accent-emerald-600"
                      />
                      <span>Immediately admit attendee at gate (Attendee is currently at gate desk)</span>
                    </label>
                  </div>

                  <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                    <button
                      type="button"
                      onClick={() => setIsAddModalOpen(false)}
                      className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-300"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmittingAdd}
                      className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 font-bold text-xs text-white shadow-lg shadow-indigo-600/20 disabled:opacity-50"
                    >
                      {isSubmittingAdd ? "Issuing & Delivering Email..." : "Issue Pass & Send Email →"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* 5B. EDIT ATTENDEE & PASS DETAILS MODAL                                    */}
          {/* ========================================================================= */}
          {isEditModalOpen && editingTicket && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
              <div className="relative w-full max-w-lg rounded-2xl bg-[#0d1022] border border-indigo-500/30 p-6 space-y-5 shadow-2xl text-left">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-indigo-400" />
                      <span className="text-[10px] font-mono font-bold tracking-widest text-indigo-400 uppercase">
                        ATTENDEE DETAILS
                      </span>
                    </div>
                    <h3 className="text-base font-bold text-white mt-0.5">
                      Edit Pass #{editingTicket.ticket_number}
                    </h3>
                    <p className="text-xs text-slate-400">
                      Update mistyped emails or details. Pass ID <span className="font-mono text-indigo-300 font-semibold">#{editingTicket.ticket_number}</span> is preserved.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsEditModalOpen(false)}
                    className="text-slate-400 hover:text-white p-1 text-base transition"
                  >
                    ✕
                  </button>
                </div>

                {editError && (
                  <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-500/30 text-rose-200 text-xs flex items-center gap-2">
                    <span className="text-rose-400 font-bold">⚠️</span>
                    <span>{editError}</span>
                  </div>
                )}

                <form onSubmit={handleEditSubmit} className="space-y-4">
                  {/* Pass ID Banner */}
                  <div className="flex items-center justify-between p-3 rounded-xl bg-indigo-950/40 border border-indigo-500/20 text-xs">
                    <div>
                      <span className="text-[10px] uppercase font-mono tracking-wider text-slate-400 block">
                        Permanent Pass ID
                      </span>
                      <span className="font-mono text-base font-bold text-indigo-300">
                        #{editingTicket.ticket_number}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-slate-400 block">Gate Status</span>
                      <span className={`inline-flex items-center gap-1 text-[11px] font-semibold ${editingTicket.checked_in ? "text-emerald-400" : "text-amber-400"}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${editingTicket.checked_in ? "bg-emerald-400" : "bg-amber-400"}`} />
                        {editingTicket.checked_in ? "Admitted" : "Not Admitted"}
                      </span>
                    </div>
                  </div>

                  {/* Email Address */}
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-indigo-300 flex items-center justify-between">
                      <span>Email Address *</span>
                      <span className="text-[10px] text-slate-400 font-normal">Primary pass delivery destination</span>
                    </label>
                    <input
                      type="email"
                      required
                      placeholder="attendee@example.com"
                      value={editForm.email}
                      onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-indigo-500/40 text-white text-xs focus:outline-none focus:border-indigo-400 font-mono shadow-inner"
                    />
                    <p className="text-[10px] text-slate-400">
                      If the attendee misclicked or entered the wrong email, correct it here to resend their pass.
                    </p>
                  </div>

                  {/* Full Name & Phone */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-300">Full Name *</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Rahul Sharma"
                        value={editForm.fullName}
                        onChange={(e) => setEditForm({ ...editForm, fullName: e.target.value })}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-white text-xs focus:outline-none focus:border-indigo-500"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-300">Phone Number</label>
                      <input
                        type="tel"
                        placeholder="10-digit number"
                        value={editForm.phone}
                        onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-white text-xs focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>

                  {/* Tier & Amount */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-300">Tier Name</label>
                      <input
                        type="text"
                        value={editForm.tier}
                        onChange={(e) => setEditForm({ ...editForm, tier: e.target.value })}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-white text-xs focus:outline-none focus:border-indigo-500"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-emerald-400 font-mono">Amount (₹)</label>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        required
                        value={editForm.amount}
                        onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-emerald-300 font-mono text-xs focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>

                  {/* Checkbox: Dispatch email immediately */}
                  <div className="pt-2 border-t border-slate-800/80">
                    <label className="flex items-center gap-2.5 text-xs text-slate-300 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={editForm.resendEmailNow}
                        onChange={(e) => setEditForm({ ...editForm, resendEmailNow: e.target.checked })}
                        className="rounded accent-indigo-600"
                      />
                      <span>Dispatch / Resend pass email to updated address immediately upon saving</span>
                    </label>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-between pt-3 border-t border-slate-800">
                    <button
                      type="button"
                      onClick={() => handleOpenDeleteModal(editingTicket)}
                      className="text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1.5 transition underline font-medium"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                      Delete Pass...
                    </button>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setIsEditModalOpen(false)}
                        className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-300 transition"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={isSubmittingEdit}
                        className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 font-bold text-xs text-white shadow-lg shadow-indigo-600/20 disabled:opacity-50 flex items-center gap-1.5 transition"
                      >
                        {isSubmittingEdit ? (
                          <span>Saving &amp; Updating...</span>
                        ) : (
                          <span>Save Changes {editForm.resendEmailNow ? "& Send Pass →" : ""}</span>
                        )}
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* 5C. DELETE PASS CONFIRMATION MODAL (PASSWORD: LOL)                        */}
          {/* ========================================================================= */}
          {deleteModalTicket && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in">
              <div className="relative w-full max-w-md rounded-2xl bg-[#0e0811] border border-rose-500/40 p-6 space-y-5 shadow-2xl text-left">
                {/* Header */}
                <div className="flex items-start justify-between border-b border-rose-950/60 pb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                      <span className="text-[10px] font-mono font-bold tracking-widest text-rose-400 uppercase">
                        CONFIRM DELETION
                      </span>
                    </div>
                    <h3 className="text-base font-bold text-white mt-1">
                      Delete Pass #{deleteModalTicket.ticket_number}?
                    </h3>
                    <p className="text-xs text-slate-400">
                      {deleteModalTicket.full_name} • {deleteModalTicket.email}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDeleteModalTicket(null)}
                    className="text-slate-400 hover:text-white p-1 text-base transition"
                  >
                    ✕
                  </button>
                </div>

                {/* Warning Callout */}
                <div className="p-3.5 rounded-xl bg-rose-950/60 border border-rose-500/30 text-rose-200 text-xs space-y-1">
                  <div className="flex items-center gap-2 font-bold text-rose-300">
                    <span>⚠️ Permanent Database Action</span>
                  </div>
                  <p className="text-[11px] text-rose-300/80 leading-relaxed">
                    This pass will be deleted permanently. Gate check-in for Pass #{deleteModalTicket.ticket_number} will become invalid.
                  </p>
                </div>

                {deleteError && (
                  <div className="p-3 rounded-xl bg-rose-950/80 border border-rose-500/50 text-rose-100 text-xs flex items-center gap-2 font-medium">
                    <span>🚫</span>
                    <span>{deleteError}</span>
                  </div>
                )}

                <form onSubmit={handleDeleteTicket} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                      <span>Authorization Password *</span>
                      <span className="text-[10px] font-mono text-rose-400 font-bold bg-rose-950/60 px-2 py-0.5 rounded border border-rose-800/40">
                        Password: LOL
                      </span>
                    </label>
                    <input
                      type="text"
                      required
                      autoFocus
                      placeholder="Type 'LOL' to confirm"
                      value={deletePasswordInput}
                      onChange={(e) => setDeletePasswordInput(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-rose-500/40 text-rose-200 font-mono font-bold tracking-widest text-center text-sm focus:outline-none focus:border-rose-400 placeholder:text-slate-600 placeholder:tracking-normal placeholder:font-normal"
                    />
                    <p className="text-[10px] text-slate-500 text-center">
                      Type the confirmation password <span className="font-mono text-rose-300 font-bold">LOL</span> to authorize this deletion.
                    </p>
                  </div>

                  <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                    <button
                      type="button"
                      onClick={() => setDeleteModalTicket(null)}
                      className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-300 transition"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isDeleting || deletePasswordInput.trim().toUpperCase() !== "LOL"}
                      className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 font-bold text-xs text-white shadow-lg shadow-rose-600/30 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 transition"
                    >
                      {isDeleting ? "Deleting Pass..." : "Permanently Delete Pass"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* 6. BULK IMPORT MODAL (EXCEL / CSV)                                        */}
          {/* ========================================================================= */}
          {isBulkModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-md animate-in fade-in overflow-y-auto">
              <div className="relative w-full max-w-2xl rounded-2xl bg-[#0d1022] border border-slate-800 p-5 sm:p-6 space-y-5 shadow-2xl text-left my-auto">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-slate-800 pb-3.5">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="p-1 rounded-lg bg-blue-500/10 text-blue-400 text-sm">📊</span>
                      <h3 className="text-base font-bold text-white">Bulk Participant Upload</h3>
                      <span className="px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 text-[10px] font-bold">
                        Excel / CSV
                      </span>
                    </div>
                    <p className="text-xs text-slate-400">
                      Upload an Excel spreadsheet or CSV with participant details. Sequential passes (#0001–#2000) will be assigned atomically.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (!isSubmittingBulk) {
                        setIsBulkModalOpen(false);
                        setBulkStep("upload");
                        setParsedAttendees([]);
                        setSelectedFileName(null);
                        setBulkError(null);
                      }
                    }}
                    className="text-slate-400 hover:text-white text-lg p-1 transition"
                  >
                    ✕
                  </button>
                </div>

                {bulkError && (
                  <div className="p-3 rounded-xl bg-rose-950/50 border border-rose-500/40 text-rose-200 text-xs flex items-start gap-2">
                    <span className="text-rose-400 mt-0.5 font-bold">⚠️</span>
                    <span className="flex-1">{bulkError}</span>
                  </div>
                )}

                {/* ------------------------------------------------------------- */}
                {/* STEP: UPLOAD                                                  */}
                {/* ------------------------------------------------------------- */}
                {bulkStep === "upload" && (
                  <div className="space-y-5">
                    {/* Step 1: Download Templates */}
                    <div className="rounded-xl bg-slate-900/80 border border-slate-800 p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="text-xs font-bold text-slate-200">Step 1: Download Pre-Formatted Template</h4>
                          <p className="text-[11px] text-slate-400">
                            Use this template with columns: <span className="text-slate-200 font-mono font-semibold">Full Name, Email Address, Phone Number</span>.
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2.5 pt-1">
                        <button
                          type="button"
                          onClick={() => handleDownloadTemplate("xlsx")}
                          className="px-3.5 py-2 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-emerald-300 font-semibold text-xs transition flex items-center gap-1.5"
                        >
                          <span>📥</span>
                          <span>Download Excel Template (.xlsx)</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDownloadTemplate("csv")}
                          className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 font-medium text-xs transition flex items-center gap-1.5"
                        >
                          <span>📄</span>
                          <span>Download CSV Template (.csv)</span>
                        </button>
                      </div>
                    </div>

                    {/* Step 2: File Upload Zone */}
                    <div className="space-y-2">
                      <h4 className="text-xs font-bold text-slate-200">Step 2: Upload Your Filled Spreadsheet</h4>
                      <div
                        onDragOver={(e) => {
                          e.preventDefault();
                          setIsDraggingFile(true);
                        }}
                        onDragLeave={() => setIsDraggingFile(false)}
                        onDrop={(e) => {
                          e.preventDefault();
                          setIsDraggingFile(false);
                          if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                            handleFileSelect(e.dataTransfer.files[0]);
                          }
                        }}
                        className={`relative rounded-2xl border-2 border-dashed p-6 sm:p-8 text-center transition cursor-pointer flex flex-col items-center justify-center space-y-3 ${
                          isDraggingFile
                            ? "border-blue-500 bg-blue-500/10"
                            : "border-slate-700 bg-slate-900/50 hover:border-slate-600 hover:bg-slate-900"
                        }`}
                        onClick={() => {
                          const input = document.getElementById("bulk-file-input") as HTMLInputElement;
                          if (input) input.click();
                        }}
                      >
                        <input
                          id="bulk-file-input"
                          type="file"
                          accept=".xlsx,.xls,.csv"
                          className="hidden"
                          onChange={(e) => {
                            if (e.target.files && e.target.files.length > 0) {
                              handleFileSelect(e.target.files[0]);
                            }
                          }}
                        />
                        <div className="w-12 h-12 rounded-full bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400 text-xl shadow-lg shadow-blue-500/10">
                          📁
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs sm:text-sm font-bold text-slate-200">
                            Click to select or drag and drop your spreadsheet here
                          </p>
                          <p className="text-[11px] text-slate-400">
                            Supported file formats: Microsoft Excel (<span className="text-blue-300 font-mono">.xlsx, .xls</span>) or CSV (<span className="text-blue-300 font-mono">.csv</span>)
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Step 3: Default Configuration */}
                    <div className="rounded-xl bg-slate-900/60 border border-slate-800 p-4 space-y-3">
                      <h4 className="text-xs font-bold text-slate-200">Step 3: Default Pass &amp; Entry Configuration</h4>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-xs font-semibold text-slate-300">Access Tier</label>
                          <input
                            type="text"
                            value={bulkTier}
                            onChange={(e) => setBulkTier(e.target.value)}
                            placeholder="e.g. Spot Entry Pass"
                            className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none focus:border-blue-500"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-semibold text-emerald-400 font-mono">
                            Amount per Pass (₹)
                          </label>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={bulkAmount}
                            onChange={(e) => setBulkAmount(e.target.value)}
                            className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-emerald-500/40 text-emerald-300 font-mono font-bold text-xs focus:outline-none focus:border-emerald-500"
                          />
                        </div>
                      </div>

                      {/* Tier Presets */}
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <span className="text-[11px] text-slate-400">Quick presets:</span>
                        {[
                          { label: "Spot Entry Pass", price: "349" },
                          { label: "Early Bird", price: String(currentTierSettings?.price || "349") },
                          { label: "Complimentary / Free Pass", price: "0" },
                        ].map((p) => (
                          <button
                            key={p.label}
                            type="button"
                            onClick={() => {
                              setBulkTier(p.label);
                              setBulkAmount(p.price);
                            }}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition ${
                              bulkTier === p.label
                                ? "bg-blue-600/25 border-blue-500 text-blue-200"
                                : "bg-slate-950 border-slate-800 text-slate-400 hover:text-white"
                            }`}
                          >
                            {p.label} (₹{p.price})
                          </button>
                        ))}
                      </div>

                      {/* Checkboxes */}
                      <div className="space-y-2 pt-2 border-t border-slate-800/80">
                        <label className="flex items-center gap-2.5 text-xs text-slate-300 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={bulkSendEmail}
                            onChange={(e) => setBulkSendEmail(e.target.checked)}
                            className="rounded accent-blue-600"
                          />
                          <span>
                            <strong className="text-white">Dispatch official EchoSphere digital pass</strong> to each attendee&apos;s email immediately
                          </span>
                        </label>
                        <label className="flex items-center gap-2.5 text-xs text-slate-300 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={bulkAdmitNow}
                            onChange={(e) => setBulkAdmitNow(e.target.checked)}
                            className="rounded accent-emerald-600"
                          />
                          <span>Immediately admit all attendees (Mark checked-in at gate)</span>
                        </label>
                      </div>
                    </div>
                  </div>
                )}

                {/* ------------------------------------------------------------- */}
                {/* STEP: PREVIEW                                                 */}
                {/* ------------------------------------------------------------- */}
                {bulkStep === "preview" && (
                  <div className="space-y-4">
                    {/* File & Validation Summary */}
                    <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl bg-slate-900 border border-slate-800">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">📄</span>
                        <div>
                          <p className="text-xs font-bold text-white truncate max-w-[240px] sm:max-w-md">
                            {selectedFileName}
                          </p>
                          <span className="text-[11px] text-slate-400">{selectedFileSize}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold font-mono">
                          {parsedAttendees.filter((a) => a.isValid).length} Valid
                        </span>
                        {parsedAttendees.some((a) => !a.isValid) && (
                          <span className="px-2.5 py-1 rounded-full bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-bold font-mono">
                            {parsedAttendees.filter((a) => !a.isValid).length} Invalid
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setBulkStep("upload");
                            setParsedAttendees([]);
                            setSelectedFileName(null);
                          }}
                          className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition"
                        >
                          Change File
                        </button>
                      </div>
                    </div>

                    {/* Import Options Summary Bar */}
                    <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2 rounded-xl bg-blue-950/30 border border-blue-500/20 text-xs">
                      <div className="flex items-center gap-2 text-blue-200">
                        <span>Tier: <strong className="text-white">{bulkTier}</strong></span>
                        <span>•</span>
                        <span>Price: <strong className="text-white">₹{bulkAmount}</strong></span>
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-slate-400">
                        <span>{bulkSendEmail ? "✅ Emails will be dispatched" : "⚠️ Emails suppressed"}</span>
                        <span>•</span>
                        <span>{bulkAdmitNow ? "✅ Auto-admit at gate" : "Pending gate check-in"}</span>
                      </div>
                    </div>

                    {/* Preview Table */}
                    <div className="rounded-xl border border-slate-800 overflow-hidden bg-slate-950/60 max-h-64 overflow-y-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead className="sticky top-0 bg-slate-900 border-b border-slate-800 text-[11px] font-mono uppercase text-slate-400">
                          <tr>
                            <th className="px-3 py-2">#</th>
                            <th className="px-3 py-2">Attendee Name</th>
                            <th className="px-3 py-2">Email Address</th>
                            <th className="px-3 py-2">Phone</th>
                            <th className="px-3 py-2 text-right">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60">
                          {parsedAttendees.map((att, idx) => (
                            <tr
                              key={`${att.email}-${idx}`}
                              className={`hover:bg-slate-900/40 transition ${
                                !att.isValid ? "bg-rose-950/20 text-rose-300" : ""
                              }`}
                            >
                              <td className="px-3 py-2 font-mono text-slate-500">{idx + 1}</td>
                              <td className="px-3 py-2 font-medium text-white">{att.fullName}</td>
                              <td className="px-3 py-2 text-slate-300 font-mono truncate max-w-[180px]">
                                {att.email}
                              </td>
                              <td className="px-3 py-2 font-mono text-slate-400">{att.phone}</td>
                              <td className="px-3 py-2 text-right">
                                {att.isValid ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-bold">
                                    <span>✓</span>
                                    <span>Ready</span>
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20 text-[10px] font-bold" title={att.validationError}>
                                    <span>✕</span>
                                    <span>{att.validationError || "Invalid"}</span>
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Capacity notice */}
                    {stats && (
                      <div className="flex items-center justify-between text-[11px] text-slate-400 px-1">
                        <span>
                          Available concert capacity: <strong className="text-white font-mono">{stats.available_tickets}</strong> passes remaining.
                        </span>
                        <span>
                          Next pass starting from: <strong className="text-indigo-300 font-mono">#{stats.next_ticket_id}</strong>
                        </span>
                      </div>
                    )}

                    {/* Preview Actions */}
                    <div className="flex justify-end gap-2.5 pt-2 border-t border-slate-800">
                      <button
                        type="button"
                        onClick={() => {
                          setBulkStep("upload");
                          setParsedAttendees([]);
                        }}
                        className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-300 transition"
                      >
                        Back
                      </button>
                      <button
                        type="button"
                        onClick={handleBulkSubmit}
                        disabled={isSubmittingBulk || parsedAttendees.filter((a) => a.isValid).length === 0}
                        className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 font-bold text-xs text-white shadow-lg shadow-indigo-600/30 transition disabled:opacity-50 flex items-center gap-2"
                      >
                        <span>🚀</span>
                        <span>
                          Issue {parsedAttendees.filter((a) => a.isValid).length} Passes &amp; Send Emails →
                        </span>
                      </button>
                    </div>
                  </div>
                )}

                {/* ------------------------------------------------------------- */}
                {/* STEP: IMPORTING                                               */}
                {/* ------------------------------------------------------------- */}
                {bulkStep === "importing" && (
                  <div className="py-12 flex flex-col items-center justify-center text-center space-y-4">
                    <div className="w-12 h-12 border-3 border-blue-500 border-t-transparent rounded-full animate-spin" />
                    <div className="space-y-1">
                      <h4 className="text-base font-bold text-white">
                        Generating Passes &amp; Delivering Emails...
                      </h4>
                      <p className="text-xs text-slate-400 max-w-sm">
                        Atomically assigning sequential pass numbers (#0001–#2000), computing SHA-256 security hashes, and dispatching official confirmation emails.
                      </p>
                    </div>
                  </div>
                )}

                {/* ------------------------------------------------------------- */}
                {/* STEP: SUCCESS                                                 */}
                {/* ------------------------------------------------------------- */}
                {bulkStep === "success" && bulkSuccessResult && (
                  <div className="py-4 space-y-5 text-center">
                    <div className="w-16 h-16 mx-auto rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center shadow-lg shadow-emerald-500/20 text-3xl">
                      🎉
                    </div>

                    <div className="space-y-1">
                      <h4 className="text-xl font-black text-white">
                        Successfully Created {bulkSuccessResult.count} Concert Passes!
                      </h4>
                      <p className="text-xs text-slate-300 max-w-md mx-auto">
                        {bulkSuccessResult.message}
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-3 max-w-md mx-auto text-left text-xs">
                      <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
                        <span className="text-[10px] uppercase text-slate-400 font-mono block">Pass ID Range</span>
                        <span className="text-lg font-mono font-bold text-indigo-300">
                          #{bulkSuccessResult.firstTicket} – #{bulkSuccessResult.lastTicket}
                        </span>
                      </div>
                      <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
                        <span className="text-[10px] uppercase text-slate-400 font-mono block">Email Delivery</span>
                        <span className="text-sm font-semibold text-emerald-400 flex items-center gap-1.5 pt-1">
                          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                          <span>Dispatched via SMTP</span>
                        </span>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-slate-800 flex justify-center">
                      <button
                        type="button"
                        onClick={() => {
                          setIsBulkModalOpen(false);
                          setBulkStep("upload");
                          setParsedAttendees([]);
                          setSelectedFileName(null);
                          setBulkSuccessResult(null);
                        }}
                        className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs uppercase tracking-wider transition shadow-lg shadow-indigo-600/30"
                      >
                        Done &amp; View Roster
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
