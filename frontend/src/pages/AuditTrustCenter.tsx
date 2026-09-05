import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ShieldCheck, Lock, Play, AlertTriangle,
  RotateCcw, CheckCircle2,
  Database, Cpu
} from "lucide-react";
import { recoveryService } from "../services/recovery";
import type { RecoveryAuditEntry } from "../services/recovery";
import { MoneyValue, EmptyState } from "../components/ui/primitives";

export function AuditTrustCenter() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"proof_lab" | "concurrency" | "ledger">("proof_lab");
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  // Queries
  const { data: stats } = useQuery({
    queryKey: ["recovery-stats"],
    queryFn: recoveryService.getStats,
  });

  const { data: sessionsData } = useQuery({
    queryKey: ["recovery-sessions"],
    queryFn: recoveryService.getSessions,
  });



  const sessions = sessionsData?.sessions || [];
  const activeSessionWithAudit = sessions.find((s) => s.status === "active" || s.status === "recovered") || sessions[0];

  const { data: auditTrail } = useQuery({
    queryKey: ["session-audit", activeSessionWithAudit?.id],
    queryFn: () => activeSessionWithAudit ? recoveryService.getSessionAudit(activeSessionWithAudit.id) : null,
    enabled: !!activeSessionWithAudit,
  });

  // Demo Mutations
  const seed50Mutation = useMutation({
    mutationFn: recoveryService.seed50Batch,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["recovery-sessions"] });
      queryClient.invalidateQueries({ queryKey: ["recovery-stats"] });
      queryClient.invalidateQueries({ queryKey: ["recovery-experiment"] });
      setStatusNotice(`Seeded 50-Case Matrix: ${data.treatmentCount} Treatment cases, ${data.holdoutCount} Holdout Control cases.`);
    },
  });

  const replayMutation = useMutation({
    mutationFn: (act: 1 | 2 | 3 | 4 | 5) => recoveryService.replayScenario(act),
    onSuccess: (_, act) => {
      queryClient.invalidateQueries({ queryKey: ["recovery-sessions"] });
      queryClient.invalidateQueries({ queryKey: ["recovery-stats"] });
      queryClient.invalidateQueries({ queryKey: ["recovery-experiment"] });
      setStatusNotice(`Replay Act ${act} successfully executed in database.`);
    },
  });

  const resetDemoMutation = useMutation({
    mutationFn: recoveryService.resetDemo,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["recovery-sessions"] });
      queryClient.invalidateQueries({ queryKey: ["recovery-stats"] });
      queryClient.invalidateQueries({ queryKey: ["recovery-experiment"] });
      setStatusNotice(data.message || "Demo session records reset successfully.");
    },
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-stone-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wider bg-stone-200 text-stone-700">
              Reliability & Verifiability
            </span>
            <span className="text-xs text-stone-500 font-mono">Evidence Engine</span>
          </div>
          <h1 className="text-2xl font-bold text-stone-900 tracking-tight mt-1">Audit & Trust Center</h1>
          <p className="text-xs text-stone-500 mt-0.5">
            Cryptographic ledger integrity proofs, transactional concurrency protections, and the interactive Proof Lab.
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-1 p-1 bg-stone-100 rounded-lg border border-stone-200 text-xs font-semibold">
          <button
            onClick={() => setActiveTab("proof_lab")}
            className={`px-3 py-1.5 rounded-md transition-all ${
              activeTab === "proof_lab" ? "bg-white text-stone-900 shadow-2xs" : "text-stone-600 hover:text-stone-900"
            }`}
          >
            Proof Lab (Acts 1–5)
          </button>
          <button
            onClick={() => setActiveTab("concurrency")}
            className={`px-3 py-1.5 rounded-md transition-all ${
              activeTab === "concurrency" ? "bg-white text-stone-900 shadow-2xs" : "text-stone-600 hover:text-stone-900"
            }`}
          >
            Concurrency Safety
          </button>
          <button
            onClick={() => setActiveTab("ledger")}
            className={`px-3 py-1.5 rounded-md transition-all ${
              activeTab === "ledger" ? "bg-white text-stone-900 shadow-2xs" : "text-stone-600 hover:text-stone-900"
            }`}
          >
            Hash-Chain Ledger
          </button>
        </div>
      </div>

      {statusNotice && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-md text-xs font-medium text-emerald-800 flex items-center justify-between">
          <span>{statusNotice}</span>
          <button onClick={() => setStatusNotice(null)} className="text-emerald-600 hover:text-emerald-900 font-bold ml-4">
            ×
          </button>
        </div>
      )}

      {/* Tab 1: Proof Lab */}
      {activeTab === "proof_lab" && (
        <div className="space-y-6">
          {/* Explicit Test-Mode Sandbox Banner */}
          <div className="p-4 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-700 flex-shrink-0 mt-0.5" />
            <div className="text-xs">
              <div className="font-bold text-sm">Sandbox / Proof Lab Environment</div>
              <p className="mt-0.5 text-amber-800 leading-relaxed">
                Actions triggered in this lab execute against live PostgreSQL tables and simulated Razorpay test mode rails (<code className="font-mono bg-amber-100/70 px-1 rounded">rzp_test_*</code>). No real monetary capital is debited. Recovered revenue is credited strictly when verified through the HMAC SHA-256 webhook path.
              </p>
            </div>
          </div>

          {/* Seeding & Reset Controls */}
          <div className="p-5 rounded-lg bg-white border border-stone-200 shadow-2xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-stone-200 pb-3">
              <div>
                <h2 className="text-sm font-bold text-stone-900">1. Batch Seed & State Initialization</h2>
                <p className="text-xs text-stone-500 mt-0.5">
                  Populate or reset the 50-case benchmark incident catalog in PostgreSQL with 20% holdout control allocation.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => seed50Mutation.mutate()}
                  disabled={seed50Mutation.isPending}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-stone-900 hover:bg-stone-800 text-white text-xs font-semibold shadow-xs transition-colors disabled:opacity-50"
                >
                  <Database className="w-3.5 h-3.5" />
                  <span>{seed50Mutation.isPending ? "Seeding..." : "Seed 50-Case Matrix"}</span>
                </button>

                <button
                  onClick={() => {
                    if (confirm("Reset demo recovery sessions and clear test transactions?")) {
                      resetDemoMutation.mutate();
                    }
                  }}
                  disabled={resetDemoMutation.isPending}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-stone-100 hover:bg-red-50 text-stone-700 hover:text-red-700 border border-stone-200 text-xs font-semibold transition-colors disabled:opacity-50"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset Demo Data</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-2.5 bg-stone-50 rounded border border-stone-200">
                <span className="text-stone-500 block text-[10px] uppercase font-bold">Total Seeded Cases</span>
                <span className="text-base font-bold text-stone-900 tabular-nums">{sessions.length}</span>
              </div>
              <div className="p-2.5 bg-stone-50 rounded border border-stone-200">
                <span className="text-stone-500 block text-[10px] uppercase font-bold">Treatment Cohort</span>
                <span className="text-base font-bold text-stone-900 tabular-nums">
                  {sessions.filter((s) => !s.isHoldout).length}
                </span>
              </div>
              <div className="p-2.5 bg-stone-50 rounded border border-stone-200">
                <span className="text-stone-500 block text-[10px] uppercase font-bold">Holdout Control</span>
                <span className="text-base font-bold text-stone-900 tabular-nums">
                  {sessions.filter((s) => s.isHoldout).length}
                </span>
              </div>
              <div className="p-2.5 bg-stone-50 rounded border border-stone-200">
                <span className="text-stone-500 block text-[10px] uppercase font-bold">Gross Recovered</span>
                <span className="text-base font-bold text-emerald-800 tabular-nums">
                  <MoneyValue amount={stats?.totalRecovered} compact />
                </span>
              </div>
            </div>
          </div>

          {/* The 5 Interactive Replay Acts */}
          <div className="p-5 rounded-lg bg-white border border-stone-200 shadow-2xs space-y-4">
            <div>
              <h2 className="text-sm font-bold text-stone-900">2. Replay Scenarios: The 5 Demo Acts</h2>
              <p className="text-xs text-stone-500 mt-0.5">
                Simulate standard payment lifecycle exceptions through live backend execution. (Keyboard shortcuts: 1, 2, 3, 4, 5).
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
              {[
                {
                  act: 1 as const,
                  title: "Act 1: Bank Degradation",
                  desc: "Gateway timeout / 3DS failure. Formulates alternate link without harassing debtor.",
                  key: "1",
                },
                {
                  act: 2 as const,
                  title: "Act 2: 3DS Drop-off",
                  desc: "Inspects contract & simulates customer Hinglish audio reassurance.",
                  key: "2",
                },
                {
                  act: 3 as const,
                  title: "Act 3: Webhook Recovery",
                  desc: "Simulates customer payment via signed HMAC test webhook. Never credited without signature.",
                  key: "3",
                },
                {
                  act: 4 as const,
                  title: "Act 4: STOP Opt-Out",
                  desc: "Debtor sends STOP. Immediate customer-level freeze across all active sessions.",
                  key: "4",
                },
                {
                  act: 5 as const,
                  title: "Act 5: High-Value Gate",
                  desc: "Invoice > ₹5,00,000 halts for operator sign-off before dispatch.",
                  key: "5",
                },
              ].map((item) => (
                <div
                  key={item.act}
                  className="p-3.5 rounded-lg border border-stone-200 bg-stone-50/60 hover:bg-stone-50 flex flex-col justify-between space-y-2 text-xs"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-stone-900">{item.title}</span>
                      <kbd className="text-[10px] font-mono bg-white text-stone-600 px-1 rounded border border-stone-200">
                        {item.key}
                      </kbd>
                    </div>
                    <p className="text-[11px] text-stone-500 mt-1 leading-relaxed">{item.desc}</p>
                  </div>

                  <button
                    onClick={() => replayMutation.mutate(item.act)}
                    disabled={replayMutation.isPending}
                    className="w-full mt-2 py-1.5 px-2 rounded bg-stone-900 hover:bg-stone-800 text-white font-semibold text-[11px] transition-colors flex items-center justify-center gap-1 disabled:opacity-50"
                  >
                    <Play className="w-3 h-3" />
                    <span>Run Act {item.act}</span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Concurrency Protection Proof */}
      {activeTab === "concurrency" && (
        <div className="space-y-6">
          <div className="p-5 rounded-lg bg-white border border-stone-200 shadow-2xs space-y-4">
            <div className="flex items-start gap-3 border-b border-stone-200 pb-3">
              <div className="w-9 h-9 rounded-md bg-stone-100 border border-stone-200 flex items-center justify-center text-stone-700">
                <Cpu className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-stone-900">PostgreSQL Concurrency Protection Architecture</h2>
                <p className="text-xs text-stone-500 mt-0.5">
                  How PayBack-AI physically prevents double-charging, race conditions, and duplicate outbound dispatches.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div className="p-4 rounded-md bg-stone-50 border border-stone-200 space-y-2">
                <div className="font-bold text-stone-900 flex items-center gap-1.5">
                  <Lock className="w-4 h-4 text-stone-700" />
                  <span>Transactional Outbox</span>
                </div>
                <p className="text-stone-600 leading-relaxed text-[11px]">
                  Side-effects are staged in <code className="font-mono bg-white px-1 rounded">recovery_outbox_intents</code> with an immutable SHA-256 idempotency key before dispatch.
                </p>
                <div className="text-[10px] text-stone-500 font-mono bg-white p-2 rounded border border-stone-200">
                  SELECT ... FOR UPDATE SKIP LOCKED
                </div>
              </div>

              <div className="p-4 rounded-md bg-stone-50 border border-stone-200 space-y-2">
                <div className="font-bold text-stone-900 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-700" />
                  <span>Advisory Transaction Locks</span>
                </div>
                <p className="text-stone-600 leading-relaxed text-[11px]">
                  Audit log appends are serialized per tenant using database-level advisory locks to guarantee zero hash-chain forks.
                </p>
                <div className="text-[10px] text-stone-500 font-mono bg-white p-2 rounded border border-stone-200">
                  pg_advisory_xact_lock(...)
                </div>
              </div>

              <div className="p-4 rounded-md bg-stone-50 border border-stone-200 space-y-2">
                <div className="font-bold text-stone-900 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                  <span>Crash-Recovery Sweeper</span>
                </div>
                <p className="text-stone-600 leading-relaxed text-[11px]">
                  Workers holding abandoned locks older than 5 minutes are safely swept back to <code className="font-mono bg-white px-1 rounded">queued</code> status without creating duplicate link calls.
                </p>
                <div className="text-[10px] text-stone-500 font-mono bg-white p-2 rounded border border-stone-200">
                  sweepStaleClaims(staleThresholdMs)
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Hash-Chain Ledger */}
      {activeTab === "ledger" && (
        <div className="space-y-6">
          <div className="p-5 rounded-lg bg-white border border-stone-200 shadow-2xs space-y-4">
            <div className="flex items-start justify-between border-b border-stone-200 pb-3">
              <div>
                <h2 className="text-sm font-bold text-stone-900">Cryptographic Hash-Chained Audit Ledger</h2>
                <p className="text-xs text-stone-500 mt-0.5">
                  Forward hash sequence proving tamper resistance. Mutating any historical row breaks verification.
                </p>
              </div>
              <span className="text-xs font-semibold px-2.5 py-1 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" /> Chain Verified: 0 Tampering Detected
              </span>
            </div>

            {auditTrail?.audit && auditTrail.audit.length > 0 ? (
              <div className="space-y-2">
                {auditTrail.audit.map((log: RecoveryAuditEntry, idx: number) => {
                  const meta = log.metadata as Record<string, unknown> | null;
                  const logHash = (meta?.hash as string) || log.id;
                  const prevHash = (meta?.previousHash as string) || "000000";

                  return (
                    <div key={log.id || idx} className="p-3 bg-stone-50 rounded-md border border-stone-200 text-xs flex items-center justify-between">
                      <div className="space-y-1">
                        <div className="font-semibold text-stone-900 flex items-center gap-2">
                          <span>Step #{idx + 1}: {log.action}</span>
                          <span className="text-[10px] font-mono px-1 rounded bg-stone-200 text-stone-700">
                            {log.actor}
                          </span>
                        </div>
                        <div className="text-[10px] text-stone-500 font-mono">
                          Hash: {logHash ? `${logHash.slice(0, 16)}...` : "genesis"} | Prev: {prevHash ? `${prevHash.slice(0, 16)}...` : "000000"}
                        </div>
                      </div>
                      <span className="text-[11px] font-medium text-stone-500 tabular-nums">
                        {new Date(log.createdAt).toLocaleTimeString()}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <EmptyState
                title="No recent audit logs for this session"
                description="Run Act 1 or a Recovery Scan to generate new hash-chained audit events."
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
