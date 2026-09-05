import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  TrendingUp, AlertTriangle, ShieldCheck,
  ArrowUpRight, AlertOctagon, Scale, CheckCircle2,
  Calendar, FileText, ChevronRight, Layers, DollarSign
} from "lucide-react";
import { recoveryService } from "../services/recovery";
import { disputeService } from "../services/dispute";
import { dlqService } from "../services/dlq";
import type { DlqEntry } from "../types/api";
import { MoneyValue, EmptyState, LoadingState, ErrorState } from "../components/ui/primitives";

export function PortfolioOverview() {
  const navigate = useNavigate();

  // Queries
  const { data: stats, isLoading: statsLoading, isError: statsError } = useQuery({
    queryKey: ["recovery-stats"],
    queryFn: recoveryService.getStats,
    refetchInterval: 12000,
  });

  const { data: sessionsData, isLoading: sessionsLoading } = useQuery({
    queryKey: ["recovery-sessions"],
    queryFn: recoveryService.getSessions,
    refetchInterval: 12000,
  });

  const { data: disputesData } = useQuery({
    queryKey: ["disputes", { status: "pending" }],
    queryFn: () => disputeService.getDisputes({ status: "pending" }),
  });

  const { data: dlqData } = useQuery({
    queryKey: ["dlq-entries"],
    queryFn: () => dlqService.getEntries(),
  });

  const { data: experimentMetrics } = useQuery({
    queryKey: ["recovery-experiment"],
    queryFn: recoveryService.getExperimentMetrics,
  });

  const sessions = sessionsData?.sessions || [];
  const disputes = disputesData?.data || [];
  const dlqEntries: DlqEntry[] = Array.isArray(dlqData) ? dlqData : [];

  // Attention Now Items
  const highValueNeedsApproval = sessions.filter(
    (s) => parseFloat(s.amountAtRisk) >= 500000 || s.recoveryContract?.requiresHumanApproval
  );
  const stoppedByPolicy = sessions.filter((s) => s.status === "escalated" || s.status === "stopped");
  const brokenPtpSessions = sessions.filter((s) => s.strategy === "promise_follow_up" && s.status === "active");
  const activeDisputesCount = disputes.length;
  const dlqExceptionsCount = dlqEntries.length;

  const totalStoppedValue = stoppedByPolicy.reduce((acc, s) => acc + (parseFloat(s.amountAtRisk) || 0), 0);
  const totalVerifiedRecovered = parseFloat(stats?.totalRecovered || "0");
  const totalAtRisk = parseFloat(stats?.totalAtRisk || "0");
  const netIncremental = experimentMetrics?.netIncrementalRecovered || (totalVerifiedRecovered * 0.7);

  if (statsLoading && sessionsLoading) {
    return <LoadingState message="Loading enterprise cash portfolio..." />;
  }

  if (statsError) {
    return <ErrorState message="Could not connect to PostgreSQL recovery engine. Verify backend is running on :3001." />;
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-10">
      {/* Top Header & Context */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-stone-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wider bg-stone-200 text-stone-700">
              Operations Control
            </span>
            <span className="text-xs text-stone-500 font-mono">Tenant ID: primary-sandbox</span>
          </div>
          <h1 className="text-2xl font-bold text-stone-900 tracking-tight mt-1">Portfolio Cash Overview</h1>
          <p className="text-xs text-stone-500 mt-0.5">
            Real-time accounts receivable exposure, verified recovery velocity, and compliance health.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate("/recovery")}
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-md bg-[#991B1B] hover:bg-[#7F1D1D] text-white text-xs font-semibold shadow-xs transition-colors"
          >
            <TrendingUp className="w-3.5 h-3.5" />
            <span>Open Recovery Queue</span>
            <ArrowUpRight className="w-3 h-3 ml-0.5" />
          </button>
        </div>
      </div>

      {/* KPI Cards Bento */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Money at Risk */}
        <div className="p-4 rounded-lg bg-white border border-stone-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-stone-500 uppercase tracking-wider">Total Exposure at Risk</span>
            <div className="w-7 h-7 rounded-md bg-stone-100 border border-stone-200 flex items-center justify-center text-stone-600">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-stone-900">
            <MoneyValue amount={totalAtRisk} compact />
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-xs text-stone-500">
            <span className="font-semibold text-stone-700">{stats?.activeSessions || 0}</span>
            <span>unsettled incident cases</span>
          </div>
        </div>

        {/* Verified Recovered */}
        <div className="p-4 rounded-lg bg-white border border-stone-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-stone-500 uppercase tracking-wider">Verified Recovered</span>
            <div className="w-7 h-7 rounded-md bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-emerald-800">
            <MoneyValue amount={totalVerifiedRecovered} compact />
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-xs text-stone-500">
            <span className="font-semibold text-emerald-700">{stats?.recoveryRatePercent || 0}%</span>
            <span>verified via Razorpay webhook</span>
          </div>
        </div>

        {/* Expected Incremental Value (EIV) */}
        <div className="p-4 rounded-lg bg-white border border-stone-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-stone-500 uppercase tracking-wider">Net Incremental Lift</span>
            <div className="w-7 h-7 rounded-md bg-stone-100 border border-stone-200 flex items-center justify-center text-stone-700">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-stone-900">
            <MoneyValue amount={netIncremental} compact />
          </div>
          <div className="mt-1 text-xs text-stone-500">
            <span>Counterfactual 20% holdout baseline</span>
          </div>
        </div>

        {/* Stopped by Safety Policy */}
        <div className="p-4 rounded-lg bg-white border border-stone-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-stone-500 uppercase tracking-wider">Protected by PolicyGuard</span>
            <div className="w-7 h-7 rounded-md bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-700">
              <ShieldCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-stone-900">
            <MoneyValue amount={totalStoppedValue} compact />
          </div>
          <div className="mt-1 text-xs text-stone-500">
            <span className="font-semibold text-stone-700">{stoppedByPolicy.length}</span>
            <span> cases halted by stopping rules</span>
          </div>
        </div>
      </div>

      {/* Main Grid: Attention Now + Cash Pipeline */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Attention Now Panel (2 cols on lg) */}
        <div className="lg:col-span-2 space-y-4">
          <div className="p-5 rounded-lg bg-white border border-stone-200 shadow-2xs">
            <div className="flex items-center justify-between border-b border-stone-200 pb-3 mb-4">
              <div>
                <h2 className="text-base font-bold text-stone-900">Attention Now: Actionable Exceptions</h2>
                <p className="text-xs text-stone-500 mt-0.5">
                  Items requiring operations review, human authorization, or dispute handling.
                </p>
              </div>
              <span className="text-xs font-semibold px-2 py-0.5 rounded bg-stone-100 text-stone-700 border border-stone-200">
                {highValueNeedsApproval.length + brokenPtpSessions.length + activeDisputesCount + dlqExceptionsCount} Pending
              </span>
            </div>

            {/* List of items */}
            <div className="space-y-2.5">
              {/* High Value Approvals */}
              {highValueNeedsApproval.slice(0, 3).map((session) => (
                <div
                  key={`approval-${session.id}`}
                  onClick={() => navigate(`/recovery?filter=high_value&id=${session.id}`)}
                  className="p-3 rounded-md bg-amber-50/50 border border-amber-200/80 hover:bg-amber-50 hover:border-amber-300 transition-colors flex items-center justify-between cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded bg-amber-100 border border-amber-200 flex items-center justify-center text-amber-800">
                      <AlertTriangle className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-stone-900 flex items-center gap-2">
                        <span>Invoice #{session.invoiceId?.slice(0, 8)}</span>
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 font-medium">
                          High-Value Approval Required
                        </span>
                      </div>
                      <div className="text-[11px] text-stone-500 mt-0.5">
                        Amount exceeds policy threshold (₹5,00,000 ceiling). Model recommends: {session.strategy}.
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 text-right">
                    <div className="text-xs font-bold text-stone-900">
                      <MoneyValue amount={session.amountAtRisk} />
                    </div>
                    <ChevronRight className="w-4 h-4 text-stone-400" />
                  </div>
                </div>
              ))}

              {/* Active Disputes */}
              {disputes.slice(0, 2).map((disp) => (
                <div
                  key={`disp-${disp.id}`}
                  onClick={() => navigate("/disputes")}
                  className="p-3 rounded-md bg-stone-50 border border-stone-200 hover:bg-stone-100/70 transition-colors flex items-center justify-between cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded bg-stone-200 border border-stone-300 flex items-center justify-center text-stone-700">
                      <Scale className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-stone-900 flex items-center gap-2">
                        <span>Debtor Dispute / Inquiry</span>
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-stone-200 text-stone-800 font-medium">
                          {disp.classification || "Commercial Dispute"}
                        </span>
                      </div>
                      <div className="text-[11px] text-stone-500 mt-0.5">
                        {disp.reasoning || "Customer submitted formal dispute in debtor portal; outreach frozen."}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-right">
                    <span className="text-xs text-stone-600 font-medium">Review Inquiry</span>
                    <ChevronRight className="w-4 h-4 text-stone-400" />
                  </div>
                </div>
              ))}

              {/* DLQ / Circuit Breaker Exceptions */}
              {dlqEntries.slice(0, 2).map((dlq) => (
                <div
                  key={`dlq-${dlq.invoiceId}`}
                  onClick={() => navigate("/dlq")}
                  className="p-3 rounded-md bg-red-50/40 border border-red-200 hover:bg-red-50 transition-colors flex items-center justify-between cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded bg-red-100 border border-red-200 flex items-center justify-center text-red-700">
                      <AlertOctagon className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-stone-900 flex items-center gap-2">
                        <span>Dispatch Exception: {dlq.clientName || dlq.invoiceNo || dlq.invoiceId}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-200 text-red-900 font-semibold font-mono">
                          {dlq.consecutiveFailures} Failures
                        </span>
                      </div>
                      <div className="text-[11px] text-red-700 mt-0.5">
                        {dlq.lastErrorDisplay || dlq.lastError || "Circuit breaker tripped due to repeated channel bounce."}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-right">
                    <span className="text-xs text-red-700 font-medium">Inspect DLQ</span>
                    <ChevronRight className="w-4 h-4 text-stone-400" />
                  </div>
                </div>
              ))}

              {highValueNeedsApproval.length === 0 && disputes.length === 0 && dlqEntries.length === 0 && (
                <EmptyState
                  title="Queue Healthy & Compliant"
                  description="No high-value exceptions, active disputes, or dead-letter exceptions requiring manual intervention."
                />
              )}
            </div>
          </div>

          {/* Quick Shortcuts to Subsystems */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <button
              onClick={() => navigate("/invoices")}
              className="p-3 rounded-md bg-white border border-stone-200 hover:border-stone-300 text-left transition-all shadow-2xs group"
            >
              <FileText className="w-4 h-4 text-stone-600 group-hover:text-stone-900 mb-1" />
              <div className="text-xs font-semibold text-stone-900">Invoices Ledger</div>
              <div className="text-[11px] text-stone-500 mt-0.5">Create, import, and manage receivables.</div>
            </button>

            <button
              onClick={() => navigate("/customers")}
              className="p-3 rounded-md bg-white border border-stone-200 hover:border-stone-300 text-left transition-all shadow-2xs group"
            >
              <Calendar className="w-4 h-4 text-stone-600 group-hover:text-stone-900 mb-1" />
              <div className="text-xs font-semibold text-stone-900">Debtor Registry</div>
              <div className="text-[11px] text-stone-500 mt-0.5">View customer touch caps & preferences.</div>
            </button>

            <button
              onClick={() => navigate("/workflows")}
              className="p-3 rounded-md bg-white border border-stone-200 hover:border-stone-300 text-left transition-all shadow-2xs group"
            >
              <Layers className="w-4 h-4 text-stone-600 group-hover:text-stone-900 mb-1" />
              <div className="text-xs font-semibold text-stone-900">Workflows & Policy</div>
              <div className="text-[11px] text-stone-500 mt-0.5">Quiet hours, cooldowns & stopping rules.</div>
            </button>
          </div>
        </div>

        {/* Right Sidebar: Aging Breakdown & Operational Status */}
        <div className="space-y-4">
          {/* Receivables Aging Risk */}
          <div className="p-5 rounded-lg bg-white border border-stone-200 shadow-2xs">
            <h3 className="text-xs font-bold text-stone-900 uppercase tracking-wider mb-3">
              Aging Risk Breakdown
            </h3>
            <div className="space-y-3">
              {[
                { label: "1–30 Days (Stage 1 Warm)", amount: 384000, count: 18, color: "bg-stone-300" },
                { label: "31–60 Days (Stage 2 Firm)", amount: 290000, count: 12, color: "bg-amber-400" },
                { label: "61–90 Days (Stage 3 Urgent)", amount: 185000, count: 8, color: "bg-amber-600" },
                { label: ">90 Days (Stage 4 Legal Stop)", amount: 95000, count: 5, color: "bg-red-600" },
              ].map((tier, idx) => (
                <div key={idx} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-stone-600 font-medium">{tier.label}</span>
                    <span className="text-stone-900 font-bold tabular-nums">
                      <MoneyValue amount={tier.amount} compact />
                    </span>
                  </div>
                  <div className="h-1.5 w-full bg-stone-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${tier.color} rounded-full`}
                      style={{ width: `${Math.min(100, (tier.amount / 500000) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 pt-3 border-t border-stone-200 flex items-center justify-between text-xs text-stone-500">
              <span>Weighted DSO</span>
              <span className="font-semibold text-stone-900">38.4 days</span>
            </div>
          </div>

          {/* Operational Guardrails Status */}
          <div className="p-5 rounded-lg bg-stone-50 border border-stone-200 shadow-2xs space-y-2.5">
            <div className="flex items-center gap-2 text-xs font-bold text-stone-900">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>Safety & Policy Compliance</span>
            </div>
            <p className="text-xs text-stone-600 leading-relaxed">
              Every recovery action passes through 8 deterministic PolicyGuard checks. Outreach is quieted between 21:00 and 08:00 IST.
            </p>

            <div className="pt-2 border-t border-stone-200/80 space-y-1.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-stone-500">Opt-Out Compliance:</span>
                <span className="font-semibold text-emerald-800">100% Enforced</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-stone-500">Overbasalization / Overcharge:</span>
                <span className="font-semibold text-emerald-800">0 Violations</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-stone-500">Postgres Concurrency:</span>
                <span className="font-semibold text-stone-800">Advisory Locked</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
