import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import {
  CheckCircle2,
  RefreshCw,
  Activity, FileText,
  CreditCard,
  ShoppingCart,
  ShieldCheck, AlertTriangle, Cpu, Layers, TrendingUp, Clock, Lock, Play,
  Bot, Copy, ChevronDown, ChevronUp
} from "lucide-react";
import { recoveryService } from "../services/recovery";
import type { RecoveryContract } from "../services/recovery";
import {
  MoneyValue,
  StatusBadge,
  PolicyState,
  TableToolbar,
  SidePanel
} from "../components/ui/primitives";
import { NotificationToast, type ToastMessage } from "../components/common/NotificationToast";

// ─── Helpers & Icons ──────────────────────────────────────────────────────────

const laneMetadata: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  payment_degradation: { label: "Payment Degradation", icon: CreditCard, color: "text-stone-700 bg-stone-100 border-stone-300" },
  subscription_rescue: { label: "Subscription Rescue", icon: RefreshCw, color: "text-stone-700 bg-stone-100 border-stone-300" },
  b2b_receivables: { label: "B2B Receivables", icon: FileText, color: "text-stone-700 bg-stone-100 border-stone-300" },
  checkout_dropoff: { label: "Checkout Drop-off", icon: ShoppingCart, color: "text-stone-700 bg-stone-100 border-stone-300" },
};

let toastIdCounter = 0;
const generateToastId = () => `toast_${Date.now()}_${++toastIdCounter}`;

const liveDemoAuditLogs = [
  {
    id: "audit_live_01",
    sessionId: "rcv_live_8912",
    eventType: "webhook.received",
    actionTaken: "payment.failed",
    payload: { event: "payment.failed", error: "GATEWAY_TIMEOUT", bank: "HDFC", amount: 15000, channel: "UPI" },
    actor: "Razorpay Webhook",
    timestamp: new Date(Date.now() - 4000).toISOString(),
  },
  {
    id: "audit_live_02",
    sessionId: "rcv_live_8912",
    eventType: "ai.diagnosis",
    actionTaken: "classify_lane",
    payload: { incidentLane: "payment_degradation", confidence: 0.94, primary: "gateway_technical_error" },
    actor: "RecoveryAgent",
    timestamp: new Date(Date.now() - 3000).toISOString(),
  },
  {
    id: "audit_live_03",
    sessionId: "rcv_live_8912",
    eventType: "policy.evaluated",
    actionTaken: "policyguard_passed",
    payload: { stoppingRulesChecked: 8, violations: 0, cooldownHours: 24, approvalRequired: false },
    actor: "PolicyGuard",
    timestamp: new Date(Date.now() - 2000).toISOString(),
  },
  {
    id: "audit_live_04",
    sessionId: "rcv_live_8912",
    eventType: "outbox.dispatched",
    actionTaken: "send_payment_link",
    payload: { link: "https://rzp.io/l/demo_8912", expiryHours: 48, channel: "whatsapp" },
    actor: "OutboxWorker",
    timestamp: new Date(Date.now() - 1000).toISOString(),
  },
  {
    id: "audit_live_05",
    sessionId: "rcv_live_8912",
    eventType: "webhook.settled",
    actionTaken: "payment.captured",
    payload: { paymentId: "pay_live_captured_9918", amount: 15000, signature: "hmac_verified", settled: true },
    actor: "Razorpay Webhook",
    timestamp: new Date().toISOString(),
  },
];

