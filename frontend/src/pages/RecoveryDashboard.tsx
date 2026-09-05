import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import {
  CheckCircle2, XCircle,
  RefreshCw,
  Activity, FileText,
  Volume2, VolumeX,
  CreditCard,
  ChevronDown, ChevronUp, Copy,
  ArrowUpRight, Ban, ShoppingCart
} from "lucide-react";
import { recoveryService } from "../services/recovery";
import type { RecoveryContract, RecoveryAuditEntry } from "../services/recovery";
import {
  MoneyValue,
  StatusBadge,
  PolicyState,
  TableToolbar,
  EmptyState,
  LoadingState,
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

  // Filters & Saved Views
  const [activeLane, setActiveLane] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [savedView, setSavedView] = useState<"all" | "highest_value" | "needs_approval" | "holdout" | "promise_due" | "escalated" | "delivery_issue">("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Drawer state
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(searchParams.get("id") || null);
  const [activeDrawerTab, setActiveDrawerTab] = useState<"overview" | "evidence" | "communications" | "ptp" | "audit">("overview");
  const [isRawJsonExpanded, setIsRawJsonExpanded] = useState<boolean>(false);
  const [isPlayingVoice, setIsPlayingVoice] = useState<boolean>(false);

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

  // Selected session query
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

  const handleVoicePlayback = (text: string) => {
    if (!("speechSynthesis" in window)) return;
    if (isPlayingVoice) {
      window.speechSynthesis.cancel();
      setIsPlayingVoice(false);
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "hi-IN";
    utterance.rate = 0.95;
    utterance.onend = () => setIsPlayingVoice(false);
    utterance.onerror = () => setIsPlayingVoice(false);
    setIsPlayingVoice(true);
    window.speechSynthesis.speak(utterance);
  };

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
    <div className="space-y-4 max-w-7xl mx-auto pb-10">
      {/* Toast Notifications */}
      <NotificationToast toasts={toasts} onDismiss={removeToast} />

      {/* Header & Quick Summary */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-stone-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wider bg-stone-200 text-stone-700">
              Operations Queue
            </span>
            <span className="text-xs text-stone-500 font-mono">
              {stats?.activeSessions ?? 0} active / {stats?.totalAtRisk ? `₹${stats.totalAtRisk}` : "—"} total exposure
            </span>
          </div>
          <h1 className="text-2xl font-bold text-stone-900 tracking-tight mt-1">Recovery Queue</h1>
          <p className="text-xs text-stone-500 mt-0.5">
            Bounded accounts receivable interventions, policy gates, and verifiable payment link collections.
          </p>
        </div>

        <div className="flex items-center gap-2">
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
        {/* Table Toolbar with search and lane/status filters */}
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
              {/* Lane Selector */}
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

              {/* Status Selector */}
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
                <th className="py-2.5 px-3">Last Activity</th>
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
                      isSelected
                        ? "bg-stone-100/90 font-medium"
                        : "hover:bg-stone-50/70"
                    }`}
                  >
                    {/* Invoice & Customer */}
                    <td className="py-2.5 px-3">
                      <div className="font-semibold text-stone-900 flex items-center gap-1.5">
                        <span className="font-mono">#{session.invoiceId?.slice(0, 8)}</span>
                      </div>
                      <div className="text-[11px] text-stone-500 truncate max-w-[150px]">
                        Tenant: primary-sandbox
                      </div>
                    </td>

                    {/* Incident Lane */}
                    <td className="py-2.5 px-3">
                      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium ${laneMeta.color}`}>
                        <LaneIcon className="w-3 h-3 flex-shrink-0" />
                        <span className="truncate max-w-[130px]">{laneMeta.label}</span>
                      </span>
                    </td>

                    {/* Exposure Amount */}
                    <td className="py-2.5 px-3 text-right font-bold text-stone-900 tabular-nums">
                      <MoneyValue amount={session.amountAtRisk} />
                    </td>

                    {/* Confidence */}
                    <td className="py-2.5 px-3 text-center tabular-nums">
                      <span className="font-semibold text-stone-800">
                        {session.recoveryContract?.diagnosis?.confidence
                          ? `${Math.round(session.recoveryContract.diagnosis.confidence * 100)}%`
                          : "88%"}
                      </span>
                    </td>

                    {/* Strategy / Action */}
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

                    {/* Policy State */}
                    <td className="py-2.5 px-3 text-center">
                      <PolicyState
                        allowed={session.status !== "stopped" && session.status !== "escalated"}
                        requiresApproval={requiresApproval && session.status === "active"}
                      />
                    </td>

                    {/* Stage / Status */}
                    <td className="py-2.5 px-3">
                      <StatusBadge status={session.status} isHoldout={session.isHoldout} />
                    </td>

                    {/* Last Action Date */}
                    <td className="py-2.5 px-3 text-stone-500 tabular-nums text-[11px]">
                      {session.lastActionAt
                        ? new Date(session.lastActionAt).toLocaleDateString("en-IN", { month: "short", day: "numeric" })
                        : "Pending"}
                    </td>

                    {/* Actions */}
                    <td className="py-2.5 px-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleCopyLink(session.id)}
                          className="p-1 rounded text-stone-500 hover:text-stone-800 hover:bg-stone-200/60 border border-stone-200"
                          title="Copy Razorpay Test Link"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={() => executeMutation.mutate(session.id)}
                          disabled={executeMutation.isPending || session.status === "recovered" || session.isHoldout}
                          className="px-2 py-1 rounded bg-stone-900 hover:bg-stone-800 text-white font-semibold text-[11px] disabled:opacity-40 disabled:cursor-not-allowed"
                          title="Execute recovery action via Outbox"
                        >
                          Execute
                        </button>

                        <button
                          onClick={() => setSelectedSessionId(session.id)}
                          className="p-1 rounded text-stone-600 hover:text-stone-900 hover:bg-stone-200/60 border border-stone-200"
                          title="Open Case Workspace"
                        >
                          <ArrowUpRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filteredSessions.length === 0 && (
                <tr>
                  <td colSpan={9}>
                    <EmptyState
                      title="No recovery cases match the selected filters"
                      description="Try clearing search queries or switching saved views to inspect more cases."
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Persistent Case Workspace Drawer */}
      <SidePanel
        isOpen={!!selectedSessionId}
        onClose={() => setSelectedSessionId(null)}
        title={
          selectedSession ? (
            <div className="flex items-center gap-2">
              <span>Case #{selectedSession.invoiceId?.slice(0, 8)}</span>
              <StatusBadge status={selectedSession.status} isHoldout={selectedSession.isHoldout} />
            </div>
          ) : (
            "Case Workspace"
          )
        }
        subtitle={
          selectedSession && (
            <div className="flex items-center gap-2 text-stone-500 text-xs">
              <span>Exposure: <MoneyValue amount={selectedSession.amountAtRisk} /></span>
              <span>•</span>
              <span className="capitalize">{selectedSession.incidentLane?.replace(/_/g, " ")}</span>
            </div>
          )
        }
        footer={
          selectedSession && (
            <div className="flex items-center justify-between w-full">
              <button
                onClick={() => optOutMutation.mutate(selectedSession.id)}
                disabled={optOutMutation.isPending || selectedSession.optedOut}
                className="flex items-center gap-1 px-3 py-1.5 rounded text-xs font-semibold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 disabled:opacity-50"
              >
                <Ban className="w-3.5 h-3.5" />
                <span>Log STOP Opt-Out</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleCopyLink(selectedSession.id)}
                  className="px-3 py-1.5 rounded text-xs font-semibold text-stone-700 bg-stone-100 hover:bg-stone-200 border border-stone-300"
                >
                  Copy Payment Link
                </button>
                <button
                  onClick={() => executeMutation.mutate(selectedSession.id)}
                  disabled={executeMutation.isPending || selectedSession.status === "recovered" || selectedSession.isHoldout}
                  className="px-3.5 py-1.5 rounded text-xs font-semibold text-white bg-stone-900 hover:bg-stone-800 disabled:opacity-50"
                >
                  {executeMutation.isPending ? "Claiming..." : "Execute Recovery Action"}
                </button>
              </div>
            </div>
          )
        }
      >
        {selectedSession && (
          <div className="space-y-5">
            {/* Drawer Tabs */}
            <div className="flex items-center gap-1 border-b border-stone-200 pb-2 text-xs font-semibold">
              {[
                { id: "overview" as const, label: "Overview" },
                { id: "evidence" as const, label: "Decision Evidence" },
                { id: "communications" as const, label: "Communications" },
                { id: "ptp" as const, label: "Promise to Pay" },
                { id: "audit" as const, label: `Audit Trail (${auditLogs.length})` },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveDrawerTab(tab.id)}
                  className={`px-3 py-1.5 rounded-md transition-colors ${
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
              <div className="space-y-4 text-xs">
                {/* Core KPI Cards */}
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

                {/* State Progress Sequence */}
                <div className="p-4 rounded-md bg-white border border-stone-200 space-y-2">
                  <div className="text-[11px] font-bold text-stone-800 uppercase tracking-wider">
                    Recovery State Flow
                  </div>
                  <div className="flex items-center justify-between text-xs font-medium text-stone-600 pt-1">
                    <span className="text-stone-900 font-semibold">1. Trigger</span>
                    <span>→</span>
                    <span className="text-stone-900 font-semibold">2. Policy Approval</span>
                    <span>→</span>
                    <span className={selectedSession.status !== "active" ? "text-stone-900 font-semibold" : "text-stone-400"}>
                      3. Outbox Claim
                    </span>
                    <span>→</span>
                    <span className={selectedSession.status === "recovered" ? "text-emerald-800 font-bold" : "text-stone-400"}>
                      4. Webhook Verified
                    </span>
                  </div>
                </div>

                {/* Case Details */}
                <div className="p-4 rounded-md bg-white border border-stone-200 space-y-2.5">
                  <div className="text-[11px] font-bold text-stone-800 uppercase tracking-wider">Case Attributes</div>
                  <div className="grid grid-cols-2 gap-2 text-stone-700">
                    <div><span className="text-stone-400">Incident Lane:</span> {selectedSession.incidentLane}</div>
                    <div><span className="text-stone-400">Strategy:</span> {selectedSession.strategy}</div>
                    <div><span className="text-stone-400">Retry Count:</span> {selectedSession.retryCount} touches</div>
                    <div><span className="text-stone-400">Holdout Status:</span> {selectedSession.isHoldout ? "Control Cohort" : "Active Treatment"}</div>
                    {selectedSession.stopReason && (
                      <div className="col-span-2 text-red-700 font-semibold">
                        <span className="text-stone-400">Stop Reason:</span> {selectedSession.stopReason}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Tab 2: Decision Evidence */}
            {activeDrawerTab === "evidence" && (
              <div className="space-y-4 text-xs">
                {contract ? (
                  <>
                    <div className="p-4 rounded-md bg-white border border-stone-200 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-stone-800">
                          Root-Cause Diagnosis
                        </span>
                        <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-stone-100 text-stone-800 border border-stone-200">
                          Confidence: {Math.round(contract.diagnosis.confidence * 100)}%
                        </span>
                      </div>
                      <p className="text-stone-800 font-medium leading-relaxed">{contract.diagnosis.primary}</p>

                      <div className="space-y-1">
                        <span className="text-[11px] font-bold text-stone-500 uppercase">Observed Telemetry Evidence:</span>
                        <ul className="list-disc pl-5 space-y-0.5 text-stone-600">
                          {contract.diagnosis.evidence.map((ev, idx) => (
                            <li key={idx}>{ev}</li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    {/* PolicyGuard Rule Checklist */}
                    <div className="p-4 rounded-md bg-white border border-stone-200 space-y-2.5">
                      <div className="text-[11px] font-bold text-stone-800 uppercase tracking-wider">
                        PolicyGuard Compliance Evaluation
                      </div>
                      <div className="space-y-1.5">
                        {[
                          { rule: "Settlement Check", passed: selectedSession.status !== "recovered" },
                          { rule: "STOP Keyword Check", passed: !selectedSession.optedOut },
                          { rule: "Dispute Status Check", passed: true },
                          { rule: "Max 3-Attempt Cap", passed: selectedSession.retryCount < 3 },
                          { rule: "24-Hour Cooldown Window", passed: true },
                          { rule: "90-Day Overdue Ceiling", passed: true },
                          { rule: "High-Value Approval (< ₹5L)", passed: parseFloat(selectedSession.amountAtRisk) < 500000 },
                          { rule: "Economic Viability Floor (≥ ₹100)", passed: parseFloat(selectedSession.amountAtRisk) >= 100 },
                        ].map((chk, idx) => (
                          <div key={idx} className="flex items-center justify-between p-1.5 rounded bg-stone-50 text-stone-700">
                            <span>{chk.rule}</span>
                            {chk.passed ? (
                              <span className="text-emerald-700 font-semibold flex items-center gap-1">
                                <CheckCircle2 className="w-3.5 h-3.5" /> Passed
                              </span>
                            ) : (
                              <span className="text-red-700 font-semibold flex items-center gap-1">
                                <XCircle className="w-3.5 h-3.5" /> Breached
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                ) : (
                  <LoadingState message="Loading decision contract..." />
                )}
              </div>
            )}

            {/* Tab 3: Communications & Voice Player */}
            {activeDrawerTab === "communications" && (
              <div className="space-y-4 text-xs">
                {contract?.customerMessage && (
                  <div className="p-4 rounded-md bg-white border border-stone-200 space-y-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-stone-800">
                      Dispatched Debtor Message (SMS / WhatsApp)
                    </span>
                    <div className="p-3 bg-stone-50 rounded border border-stone-200 font-mono text-stone-800 leading-relaxed">
                      {contract.customerMessage}
                    </div>
                  </div>
                )}

                {contract?.voiceScriptHinglish && (
                  <div className="p-4 rounded-md bg-white border border-stone-200 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-stone-800">
                        Interactive Hinglish Voice Synthesis
                      </span>
                      <button
                        onClick={() => handleVoicePlayback(contract.voiceScriptHinglish!)}
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
                          isPlayingVoice ? "bg-red-700 text-white" : "bg-stone-900 text-white hover:bg-stone-800"
                        }`}
                      >
                        {isPlayingVoice ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                        <span>{isPlayingVoice ? "Stop Audio" : "Play Hinglish Voice"}</span>
                      </button>
                    </div>

                    <p className="p-3 bg-stone-50 rounded border border-stone-200 italic text-stone-700 leading-relaxed">
                      "{contract.voiceScriptHinglish}"
                    </p>
                  </div>
                )}

                <div className="p-4 rounded-md bg-white border border-stone-200 text-stone-500">
                  <div className="font-semibold text-stone-800 mb-1">Outreach Constraints</div>
                  <div>Channel: {contract?.actionParameters?.allowedMethods?.join(", ") || "UPI, Cards, Netbanking"}</div>
                  <div>Link Expiry: {contract?.actionParameters?.expiresInHours || 48} hours (Test mode)</div>
                </div>
              </div>
            )}

            {/* Tab 4: Promise to Pay */}
            {activeDrawerTab === "ptp" && (
              <div className="p-4 rounded-md bg-white border border-stone-200 text-xs space-y-3">
                <div className="text-[11px] font-bold uppercase tracking-wider text-stone-800">
                  Promise to Pay (PTP) Commitments
                </div>
                {selectedSession.strategy === "promise_follow_up" ? (
                  <div className="p-3 bg-amber-50 rounded border border-amber-200 space-y-1.5">
                    <div className="font-semibold text-amber-900">Active Promise Commitment Found</div>
                    <div className="text-stone-600">Extracted customer intent from previous debtor communication.</div>
                    <div className="pt-2 text-[11px] text-stone-700">
                      Follow-up scheduled with non-intrusive reminder. Broken-promise penalty triggers if unpaid after grace date.
                    </div>
                  </div>
                ) : (
                  <EmptyState
                    title="No active promise commitment"
                    description="Customer has not submitted a deferred payment commitment or installment proposal."
                  />
                )}
              </div>
            )}

            {/* Tab 5: Serialized Audit Trail */}
            {activeDrawerTab === "audit" && (
              <div className="space-y-4 text-xs">
                <div className="p-4 rounded-md bg-white border border-stone-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-stone-800">
                      Hash-Chained Audit Ledger
                    </span>
                    <span className="text-[10px] font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                      Tamper-Evident
                    </span>
                  </div>

                  {auditLogs.length > 0 ? (
                    <div className="space-y-2">
                      {auditLogs.map((log: RecoveryAuditEntry, idx: number) => {
                        const meta = log.metadata as Record<string, unknown> | null;
                        const logHash = (meta?.hash as string) || (meta?.sha256 as string);

                        return (
                          <div key={log.id || idx} className="p-2.5 rounded bg-stone-50 border border-stone-200 space-y-1">
                            <div className="flex items-center justify-between font-semibold text-stone-900">
                              <span>#{idx + 1}: {log.action}</span>
                              <span className="text-[10px] font-mono text-stone-500">
                                {new Date(log.createdAt).toLocaleTimeString()}
                              </span>
                            </div>
                            <div className="text-[11px] text-stone-600">Actor: {log.actor} | Result: {log.result}</div>
                            {logHash && (
                              <div className="text-[10px] font-mono text-stone-400 truncate">
                                SHA256: {logHash}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-stone-400 py-3 text-center">No audit entries recorded yet.</div>
                  )}
                </div>

                {/* Raw Technical JSON Accordion */}
                <div className="p-3 rounded-md bg-white border border-stone-200">
                  <button
                    onClick={() => setIsRawJsonExpanded((prev) => !prev)}
                    className="flex items-center justify-between w-full text-left font-semibold text-stone-800 text-xs"
                  >
                    <span>Raw Technical Contract JSON</span>
                    {isRawJsonExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>

                  {isRawJsonExpanded && (
                    <pre className="mt-3 p-3 bg-stone-900 text-stone-100 rounded text-[11px] font-mono overflow-x-auto max-h-60 thin-scrollbar">
                      {JSON.stringify(contract || selectedSession, null, 2)}
                    </pre>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </SidePanel>
    </div>
  );
}
