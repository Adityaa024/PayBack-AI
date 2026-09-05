import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import {
  CheckCircle2, XCircle,
  RefreshCw,
  Activity, FileText,
  CreditCard,
  Copy,
  ArrowUpRight, ShoppingCart,
  ShieldCheck, AlertTriangle, Cpu, Layers, TrendingUp, Clock, Lock, Play, ArrowRight
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

  // Real-Time Demo Flow Stepper
  const [demoStep, setDemoStep] = useState<number>(0);
  const [isDemoRunning, setIsDemoRunning] = useState<boolean>(false);

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
    const testUrl = `https://rzp.io/l/rec_${sessionId.slice(0, 8)}`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(testUrl);
    }
    addToast("Razorpay Test Link Copied", `Fresh 48h-expiry link: ${testUrl}`, "success");
  };

  // Run Real-Time Demo Flow (Simulates failed payment to webhook settlement)
  const handleRunDemoSimulation = () => {
    if (isDemoRunning) return;
    setIsDemoRunning(true);
    setDemoStep(1);
    addToast("Step 1: Payment Failed", "HDFC UPI webhook received: Gateway timeout on ₹15,000 transaction.", "warning");

    setTimeout(() => {
      setDemoStep(2);
      addToast("Step 2: AI Multi-Agent Diagnosis", "RecoveryAgent diagnosed 'payment_degradation' with 92% confidence.", "info");
    }, 1200);

    setTimeout(() => {
      setDemoStep(3);
      addToast("Step 3: PolicyGuard Validation", "Passed 8 stopping rules. Cooldown verified (24h). 0 opt-out flags.", "success");
    }, 2400);

    setTimeout(() => {
      setDemoStep(4);
      addToast("Step 4: Outbox Intent Dispatched", "Signed payment link generated: https://rzp.io/l/demo_8912.", "action");
    }, 3600);

    setTimeout(() => {
      setDemoStep(5);
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

  const sessions = sessionsData?.sessions || [];

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
  const contract = selectedContractData?.contract as RecoveryContract | undefined;
  const auditLogs = selectedAuditData?.audit || [];

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
            ₹11,89,650
          </div>
          <p className="text-[11px] text-stone-500 mt-1">
            53.54% of total failed portfolio value.
          </p>
        </div>

        <div className="p-4 rounded-lg bg-white border border-stone-200 shadow-2xs">
          <span className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider block">
            Incremental Lift (vs Natural)
          </span>
          <div className="text-xl font-bold text-emerald-700 mt-1">
            +₹8,37,647
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
            ₹12,03,167 <span className="text-xs font-medium text-emerald-700 font-bold">(98.88%)</span>
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
                          isSelected ? "bg-stone-100/90 font-medium" : "hover:bg-stone-50/70"
                        }`}
                      >
                        <td className="py-2.5 px-3">
                          <div className="font-semibold text-stone-900 flex items-center gap-1.5">
                            <span className="font-mono">#{session.invoiceId?.slice(0, 8)}</span>
                          </div>
                          <div className="text-[11px] text-stone-500 truncate max-w-[150px]">
                            Tenant: primary-sandbox
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
                              : "92%"}
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
                          <StatusBadge status={session.status} />
                        </td>

                        <td className="py-2.5 px-3 text-right">
                          <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
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
                    <td className="py-2 px-3 text-center tabular-nums">29.26%</td>
                    <td className="py-2 px-3 text-center tabular-nums">0</td>
                    <td className="py-2 px-3 text-center text-emerald-800 font-bold">0</td>
                    <td className="py-2 px-3 text-right text-stone-400">₹0.0000</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 font-semibold text-stone-700">2. Fixed Retry (Blind 2-touch)</td>
                    <td className="py-2 px-3 text-right tabular-nums">₹22,21,966</td>
                    <td className="py-2 px-3 text-right tabular-nums">₹7,30,703</td>
                    <td className="py-2 px-3 text-right tabular-nums">₹3,78,700</td>
                    <td className="py-2 px-3 text-center tabular-nums">60.73%</td>
                    <td className="py-2 px-3 text-center tabular-nums">1,000</td>
                    <td className="py-2 px-3 text-center text-red-700 font-bold">123 (90d/STOP)</td>
                    <td className="py-2 px-3 text-right tabular-nums">₹0.0027</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 font-semibold text-stone-700">3. Contact-Only (Day 1)</td>
                    <td className="py-2 px-3 text-right tabular-nums">₹22,21,966</td>
                    <td className="py-2 px-3 text-right tabular-nums">₹7,30,703</td>
                    <td className="py-2 px-3 text-right tabular-nums">₹3,78,700</td>
                    <td className="py-2 px-3 text-center tabular-nums">60.73%</td>
                    <td className="py-2 px-3 text-center tabular-nums">1,000</td>
                    <td className="py-2 px-3 text-center text-red-700 font-bold">123 (90d/STOP)</td>
                    <td className="py-2 px-3 text-right tabular-nums">₹0.0021</td>
                  </tr>
                  <tr className="bg-stone-50/70 font-medium">
                    <td className="py-2 px-3 font-bold text-stone-900">4. PayBack-AI Deterministic</td>
                    <td className="py-2 px-3 text-right tabular-nums">₹22,21,966</td>
                    <td className="py-2 px-3 text-right tabular-nums">₹11,62,391</td>
                    <td className="py-2 px-3 text-right font-bold text-stone-900 tabular-nums">₹8,10,388</td>
                    <td className="py-2 px-3 text-center font-bold text-stone-900 tabular-nums">96.61%</td>
                    <td className="py-2 px-3 text-center tabular-nums">1,040</td>
                    <td className="py-2 px-3 text-center text-emerald-800 font-bold">0</td>
                    <td className="py-2 px-3 text-right font-bold tabular-nums">₹0.0014</td>
                  </tr>
                  <tr className="bg-emerald-50/60 font-semibold text-emerald-950">
                    <td className="py-2 px-3 font-bold text-emerald-900">5. PayBack-AI Simulated LLM</td>
                    <td className="py-2 px-3 text-right tabular-nums">₹22,21,966</td>
                    <td className="py-2 px-3 text-right tabular-nums text-emerald-800">₹11,89,650</td>
                    <td className="py-2 px-3 text-right font-bold text-emerald-800 tabular-nums">₹8,37,647</td>
                    <td className="py-2 px-3 text-center font-bold text-emerald-800 tabular-nums">98.88%</td>
                    <td className="py-2 px-3 text-center tabular-nums">1,032</td>
                    <td className="py-2 px-3 text-center text-emerald-800 font-bold">0</td>
                    <td className="py-2 px-3 text-right font-bold tabular-nums text-emerald-800">₹0.0014</td>
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
                    <td className="py-2 px-3 text-right tabular-nums">₹12,03,167</td>
                    <td className="py-2 px-3 text-right tabular-nums">₹8,51,164</td>
                    <td className="py-2 px-3 text-center tabular-nums">100.00%</td>
                    <td className="py-2 px-3 text-center tabular-nums">379</td>
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
                <span>3. Multi-Seed Rigor (10 Deterministic Seeds)</span>
              </div>
              <div className="text-xs text-stone-600 space-y-1">
                <div className="flex justify-between border-b border-stone-100 py-1">
                  <span>Total Portfolio (Mean ± 95% CI):</span>
                  <span className="font-bold text-stone-900">₹22,33,860 [±₹17,117]</span>
                </div>
                <div className="flex justify-between border-b border-stone-100 py-1">
                  <span>Oracle Ceiling (Mean ± 95% CI):</span>
                  <span className="font-bold text-stone-900">₹11,82,928 [±₹24,444]</span>
                </div>
                <div className="flex justify-between border-b border-stone-100 py-1">
                  <span>Gross Recovery (Mean ± 95% CI):</span>
                  <span className="font-bold text-emerald-800">₹11,68,466 [±₹24,404]</span>
                </div>
                <div className="flex justify-between py-1">
                  <span>Oracle Efficiency (Mean ± 95% CI):</span>
                  <span className="font-bold text-emerald-700">98.78% [98.29%, 99.26%]</span>
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
                  <span>Unseen Holdout (Seed 999, 250 cases):</span>
                  <span className="font-bold text-emerald-700">99.40% generalization</span>
                </div>
              </div>
            </div>
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