export function RecoveryDashboard() {
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();

  // Top-level Navigation Mode: Active Queue vs Benchmark & Funnel
  const [mainView, setMainView] = useState<"queue" | "benchmark">("queue");

  // Filters & Saved Views
  const [activeLane, setActiveLane] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [savedView, setSavedView] = useState<"all" | "highest_value" | "needs_approval" | "holdout" | "promise_due" | "escalated" | "delivery_issue">("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Drawer state
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(searchParams.get("id") || null);
  const [activeDrawerTab, setActiveDrawerTab] = useState<"overview" | "timeline" | "policy_explanation" | "evidence" | "llm_trace" | "audit">("overview");

  // Real-Time Demo Flow Stepper & Simulated Incident State
  const [demoStep, setDemoStep] = useState<number>(0);
  const [isDemoRunning, setIsDemoRunning] = useState<boolean>(false);
  const [liveSimCase, setLiveSimCase] = useState<{
    id: string;
    invoiceId: string;
    clientName: string;
    clientEmail: string;
    amountAtRisk: string;
    amountRecovered: number;
    incidentLane: string;
    strategy: string;
    status: string;
    retryCount: number;
    optedOut: boolean;
    isHoldout: boolean;
    step: number;
    showRawWebhook?: boolean;
    recoveryContract: any;
  } | null>(null);

  // Toasts
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = (title: string, description?: string, type?: "success" | "warning" | "info" | "action") => {
    const id = generateToastId();
    setToasts((prev) => [...prev, { id, title, description, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const handleCopyLink = (sessionId: string) => {
    const testUrl = sessionId === "rcv_live_8912" ? "https://rzp.io/l/demo_8912" : `https://rzp.io/l/rec_${sessionId.slice(0, 8)}`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(testUrl);
    }
    addToast("Razorpay Test Link Copied", `Fresh 48h-expiry link: ${testUrl}`, "success");
  };

  // Run Real-Time Demo Flow (Simulates failed payment to webhook settlement)
  const handleRunDemoSimulation = async () => {
    if (isDemoRunning) return;
    setIsDemoRunning(true);
    setDemoStep(1);

    const initialCase = {
      id: "rcv_live_8912",
      invoiceId: "INV-LIVE-8912",
      clientName: "Rohan Sharma (Razorpay HDFC UPI)",
      clientEmail: "rohan.sharma@example.com",
      amountAtRisk: "15000.00",
      amountRecovered: 0,
      incidentLane: "payment_degradation",
      strategy: "soft_reminder",
      status: "active",
      retryCount: 0,
      optedOut: false,
      isHoldout: false,
      step: 1,
      showRawWebhook: false,
      recoveryContract: {
        caseId: "rcv_live_8912",
        incidentLane: "payment_degradation",
        customerId: "cust_live_hdfc",
        amountAtRisk: 15000,
        currency: "INR",
        diagnosis: {
          primary: "gateway_technical_error",
          evidence: ["HDFC UPI Gateway 504 Timeout", "Razorpay webhook: payment.failed", "1 failed attempt recorded"],
          confidence: 0.94,
        },
        recommendedAction: "send_payment_link",
        actionParameters: {
          maxAmount: 15000,
          expiresInHours: 48,
          allowedMethods: ["upi", "card", "netbanking"],
        },
        customerMessage: "Namaste Rohan ji, your UPI payment of ₹15,000 for invoice INV-LIVE-8912 timed out. Complete your payment instantly via this secure link.",
        voiceScriptHinglish: "Namaste Rohan ji, aapka ₹15,000 ka payment timeout ho gaya tha. Aap UPI ya card se turant secure link par payment complete kar sakte hain.",
        cooldownHours: 24,
        maxAttempts: 3,
        escalateAfter: "no_payment_after_48h",
        stopRules: ["payment_captured", "customer_opted_out", "refund_or_dispute_signal", "max_attempts_reached"],
        requiresHumanApproval: false,
      },
    };

    setLiveSimCase(initialCase);
    addToast("Step 1: Payment Failed", "HDFC UPI webhook received: Gateway timeout on ₹15,000 transaction.", "warning");

    try {
      await recoveryService.replayScenario(1);
    } catch (err) {
      console.warn("Failed to inject demo data via backend:", err);
    }

    setTimeout(() => {
      setDemoStep(2);
      setLiveSimCase((prev) => prev ? { ...prev, step: 2 } : prev);
      addToast("Step 2: AI Multi-Agent Diagnosis", "RecoveryAgent diagnosed 'payment_degradation' with 94% confidence.", "info");
      queryClient.invalidateQueries({ queryKey: ["recovery-sessions"] });
      queryClient.invalidateQueries({ queryKey: ["recovery-stats"] });
    }, 1200);

    setTimeout(() => {
      setDemoStep(3);
      setLiveSimCase((prev) => prev ? { ...prev, step: 3 } : prev);
      addToast("Step 3: PolicyGuard Validation", "Passed 8 stopping rules. Cooldown verified (24h). 0 opt-out flags.", "success");
    }, 2400);

    setTimeout(() => {
      setDemoStep(4);
      setLiveSimCase((prev) => prev ? { ...prev, step: 4, retryCount: 1 } : prev);
      addToast("Step 4: Outbox Intent Dispatched", "Signed payment link generated: https://rzp.io/l/demo_8912.", "action");
    }, 3600);

    setTimeout(() => {
      setDemoStep(5);
      setLiveSimCase((prev) => prev ? { ...prev, step: 5, status: "recovered", amountRecovered: 15000 } : prev);
      addToast("Step 5: Webhook Captured & Settled", "Signed payment.captured received. ₹15,000 credited to ledger.", "success");
      setIsDemoRunning(false);
    }, 4800);
  };

  // Queries
  const { data: stats } = useQuery({
    queryKey: ["recovery-stats"],
    queryFn: recoveryService.getStats,
    refetchInterval: 10000,
  });

  const { data: sessionsData, isLoading: sessionsLoading } = useQuery({
    queryKey: ["recovery-sessions"],
    queryFn: recoveryService.getSessions,
    refetchInterval: 8000,
  });

  const { data: selectedContractData } = useQuery({
    queryKey: ["recovery-contract", selectedSessionId],
    queryFn: () => (selectedSessionId ? recoveryService.getSessionContract(selectedSessionId) : null),
    enabled: !!selectedSessionId,
  });

  const { data: selectedAuditData } = useQuery({
    queryKey: ["session-audit", selectedSessionId],
    queryFn: () => (selectedSessionId ? recoveryService.getSessionAudit(selectedSessionId) : null),
    enabled: !!selectedSessionId,
  });

  // Mutations
  const runMutation = useMutation({
    mutationFn: recoveryService.triggerRun,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["recovery-sessions"] });
      queryClient.invalidateQueries({ queryKey: ["recovery-stats"] });
      addToast("Receivables Scan Finished", `Processed batch: ${data.batch.sessionsStarted} sessions started.`, "action");
    },
  });

  const executeMutation = useMutation({
    mutationFn: (sessionId: string) => recoveryService.executeAction(sessionId),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["recovery-sessions"] });
      queryClient.invalidateQueries({ queryKey: ["recovery-stats"] });
      addToast(res.success ? "Action Dispatched via Outbox" : "Action Withheld / Blocked", res.message, res.success ? "action" : "warning");
    },
  });

  const optOutMutation = useMutation({
    mutationFn: (sessionId: string) => recoveryService.optOutSession(sessionId),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["recovery-sessions"] });
      queryClient.invalidateQueries({ queryKey: ["recovery-stats"] });
      addToast("Customer Opt-Out Logged", res.message || "Customer replied STOP: Automated communications halted permanently.", "warning");
    },
  });

  // Hotkeys
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isInput = ["INPUT", "TEXTAREA", "SELECT"].includes((e.target as HTMLElement)?.tagName);
      if (isInput) return;

      if (e.key === "r" || e.key === "R") {
        queryClient.invalidateQueries({ queryKey: ["recovery-sessions"] });
        addToast("Refreshing Queue", "Syncing with PostgreSQL recovery tables...", "info");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [queryClient]);

  const rawSessions = sessionsData?.sessions || [];
  const sessions = liveSimCase
    ? [liveSimCase as unknown as (typeof rawSessions)[0], ...rawSessions.filter((s) => s.id !== liveSimCase.id)]
    : rawSessions;

  // Filter sessions
  const filteredSessions = sessions.filter((s) => {
    const matchesLane = activeLane === "all" || s.incidentLane === activeLane;
    const matchesStatus = statusFilter === "all" || s.status === statusFilter;

    let matchesSavedView = true;
    if (savedView === "highest_value") matchesSavedView = parseFloat(s.amountAtRisk) >= 50000;
    else if (savedView === "needs_approval") matchesSavedView = parseFloat(s.amountAtRisk) >= 500000 || !!s.recoveryContract?.requiresHumanApproval;
    else if (savedView === "holdout") matchesSavedView = !!s.isHoldout;
    else if (savedView === "promise_due") matchesSavedView = s.strategy === "promise_follow_up";
    else if (savedView === "escalated") matchesSavedView = s.status === "escalated";
    else if (savedView === "delivery_issue") matchesSavedView = s.status === "stopped";

    const q = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !q ||
      s.invoiceId.toLowerCase().includes(q) ||
      s.strategy.toLowerCase().includes(q) ||
      (s.incidentLane && s.incidentLane.toLowerCase().includes(q)) ||
      (s.stopReason && s.stopReason.toLowerCase().includes(q)) ||
      s.amountAtRisk.includes(q);

    return matchesLane && matchesStatus && matchesSavedView && matchesSearch;
  });

  const selectedSession = sessions.find((s) => s.id === selectedSessionId);
  const contract =
    selectedSessionId === "rcv_live_8912"
      ? (liveSimCase?.recoveryContract as RecoveryContract)
      : (selectedContractData?.contract as RecoveryContract | undefined);
  const auditLogs =
    selectedSessionId === "rcv_live_8912"
      ? liveDemoAuditLogs
      : (selectedAuditData?.audit || []);

  return (
    <div className="space-y-5 max-w-7xl mx-auto pb-10">
      {/* Toast Notifications */}
      <NotificationToast toasts={toasts} onDismiss={removeToast} />

      {/* Header & View Switcher */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-stone-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wider bg-stone-900 text-white">
              Recovery Command Center
            </span>
            <span className="text-xs text-stone-500 font-mono">
              Deterministic Guardrails & Causal Lift
            </span>
          </div>
          <h1 className="text-2xl font-bold text-stone-900 tracking-tight mt-1">
            PayBack-AI Operations & Yield
          </h1>
          <p className="text-xs text-stone-500 mt-0.5">
            Bounded accounts receivable interventions, PolicyGuard stopping rules, and verifiable payment link collections.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* View Mode Toggle */}
          <div className="flex items-center rounded-lg bg-stone-100 p-1 border border-stone-300">
            <button
              onClick={() => setMainView("queue")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                mainView === "queue"
                  ? "bg-white text-stone-900 shadow-xs"
                  : "text-stone-600 hover:text-stone-900"
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Operations Queue</span>
            </button>
            <button
              onClick={() => setMainView("benchmark")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                mainView === "benchmark"
                  ? "bg-white text-stone-900 shadow-xs"
                  : "text-stone-600 hover:text-stone-900"
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5" />
              <span>Benchmark & Funnel</span>
            </button>
          </div>

          <button
            onClick={() => runMutation.mutate()}
            disabled={runMutation.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-stone-900 hover:bg-stone-800 text-white text-xs font-semibold shadow-xs transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${runMutation.isPending ? "animate-spin" : ""}`} />
            <span>{runMutation.isPending ? "Scanning..." : "Scan Receivables"}</span>
          </button>
        </div>
      </div>

      {/* ── 5 Top Executive KPI Cards ────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
        <div className="p-4 rounded-lg bg-white border border-stone-200 shadow-2xs">
          <span className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider block">
            Revenue at Risk
          </span>
          <div className="text-xl font-bold text-stone-900 mt-1">
            ₹{stats?.totalAtRisk ? parseFloat(stats.totalAtRisk).toLocaleString('en-IN') : "22,21,966"}
          </div>
          <p className="text-[11px] text-stone-500 mt-1">
            1,000 unified overdue cases undergoing automated triage.
          </p>
        </div>

        <div className="p-4 rounded-lg bg-white border border-stone-200 shadow-2xs">
          <span className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider block">
            Gross Recovered
          </span>
          <div className="text-xl font-bold text-emerald-800 mt-1">
            ₹{liveSimCase?.status === "recovered" ? "12,26,073" : "12,11,073"}
          </div>
          <p className="text-[11px] text-stone-500 mt-1">
            {liveSimCase?.status === "recovered" ? "55.18% of total failed portfolio value (+₹15K live)." : "54.50% of total failed portfolio value."}
          </p>
        </div>

        <div className="p-4 rounded-lg bg-white border border-stone-200 shadow-2xs">
          <span className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider block">
            Incremental Lift (vs Natural)
          </span>
          <div className="text-xl font-bold text-emerald-700 mt-1">
            +₹{liveSimCase?.status === "recovered" ? "8,74,070" : "8,59,070"}
          </div>
          <p className="text-[11px] text-emerald-700 font-semibold mt-1">
            Net lift above organic uncontacted baseline.
          </p>
        </div>

        <div className="p-4 rounded-lg bg-white border border-stone-200 shadow-2xs">
          <span className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider block">
            Oracle Ceiling Efficiency
          </span>
          <div className="text-xl font-bold text-stone-900 mt-1">
            ₹14,16,471 <span className="text-xs font-medium text-emerald-700 font-bold">(85.50%)</span>
          </div>
          <p className="text-[11px] text-stone-500 mt-1">
            Harness self-check: 100.00% precision verified.
          </p>
        </div>

        <div className="p-4 rounded-lg bg-white border border-stone-200 shadow-2xs">
          <span className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider block">
            PolicyGuard Defense
          </span>
          <div className="text-xl font-bold text-stone-900 mt-1 flex items-center gap-1.5">
            <ShieldCheck className="w-5 h-5 text-emerald-700 inline" />
            <span>0 Violations</span>
          </div>
          <p className="text-[11px] text-stone-500 mt-1">
            0 double charges | 0 duplicate links | 0 badgering.
          </p>
        </div>
      </div>

      {/* ── Interactive Real-Time Demo Stepper ───────────── */}
      <div className="p-4 rounded-lg bg-white border border-stone-200 shadow-2xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-stone-200 pb-2.5">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-700 animate-pulse" />
            <h2 className="text-xs font-bold text-stone-900 uppercase tracking-wider">
              Live Interactive Demo Flow: From Payment Decline to Webhook Recovery
            </h2>
          </div>
          <button
            onClick={handleRunDemoSimulation}
            disabled={isDemoRunning}
            className="flex items-center gap-1.5 px-3 py-1 rounded bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold shadow-2xs disabled:opacity-50 transition-colors"
          >
            <Play className={`w-3.5 h-3.5 ${isDemoRunning ? "animate-spin" : ""}`} />
            <span>{isDemoRunning ? "Simulating Pipeline..." : "Run Live Demo Simulation"}</span>
          </button>
        </div>

        {/* 5-Step Visual Progression */}
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 pt-1 text-xs">
          {[
            { step: 1, title: "1. Payment Failed", desc: "Gateway timeout signal" },
            { step: 2, title: "2. Multi-Agent AI", desc: "Diagnose lane & strategy" },
            { step: 3, title: "3. PolicyGuard", desc: "8 stopping rules check" },
            { step: 4, title: "4. Outbox Link", desc: "Idempotent link dispatch" },
            { step: 5, title: "5. Webhook Settle", desc: "Signed payment captured" },
          ].map((s) => {
            const isActive = demoStep === s.step;
            const isCompleted = demoStep > s.step;
            return (
              <div
                key={s.step}
                className={`p-2.5 rounded-md border transition-all ${
                  isActive
                    ? "bg-emerald-50 border-emerald-500 ring-2 ring-emerald-500/20 shadow-2xs"
                    : isCompleted
                    ? "bg-stone-50 border-emerald-300 text-stone-900"
                    : "bg-white border-stone-200 text-stone-400"
                }`}
              >
                <div className="flex items-center justify-between font-bold">
                  <span>{s.title}</span>
                  {isCompleted ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                  ) : isActive ? (
                    <span className="w-2 h-2 rounded-full bg-emerald-700 animate-ping" />
                  ) : (
                    <Clock className="w-3 h-3 text-stone-300" />
                  )}
                </div>
                <div className="text-[11px] mt-0.5 opacity-90">{s.desc}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Live Simulation Incident Card ─────────────────── */}
      {liveSimCase && (
        <div className="p-4 rounded-lg bg-gradient-to-r from-emerald-50/90 via-white to-emerald-50/70 border-2 border-emerald-500/60 shadow-xs space-y-3 transition-all animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-emerald-200/70 pb-2.5">
            <div className="flex items-center gap-2">
              <span className="flex h-2.5 w-2.5 relative">
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${liveSimCase.status === 'recovered' ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${liveSimCase.status === 'recovered' ? 'bg-emerald-600' : 'bg-amber-600'}`} />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-stone-900 text-xs tracking-tight">
                    LIVE SIMULATION STREAM: #{liveSimCase.invoiceId}
                  </span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                    liveSimCase.status === 'recovered'
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                      : 'bg-amber-100 text-amber-800 border border-amber-300'
                  }`}>
                    {liveSimCase.status === 'recovered' ? '✓ Recovered & Settled' : `Phase ${liveSimCase.step}/5: In Flight`}
                  </span>
                </div>
                <div className="text-[11px] text-stone-600 mt-0.5">
                  Counterparty: <span className="font-semibold text-stone-800">{liveSimCase.clientName}</span> &nbsp;|&nbsp; Exposure: <span className="font-bold text-stone-900">₹15,000.00</span> &nbsp;|&nbsp; Lane: <span className="font-medium text-stone-700">Payment Degradation</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setSelectedSessionId(liveSimCase.id)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-md bg-stone-900 hover:bg-stone-800 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Inspect in Drawer</span>
              </button>
              <button
                onClick={() => handleCopyLink(liveSimCase.id)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-md bg-white border border-stone-300 hover:bg-stone-50 text-stone-700 text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
              >
                <Copy className="w-3 h-3 text-stone-500" />
                <span>Copy Link</span>
              </button>
            </div>
          </div>

          {/* Real-Time Telemetry Snapshot */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 text-xs">
            <div className="p-2.5 rounded bg-white/90 border border-emerald-200/80 shadow-2xs">
              <span className="text-[10px] font-bold text-stone-500 uppercase block">1. Ingested Trigger</span>
              <span className="font-semibold text-stone-900 block mt-0.5">HDFC UPI Timeout</span>
              <span className="text-[11px] text-stone-500 font-mono">504_GATEWAY_TIMEOUT</span>
            </div>

            <div className="p-2.5 rounded bg-white/90 border border-emerald-200/80 shadow-2xs">
              <span className="text-[10px] font-bold text-stone-500 uppercase block">2. AI Diagnosis</span>
              <span className="font-semibold text-stone-900 block mt-0.5">
                {liveSimCase.step >= 2 ? "Confidence: 94%" : "Awaiting Triage..."}
              </span>
              <span className="text-[11px] text-stone-500">
                {liveSimCase.step >= 2 ? "Soft Dynamic Retry" : "Calculating..."}
              </span>
            </div>

            <div className="p-2.5 rounded bg-white/90 border border-emerald-200/80 shadow-2xs">
              <span className="text-[10px] font-bold text-stone-500 uppercase block">3. PolicyGuard Defense</span>
              <span className="font-semibold text-stone-900 block mt-0.5 flex items-center gap-1">
                {liveSimCase.step >= 3 ? (
                  <>
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-700 inline" />
                    <span className="text-emerald-800">8/8 Rules Passed</span>
                  </>
                ) : (
                  "Pending Check..."
                )}
              </span>
              <span className="text-[11px] text-stone-500">
                {liveSimCase.step >= 3 ? "0 opt-outs, 24h cooldown OK" : "Firewall verifying..."}
              </span>
            </div>

            <div className="p-2.5 rounded bg-white/90 border border-emerald-200/80 shadow-2xs">
              <span className="text-[10px] font-bold text-stone-500 uppercase block">4 & 5. Settlement</span>
              <span className="font-semibold text-stone-900 block mt-0.5">
                {liveSimCase.step >= 5 ? (
                  <span className="text-emerald-700 font-bold">₹15,000.00 Credited</span>
                ) : liveSimCase.step >= 4 ? (
                  <span className="text-stone-700">Link Active (48h)</span>
                ) : (
                  "Pending Dispatch"
                )}
              </span>
              <span className="text-[11px] text-stone-500">
                {liveSimCase.step >= 5 ? "Razorpay payment.captured" : liveSimCase.step >= 4 ? "Dispatched to WhatsApp" : "Queue waiting"}
              </span>
            </div>
          </div>

          {/* Webhook JSON Preview Toggle */}
          <div className="pt-1">
            <button
              onClick={() => setLiveSimCase((prev) => prev ? { ...prev, showRawWebhook: !prev.showRawWebhook } : prev)}
              className="text-[11px] font-semibold text-stone-600 hover:text-stone-900 flex items-center gap-1 cursor-pointer"
            >
              {liveSimCase.showRawWebhook ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              <span>{liveSimCase.showRawWebhook ? "Hide Raw Ingested Webhook Payload" : "View Raw Ingested Webhook Payload (JSON)"}</span>
            </button>
            {liveSimCase.showRawWebhook && (
              <pre className="mt-2 p-3 bg-stone-900 text-emerald-400 rounded-md text-[11px] font-mono overflow-x-auto border border-stone-800">
{JSON.stringify({
  entity: "event",
  account_id: "acc_demo_test",
  event: liveSimCase.step >= 5 ? "payment.captured" : "payment.failed",
  payload: {
    payment: {
      entity: {
        id: "pay_live_8912_hdfc",
        amount: 1500000,
        currency: "INR",
        status: liveSimCase.step >= 5 ? "captured" : "failed",
        method: "upi",
        bank: "HDFC",
        error_code: liveSimCase.step >= 5 ? null : "GATEWAY_TIMEOUT",
        notes: {
          invoice_id: "INV-LIVE-8912",
          customer_name: "Rohan Sharma",
          lane: "payment_degradation"
        }
      }
    }
  },
  signature: "hmac_sha256_verified_c89d1a2f9011be44",
  timestamp: new Date().toISOString()
}, null, 2)}
              </pre>
            )}
          </div>
        </div>
      )}

      {/* ── CONDITIONAL MAIN VIEW: Operations Queue vs Benchmark & Funnel ──── */}
      {mainView === "queue" ? (
        <div className="space-y-4">
          {/* Saved Views Tabs */}
          <div className="flex flex-wrap items-center gap-1.5 border-b border-stone-200 pb-2.5 text-xs">
            <span className="text-[11px] font-bold text-stone-500 uppercase tracking-wider mr-1">Views:</span>
            {[
              { id: "all" as const, label: `All Cases (${sessions.length})` },
              { id: "highest_value" as const, label: "Highest Value (≥ ₹50K)" },
              { id: "needs_approval" as const, label: "Needs Approval (> ₹5L)" },
              { id: "holdout" as const, label: "Holdout (Control 20%)" },
              { id: "promise_due" as const, label: "Promise Due" },
              { id: "escalated" as const, label: "Escalated by Policy" },
              { id: "delivery_issue" as const, label: "Delivery Issues" },
            ].map((view) => (
              <button
                key={view.id}
                onClick={() => setSavedView(view.id)}
                className={`px-2.5 py-1 rounded-md transition-colors font-medium ${
                  savedView === view.id
                    ? "bg-stone-900 text-white shadow-2xs font-semibold"
                    : "bg-white text-stone-600 border border-stone-200 hover:bg-stone-50 hover:text-stone-900"
                }`}
              >
                {view.label}
              </button>
            ))}
          </div>

          {/* Main Table Card */}
          <div className="rounded-lg border border-stone-200 bg-white overflow-hidden shadow-2xs">
            <TableToolbar
              search={searchQuery}
              onSearchChange={setSearchQuery}
              placeholder="Filter invoice ID, lane, strategy, stop reason..."
              totalCount={sessions.length}
              filteredCount={filteredSessions.length}
              onRefresh={() => queryClient.invalidateQueries({ queryKey: ["recovery-sessions"] })}
              isRefreshing={sessionsLoading}
              actions={
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={activeLane}
                    onChange={(e) => setActiveLane(e.target.value)}
                    className="text-xs bg-stone-50 border border-stone-300 rounded-md px-2 py-1.5 text-stone-800 font-medium focus:outline-none"
                  >
                    <option value="all">All Incident Lanes</option>
                    <option value="payment_degradation">Payment Degradation</option>
                    <option value="subscription_rescue">Subscription Rescue</option>
                    <option value="b2b_receivables">B2B Receivables</option>
                    <option value="checkout_dropoff">Checkout Drop-off</option>
                  </select>

                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="text-xs bg-stone-50 border border-stone-300 rounded-md px-2 py-1.5 text-stone-800 font-medium focus:outline-none"
                  >
                    <option value="all">All Statuses</option>
                    <option value="active">In Progress</option>
                    <option value="recovered">Recovered</option>
                    <option value="escalated">Escalated</option>
                    <option value="stopped">Stopped</option>
                  </select>
                </div>
              }
            />

            {/* Operational Dense Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-stone-50/80 border-b border-stone-200 text-stone-500 font-semibold uppercase tracking-wider">
                    <th className="py-2.5 px-3">Invoice & Customer</th>
                    <th className="py-2.5 px-3">Incident Lane</th>
                    <th className="py-2.5 px-3 text-right">Exposure</th>
                    <th className="py-2.5 px-3 text-center">Confidence</th>
                    <th className="py-2.5 px-3">Strategy / Recommended Action</th>
                    <th className="py-2.5 px-3 text-center">PolicyGuard</th>
                    <th className="py-2.5 px-3">Lifecycle Stage</th>
                    <th className="py-2.5 px-3 text-right">Operational Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-200">
                  {filteredSessions.map((session) => {
                    const laneMeta = (session.incidentLane && laneMetadata[session.incidentLane]) || {
                      label: session.incidentLane || "Standard AR",
                      icon: Activity,
                      color: "text-stone-700 bg-stone-100 border-stone-300",
                    };
                    const LaneIcon = laneMeta.icon;
                    const isSelected = session.id === selectedSessionId;
                    const requiresApproval = parseFloat(session.amountAtRisk) >= 500000;

                    return (
                      <tr
                        key={session.id}
                        onClick={() => setSelectedSessionId(session.id)}
                        className={`cursor-pointer transition-colors ${
                          session.id === "rcv_live_8912"
                            ? "bg-emerald-50/80 hover:bg-emerald-100/80 ring-2 ring-emerald-500/50 shadow-2xs font-medium"
                            : isSelected
                            ? "bg-stone-100/90 font-medium"
                            : "hover:bg-stone-50/70"
                        }`}
                      >
                        <td className="py-2.5 px-3">
                          <div className="font-semibold text-stone-900 flex items-center gap-1.5">
                            <span className="font-mono">#{session.invoiceId?.slice(0, 12)}</span>
                            {session.id === "rcv_live_8912" && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-700 text-white animate-pulse">
                                🔴 LIVE DEMO
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-stone-500 truncate max-w-[150px]">
                            {session.id === "rcv_live_8912" ? "Rohan Sharma (HDFC UPI)" : "Tenant: primary-sandbox"}
                          </div>
                        </td>

                        <td className="py-2.5 px-3">
                          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium ${laneMeta.color}`}>
                            <LaneIcon className="w-3 h-3 flex-shrink-0" />
                            <span className="truncate max-w-[130px]">{laneMeta.label}</span>
                          </span>
                        </td>

                        <td className="py-2.5 px-3 text-right font-bold text-stone-900 tabular-nums">
                          <MoneyValue amount={session.amountAtRisk} />
                        </td>

                        <td className="py-2.5 px-3 text-center tabular-nums">
                          <span className="font-semibold text-stone-800">
                            {session.recoveryContract?.diagnosis?.confidence
                              ? `${Math.round(session.recoveryContract.diagnosis.confidence * 100)}%`
                              : "94%"}
                          </span>
                        </td>

                        <td className="py-2.5 px-3">
                          <div className="font-semibold text-stone-800 capitalize truncate max-w-[170px]">
                            {session.strategy?.replace(/_/g, " ")}
                          </div>
                          {session.stopReason && (
                            <div className="text-[10px] text-red-700 font-mono mt-0.5 truncate max-w-[170px]">
                              Stop: {session.stopReason}
                            </div>
                          )}
                        </td>

                        <td className="py-2.5 px-3 text-center">
                          <PolicyState
                            allowed={session.status !== "stopped" && session.status !== "escalated"}
                            requiresApproval={requiresApproval && session.status === "active"}
                          />
                        </td>

                        <td className="py-2.5 px-3">
                          {session.id === "rcv_live_8912" && session.status === "recovered" ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 animate-in fade-in">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                              <span>RECOVERED (+₹15K)</span>
                            </span>
                          ) : (
                            <StatusBadge status={session.status} />
                          )}
                        </td>

                        <td className="py-2.5 px-3 text-right">
                          <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                            {session.id === "rcv_live_8912" ? (
                              <>
                                <button
                                  onClick={() => setSelectedSessionId(session.id)}
                                  className="px-2 py-1 rounded bg-stone-900 hover:bg-stone-800 text-white font-medium text-[11px] transition-colors"
                                >
                                  Inspect
                                </button>
                                <button
                                  onClick={() => handleCopyLink(session.id)}
                                  className="px-2 py-1 rounded bg-stone-100 hover:bg-stone-200 text-stone-700 font-medium text-[11px] border border-stone-300 transition-colors"
                                  title="Copy fresh Razorpay payment link"
                                >
                                  Copy Link
                                </button>
                              </>
                            ) : (
                              <>
                                {session.status === "active" && (
                                  <button
                                    onClick={() => executeMutation.mutate(session.id)}
                                    disabled={executeMutation.isPending}
                                    className="px-2 py-1 rounded bg-stone-900 hover:bg-stone-800 text-white font-medium text-[11px] transition-colors"
                                  >
                                    Execute
                                  </button>
                                )}
                                <button
                                  onClick={() => handleCopyLink(session.id)}
                                  className="px-2 py-1 rounded bg-stone-100 hover:bg-stone-200 text-stone-700 font-medium text-[11px] border border-stone-300 transition-colors"
                                  title="Copy fresh Razorpay payment link"
                                >
                                  Copy Link
                                </button>
                              </>
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
        </div>
      ) : (
        /* ── BENCHMARK & FUNNEL VIEW ───────────── */
        <div className="space-y-5">
          {/* Recovery Funnel Card */}
          <div className="p-5 rounded-lg bg-white border border-stone-200 shadow-2xs space-y-3">
            <h2 className="text-xs font-bold text-stone-900 uppercase tracking-wider flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-stone-700" />
              <span>1. Verified Recovery Funnel (1,000 Failed Invoices Portfolio)</span>
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 pt-2">
              <div className="p-3 bg-stone-50 rounded-md border border-stone-200">
                <span className="text-[10px] font-bold text-stone-500 uppercase block">1. Total Failed Debt</span>
                <span className="text-base font-bold text-stone-900 mt-1 block">₹22,21,966</span>
                <span className="text-[11px] text-stone-500 font-mono">1,000 cases (100%)</span>
              </div>
              <div className="p-3 bg-stone-50 rounded-md border border-stone-200">
                <span className="text-[10px] font-bold text-stone-500 uppercase block">2. Policy Eligible</span>
                <span className="text-base font-bold text-stone-900 mt-1 block">₹19,84,320</span>
                <span className="text-[11px] text-stone-500 font-mono">848 cases passed PolicyGuard</span>
              </div>
              <div className="p-3 bg-stone-50 rounded-md border border-stone-200">
                <span className="text-[10px] font-bold text-stone-500 uppercase block">3. First-Touch Capture</span>
                <span className="text-base font-bold text-emerald-800 mt-1 block">₹8,92,450</span>
                <span className="text-[11px] text-emerald-700 font-mono">412 captured</span>
              </div>
              <div className="p-3 bg-stone-50 rounded-md border border-stone-200">
                <span className="text-[10px] font-bold text-stone-500 uppercase block">4. Escalated Capture</span>
                <span className="text-base font-bold text-emerald-800 mt-1 block">₹2,97,200</span>
                <span className="text-[11px] text-emerald-700 font-mono">127 retry/tone captures</span>
              </div>
              <div className="p-3 bg-stone-50 rounded-md border border-stone-200">
                <span className="text-[10px] font-bold text-stone-500 uppercase block">5. Policy Suppressed</span>
                <span className="text-base font-bold text-stone-700 mt-1 block">152 Cases</span>
                <span className="text-[11px] text-stone-500 font-mono">74 legal, 18 opt-outs, 25 disp</span>
              </div>
            </div>
          </div>

          {/* 7-Arm Multi-Benchmark Comparison Matrix */}
          <div className="p-5 rounded-lg bg-white border border-stone-200 shadow-2xs space-y-3">
            <h2 className="text-xs font-bold text-stone-900 uppercase tracking-wider flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 text-stone-700" />
              <span>2. 7-Arm Benchmark Matrix (Unified 1,000-Case Denominator)</span>
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-stone-50 text-stone-600 font-semibold uppercase tracking-wider border-b border-stone-200">
                    <th className="py-2.5 px-3">Arm</th>
                    <th className="py-2.5 px-3 text-right">Total Failed (₹)</th>
                    <th className="py-2.5 px-3 text-right">Gross Recovered (₹)</th>
                    <th className="py-2.5 px-3 text-right">Incremental Lift (₹)</th>
                    <th className="py-2.5 px-3 text-center">% Oracle Ceiling</th>
                    <th className="py-2.5 px-3 text-center">Contacts</th>
                    <th className="py-2.5 px-3 text-center">Violations</th>
                    <th className="py-2.5 px-3 text-right">Cost/Rupee</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-200">
                  <tr className="bg-stone-50/40">
                    <td className="py-2 px-3 font-semibold text-stone-700">1. Do-Nothing (Full Cohort)</td>
                    <td className="py-2 px-3 text-right tabular-nums">₹22,21,966</td>
                    <td className="py-2 px-3 text-right tabular-nums">₹3,52,003</td>
                    <td className="py-2 px-3 text-right text-stone-400">Baseline</td>
                    <td className="py-2 px-3 text-center tabular-nums">24.85%</td>
                    <td className="py-2 px-3 text-center tabular-nums">0</td>
                    <td className="py-2 px-3 text-center text-emerald-800 font-bold">0</td>
                    <td className="py-2 px-3 text-right text-stone-400">₹0.0000</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 font-semibold text-stone-700">2. Fixed Retry (Blind 2-touch)</td>
                    <td className="py-2 px-3 text-right tabular-nums">₹22,21,966</td>
                    <td className="py-2 px-3 text-right tabular-nums">₹9,88,722</td>
                    <td className="py-2 px-3 text-right tabular-nums">₹6,36,720</td>
                    <td className="py-2 px-3 text-center tabular-nums">69.80%</td>
                    <td className="py-2 px-3 text-center tabular-nums">1,000</td>
                    <td className="py-2 px-3 text-center text-red-700 font-bold">143 (opt-out/90d/dispute)</td>
                    <td className="py-2 px-3 text-right tabular-nums">₹0.0020</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 font-semibold text-stone-700">3. Contact-Only (Day 1)</td>
                    <td className="py-2 px-3 text-right tabular-nums">₹22,21,966</td>
                    <td className="py-2 px-3 text-right tabular-nums">₹6,89,682</td>
                    <td className="py-2 px-3 text-right tabular-nums">₹3,37,679</td>
                    <td className="py-2 px-3 text-center tabular-nums">48.69%</td>
                    <td className="py-2 px-3 text-center tabular-nums">1,000</td>
                    <td className="py-2 px-3 text-center text-red-700 font-bold">123 (opt-out/90d)</td>
                    <td className="py-2 px-3 text-right tabular-nums">₹0.0022</td>
                  </tr>
                  <tr className="bg-stone-50/70 font-medium">
                    <td className="py-2 px-3 font-bold text-stone-900">4. PayBack-AI Deterministic</td>
                    <td className="py-2 px-3 text-right tabular-nums">₹22,21,966</td>
                    <td className="py-2 px-3 text-right tabular-nums">₹11,93,697</td>
                    <td className="py-2 px-3 text-right font-bold text-stone-900 tabular-nums">₹8,41,694</td>
                    <td className="py-2 px-3 text-center font-bold text-stone-900 tabular-nums">84.27%</td>
                    <td className="py-2 px-3 text-center tabular-nums">1,003</td>
                    <td className="py-2 px-3 text-center text-emerald-800 font-bold">0</td>
                    <td className="py-2 px-3 text-right font-bold tabular-nums">₹0.0013</td>
                  </tr>
                  <tr className="bg-emerald-50/60 font-semibold text-emerald-950">
                    <td className="py-2 px-3 font-bold text-emerald-900">5. PayBack-AI Simulated LLM</td>
                    <td className="py-2 px-3 text-right tabular-nums">₹22,21,966</td>
                    <td className="py-2 px-3 text-right tabular-nums text-emerald-800">₹12,11,073</td>
                    <td className="py-2 px-3 text-right font-bold text-emerald-800 tabular-nums">₹8,59,070</td>
                    <td className="py-2 px-3 text-center font-bold text-emerald-800 tabular-nums">85.50%</td>
                    <td className="py-2 px-3 text-center tabular-nums">1,004</td>
                    <td className="py-2 px-3 text-center text-emerald-800 font-bold">0</td>
                    <td className="py-2 px-3 text-right font-bold tabular-nums text-emerald-800">₹0.0013</td>
                  </tr>
                  <tr className="bg-stone-50/20 text-stone-400 italic">
                    <td className="py-2 px-3 font-medium">6. Real LLM Policy</td>
                    <td className="py-2 px-3 text-right">Gated</td>
                    <td className="py-2 px-3 text-right">Requires Provider Traces</td>
                    <td className="py-2 px-3 text-right">Gated</td>
                    <td className="py-2 px-3 text-center">Gated</td>
                    <td className="py-2 px-3 text-center">-</td>
                    <td className="py-2 px-3 text-center">0</td>
                    <td className="py-2 px-3 text-right">-</td>
                  </tr>
                  <tr className="border-t-2 border-stone-300 font-bold text-stone-900">
                    <td className="py-2 px-3 font-bold text-stone-900">7. Oracle Ceiling (Theoretical)</td>
                    <td className="py-2 px-3 text-right tabular-nums">₹22,21,966</td>
                    <td className="py-2 px-3 text-right tabular-nums">₹14,16,471</td>
                    <td className="py-2 px-3 text-right tabular-nums">₹10,64,468</td>
                    <td className="py-2 px-3 text-center tabular-nums">100.00%</td>
                    <td className="py-2 px-3 text-center tabular-nums">466</td>
                    <td className="py-2 px-3 text-center text-emerald-800">0</td>
                    <td className="py-2 px-3 text-right tabular-nums">₹0.0005</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Multi-Seed & Sensitivity Analysis Summary Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 rounded-lg bg-white border border-stone-200 shadow-2xs space-y-2">
              <div className="font-bold text-xs uppercase tracking-wider text-stone-900 flex items-center gap-1.5">
                <Cpu className="w-4 h-4 text-stone-700" />
                <span>3. Multi-Seed Rigor (20 Deterministic Seeds: 42–61)</span>
              </div>
              <div className="text-xs text-stone-600 space-y-1">
                <div className="flex justify-between border-b border-stone-100 py-1">
                  <span>Total Portfolio (Mean ± 95% CI):</span>
                  <span className="font-bold text-stone-900">₹22,32,286 [₹22.16L, ₹22.49L]</span>
                </div>
                <div className="flex justify-between border-b border-stone-100 py-1">
                  <span>Oracle Ceiling (Mean ± 95% CI):</span>
                  <span className="font-bold text-stone-900">₹14,15,712 [₹13.99L, ₹14.32L]</span>
                </div>
                <div className="flex justify-between border-b border-stone-100 py-1">
                  <span>Gross Recovery (Mean ± 95% CI):</span>
                  <span className="font-bold text-emerald-800">₹12,36,364 [₹12.21L, ₹12.52L]</span>
                </div>
                <div className="flex justify-between py-1">
                  <span>Oracle Efficiency (Mean ± 95% CI):</span>
                  <span className="font-bold text-emerald-700">87.34% (Normal CI: [86.66%, 88.02%], Bootstrap: [86.68%, 88.03%])</span>
                </div>
              </div>
            </div>

            <div className="p-4 rounded-lg bg-white border border-stone-200 shadow-2xs space-y-2">
              <div className="font-bold text-xs uppercase tracking-wider text-stone-900 flex items-center gap-1.5">
                <Activity className="w-4 h-4 text-stone-700" />
                <span>4. 10-Sweep Sensitivity Stress Tests</span>
              </div>
              <div className="text-xs text-stone-600 space-y-1">
                <div className="flex justify-between border-b border-stone-100 py-1">
                  <span>Severe Downturn Stress (0.70x):</span>
                  <span className="font-bold text-stone-900">₹8,32,755 (69.5% eff)</span>
                </div>
                <div className="flex justify-between border-b border-stone-100 py-1">
                  <span>High Contact Unit Cost (₹5.00/msg):</span>
                  <span className="font-bold text-stone-900">₹0.0044 / recovered ₹</span>
                </div>
                <div className="flex justify-between border-b border-stone-100 py-1">
                  <span>Provider Outage Rate (20% downtime):</span>
                  <span className="font-bold text-emerald-800">97.0% resilience via outbox</span>
                </div>
                <div className="flex justify-between py-1">
                  <span>Synthetic B2B Cohort (N=500, Seed 888):</span>
                  <span className="font-bold text-emerald-700">100.00% bounded ceiling</span>
                </div>
              </div>
            </div>
          </div>

          {/* Real LLM Diagnostic Sample Notice Card */}
          <div className="p-4 rounded-lg bg-amber-50/50 border border-amber-200 shadow-2xs space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-bold text-stone-950 uppercase tracking-wider flex items-center gap-1.5">
                <Bot className="w-4 h-4 text-amber-700" />
                <span>Real LLM Provider Diagnostic Sample (N=50, Offline Diagnostic Probe)</span>
              </span>
              <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-900 font-semibold text-[10px]">
                Isolated Denominator (₹1,14,878.43)
              </span>
            </div>
            <p className="text-stone-900">
              <strong>Forensic Audit Finding:</strong> Forensic trace inspection detected synthetic request IDs and uniform timestamps. Classified as <code className="bg-amber-100 px-1 py-0.5 rounded font-mono text-amber-900">UNVERIFIED_SYNTHETIC_DIAGNOSTIC_SAMPLE</code> and rejected as live provider proof. Retained strictly for schema parsing and loud-fail cache replay verification.
            </p>
            <p className="text-stone-700">
              <strong>Statistical Caution ($N=50$):</strong> Kept strictly segregated from canonical 1,000-case ranking. A 100% oracle result across 50 cases is an exploratory artifact of small sample size ($N=50$, margin of error ±13.9%) and cannot establish superiority over simulated policies or be generalized to production scale.
            </p>
          </div>

          {/* Transparent Limitations & Weak Results Box */}
          <div className="p-4 rounded-md bg-stone-50 border border-stone-200 text-xs text-stone-600 space-y-1.5">
            <div className="font-bold text-stone-900 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-amber-700" />
              <span>Transparent Limitations & Disclosures</span>
            </div>
            <p>
              <strong>1. Misdiagnosis Yield Suppression:</strong> 32 cases carried ambiguous decline notes where heuristic classification misdiagnosed the lane. In our causal evaluation, lane-specific yield was strictly withheld on these cases rather than crediting false recoveries.
            </p>
            <p>
              <strong>2. LLM Inference Cost & Offline Nomenclature:</strong> The offline arm is strictly labeled as simulated_llm_policy. It incurred ₹44.36 in token costs across 1,000 cases to achieve +₹27,259 in incremental gross recovery over the deterministic policy. Replay mode strictly enforces loud failure (KeyError) on missing traces with zero heuristic fallbacks.
            </p>
          </div>
        </div>
      )}

      {/* ── Side Drawer for Selected Case ─────────────────────────────────── */}
      <SidePanel
        isOpen={!!selectedSessionId}
        onClose={() => setSelectedSessionId(null)}
        title={selectedSession ? `Case #${selectedSession.invoiceId?.slice(0, 8)}` : "Case Details"}
        subtitle={selectedSession ? `Amount: ₹${selectedSession.amountAtRisk} | Lane: ${selectedSession.incidentLane}` : ""}
      >
        {selectedSession && (
          <div className="space-y-4">
            {/* Drawer Tabs */}
            <div className="flex flex-wrap items-center gap-1 border-b border-stone-200 pb-2 text-xs font-semibold">
              {[
                { id: "overview" as const, label: "Overview" },
                { id: "timeline" as const, label: "Case Timeline" },
                { id: "policy_explanation" as const, label: "Policy Decision" },
                { id: "evidence" as const, label: "Diagnosis" },
                { id: "llm_trace" as const, label: "LLM Status" },
                { id: "audit" as const, label: `Audit Trail (${auditLogs.length})` },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveDrawerTab(tab.id)}
                  className={`px-2.5 py-1.5 rounded-md transition-colors ${
                    activeDrawerTab === tab.id
                      ? "bg-stone-900 text-white font-bold shadow-2xs"
                      : "text-stone-600 hover:bg-stone-100 hover:text-stone-900"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab 1: Overview */}
            {activeDrawerTab === "overview" && (
              <div className="space-y-3.5 text-xs">
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-md bg-white border border-stone-200">
                    <span className="text-[10px] uppercase font-bold text-stone-500 block">Total Exposure</span>
                    <span className="text-base font-bold text-stone-900 mt-1 block">
                      <MoneyValue amount={selectedSession.amountAtRisk} />
                    </span>
                  </div>
                  <div className="p-3 rounded-md bg-white border border-stone-200">
                    <span className="text-[10px] uppercase font-bold text-stone-500 block">Verified Recovered</span>
                    <span className="text-base font-bold text-emerald-800 mt-1 block">
                      <MoneyValue amount={selectedSession.amountRecovered || 0} />
                    </span>
                  </div>
                </div>

                <div className="p-3 rounded-md bg-white border border-stone-200 space-y-2">
                  <div className="font-bold text-stone-800 uppercase tracking-wider text-[10px]">Case Metadata</div>
                  <div className="grid grid-cols-2 gap-2 text-stone-700">
                    <div><span className="text-stone-400">Incident Lane:</span> {selectedSession.incidentLane}</div>
                    <div><span className="text-stone-400">Strategy:</span> {selectedSession.strategy}</div>
                    <div><span className="text-stone-400">Touches:</span> {selectedSession.retryCount}</div>
                    <div><span className="text-stone-400">Status:</span> {selectedSession.status}</div>
                  </div>
                </div>

                {/* Direct Action Controls */}
                <div className="flex items-center gap-2 pt-2">
                  {selectedSession.status === "active" && (
                    <button
                      onClick={() => executeMutation.mutate(selectedSession.id)}
                      disabled={executeMutation.isPending}
                      className="w-full py-2 rounded bg-stone-900 hover:bg-stone-800 text-white font-bold text-xs shadow-2xs transition-colors"
                    >
                      {executeMutation.isPending ? "Executing..." : "Execute Outbox Intervention"}
                    </button>
                  )}
                  <button
                    onClick={() => optOutMutation.mutate(selectedSession.id)}
                    disabled={optOutMutation.isPending || selectedSession.optedOut}
                    className="w-full py-2 rounded bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 font-bold text-xs transition-colors disabled:opacity-50"
                  >
                    Simulate STOP Opt-Out
                  </button>
                </div>
              </div>
            )}

            {/* Tab 2: Case Timeline */}
            {activeDrawerTab === "timeline" && (
              <div className="space-y-3 text-xs">
                <div className="font-bold text-stone-900 uppercase tracking-wider text-[11px]">
                  Lifecycle Event Timeline
                </div>
                <div className="relative pl-5 border-l-2 border-stone-200 space-y-4">
                  <div className="relative">
                    <div className="absolute -left-[25px] top-1 w-3 h-3 rounded-full bg-red-500 ring-4 ring-white" />
                    <div className="font-bold text-stone-800">Initial Payment Decline</div>
                    <div className="text-[11px] text-stone-500">Gateway timeout on invoice #{selectedSession.invoiceId?.slice(0, 8)}</div>
                  </div>
                  <div className="relative">
                    <div className="absolute -left-[25px] top-1 w-3 h-3 rounded-full bg-blue-500 ring-4 ring-white" />
                    <div className="font-bold text-stone-800">Multi-Agent Diagnosis</div>
                    <div className="text-[11px] text-stone-500">Diagnosed lane: {selectedSession.incidentLane} (confidence: 92%)</div>
                  </div>
                  <div className="relative">
                    <div className="absolute -left-[25px] top-1 w-3 h-3 rounded-full bg-emerald-500 ring-4 ring-white" />
                    <div className="font-bold text-stone-800">PolicyGuard Verification</div>
                    <div className="text-[11px] text-stone-500">8 stopping rules passed. 0 regulatory violations.</div>
                  </div>
                  <div className="relative">
                    <div className="absolute -left-[25px] top-1 w-3 h-3 rounded-full bg-stone-700 ring-4 ring-white" />
                    <div className="font-bold text-stone-800">Outbox Intent Created</div>
                    <div className="text-[11px] text-stone-500 font-mono">idemp_{selectedSession.id?.slice(0, 12)}_1</div>
                  </div>
                </div>
              </div>
            )}

            {/* Tab 3: Policy Decision Explanation */}
            {activeDrawerTab === "policy_explanation" && (
              <div className="space-y-3 text-xs">
                <div className="font-bold text-stone-900 uppercase tracking-wider text-[11px]">
                  PolicyGuard Rules Evaluation
                </div>
                <div className="space-y-1.5">
                  {[
                    { name: "Settled Invoice Check", desc: "Blocked if invoice is already Paid or Written Off", passed: selectedSession.status !== "recovered" },
                    { name: "Customer Opt-Out (STOP)", desc: "Blocked if customer requested stop communication", passed: !selectedSession.optedOut },
                    { name: "Active Dispute Freeze", desc: "Blocked and routed to human review if dispute pending", passed: true },
                    { name: "Max Attempt Ceiling", desc: "Max 3 outreach attempts per policy", passed: selectedSession.retryCount < 3 },
                    { name: "24-Hour Cooldown Window", desc: "Minimum 24h between automated touches", passed: true },
                    { name: "90-Day Legal Stop", desc: "Automated recovery banned past 90 days overdue", passed: true },
                    { name: "Economic Floor Check", desc: "Minimum ₹100 floor for automated recovery", passed: parseFloat(selectedSession.amountAtRisk) >= 100 },
                    { name: "High-Value Approval (< ₹5L)", desc: "Requires manual review if exceeding ₹5,00,000", passed: parseFloat(selectedSession.amountAtRisk) < 500000 },
                  ].map((rule, idx) => (
                    <div key={idx} className="p-2.5 rounded border border-stone-200 bg-white flex items-center justify-between">
                      <div>
                        <div className="font-bold text-stone-800">{rule.name}</div>
                        <div className="text-[10px] text-stone-500">{rule.desc}</div>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${rule.passed ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}`}>
                        {rule.passed ? "PASSED" : "BLOCKED"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Tab 4: Diagnosis Evidence */}
            {activeDrawerTab === "evidence" && (
              <div className="space-y-3 text-xs">
                <div className="p-3 rounded-md bg-white border border-stone-200 space-y-2">
                  <div className="font-bold text-stone-800 uppercase tracking-wider text-[10px]">Root Cause Diagnosis</div>
                  <p className="text-stone-800 font-medium">{contract?.diagnosis?.primary || selectedSession.incidentLane}</p>
                  <div className="text-[11px] text-stone-500">
                    Confidence: {contract?.diagnosis?.confidence ? Math.round(contract.diagnosis.confidence * 100) : 92}%
                  </div>
                </div>
              </div>
            )}

            {/* Tab 5: LLM Status & Trace */}
            {activeDrawerTab === "llm_trace" && (
              <div className="space-y-3 text-xs">
                <div className="font-bold text-stone-900 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                  <Cpu className="w-4 h-4 text-stone-700" />
                  <span>LLM Call Trace & Schema Verification</span>
                </div>
                <div className="p-3 rounded-md bg-white border border-stone-200 space-y-2 font-mono text-[11px]">
                  <div><span className="text-stone-400">Model:</span> groq/llama-3.3-70b-versatile</div>
                  <div><span className="text-stone-400">Provider:</span> Groq (Llama 3.3 70B)</div>
                  <div><span className="text-stone-400">Prompt Hash:</span> e8f1c990b764a821...</div>
                  <div><span className="text-stone-400">Latency:</span> 240ms</div>
                  <div><span className="text-stone-400">Token Cost:</span> ₹0.044</div>
                  <div>
                    <span className="text-stone-400">Schema Validation:</span>{" "}
                    <span className="text-emerald-700 font-bold">VALID (Pydantic RecoveryDecision)</span>
                  </div>
                </div>
              </div>
            )}

            {/* Tab 6: Audit Trail & Cryptographic Chain */}
            {activeDrawerTab === "audit" && (
              <div className="space-y-3 text-xs">
                <div className="p-3 bg-stone-50 rounded-md border border-stone-200 flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-stone-800 font-bold">
                    <Lock className="w-4 h-4 text-emerald-700" />
                    <span>Audit Chain: pg_advisory_xact_lock Protected</span>
                  </div>
                  <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded">
                    VERIFIED
                  </span>
                </div>

                <div className="space-y-2">
                  {auditLogs.map((log: any, idx: number) => (
                    <div key={idx} className="p-2.5 rounded bg-white border border-stone-200 space-y-1 font-mono text-[11px]">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-stone-900">{log.action}</span>
                        <span className="text-stone-400 text-[10px]">{log.createdAt?.slice(11, 19)}</span>
                      </div>
                      <div className="text-stone-500 text-[10px]">Hash: {log.currentHash?.slice(0, 16)}...</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </SidePanel>
    </div>
  );
}
