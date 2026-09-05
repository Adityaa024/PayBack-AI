import { useState } from "react";
import {
  ShieldCheck, Clock, CheckCircle2, Save
} from "lucide-react";

interface WorkflowRule {
  id: string;
  name: string;
  lane: string;
  trigger: string;
  channel: "email" | "sms" | "whatsapp" | "voice";
  cooldownHours: number;
  maxAttempts: number;
  approvalThreshold: number;
  quietHoursStart: string;
  quietHoursEnd: string;
  status: "active" | "draft";
}

export function WorkflowsPolicy() {
  // Local state workflow configuration
  const [rules, setRules] = useState<WorkflowRule[]>([
    {
      id: "wf-1",
      name: "Payment Degradation Auto-Refresh",
      lane: "Payment Degradation",
      trigger: "Banking Gateway Timeout / 3DS Failure",
      channel: "email",
      cooldownHours: 4,
      maxAttempts: 3,
      approvalThreshold: 500000,
      quietHoursStart: "21:00",
      quietHoursEnd: "08:00",
      status: "active",
    },
    {
      id: "wf-2",
      name: "Subscription Rescue Grace Window",
      lane: "Subscription Rescue",
      trigger: "Mandate Debit Decline / Insufficient Funds",
      channel: "email",
      cooldownHours: 24,
      maxAttempts: 3,
      approvalThreshold: 200000,
      quietHoursStart: "21:00",
      quietHoursEnd: "08:00",
      status: "active",
    },
    {
      id: "wf-3",
      name: "B2B Overdue Commercial Escalation",
      lane: "B2B Receivables",
      trigger: "Invoice Overdue > 14 Days",
      channel: "whatsapp",
      cooldownHours: 48,
      maxAttempts: 3,
      approvalThreshold: 500000,
      quietHoursStart: "20:00",
      quietHoursEnd: "09:00",
      status: "active",
    },
    {
      id: "wf-4",
      name: "Checkout Abandonment Urgent Link",
      lane: "Checkout Drop-off",
      trigger: "Cart Drop-off > 35 Minutes",
      channel: "sms",
      cooldownHours: 12,
      maxAttempts: 2,
      approvalThreshold: 100000,
      quietHoursStart: "21:00",
      quietHoursEnd: "08:00",
      status: "active",
    },
  ]);

  const [selectedRuleId, setSelectedRuleId] = useState<string>("wf-1");
  const [isSavedNotice, setIsSavedNotice] = useState(false);

  const activeRule = rules.find((r) => r.id === selectedRuleId) || rules[0];

  const handleUpdate = (updates: Partial<WorkflowRule>) => {
    setRules((prev) =>
      prev.map((r) => (r.id === activeRule.id ? { ...r, ...updates, status: "draft" } : r))
    );
  };

  const handleSave = () => {
    setRules((prev) =>
      prev.map((r) => (r.id === activeRule.id ? { ...r, status: "active" } : r))
    );
    setIsSavedNotice(true);
    setTimeout(() => setIsSavedNotice(false), 3000);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-stone-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wider bg-stone-200 text-stone-700">
              Governance & Policies
            </span>
            <span className="text-xs text-stone-500 font-mono">Policy Spec v1.4.0 (SHA-256 Hashed)</span>
          </div>
          <h1 className="text-2xl font-bold text-stone-900 tracking-tight mt-1">Workflows & PolicyGuard Rules</h1>
          <p className="text-xs text-stone-500 mt-0.5">
            Configure automated retry limits, outreach cooldown windows, quiet hours, and mandatory human sign-off ceilings.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {isSavedNotice && (
            <span className="text-xs font-medium text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded border border-emerald-200 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> Policy Changes Saved Locally
            </span>
          )}
          <button
            onClick={handleSave}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#991B1B] hover:bg-[#7F1D1D] text-white text-xs font-semibold shadow-xs transition-colors"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Save Active Policy</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Rules List */}
        <div className="space-y-3">
          <h2 className="text-xs font-bold text-stone-900 uppercase tracking-wider">
            Configured Incident Lanes
          </h2>
          <div className="space-y-2">
            {rules.map((rule) => (
              <div
                key={rule.id}
                onClick={() => setSelectedRuleId(rule.id)}
                className={`p-3.5 rounded-lg border transition-all cursor-pointer text-left ${
                  rule.id === selectedRuleId
                    ? "bg-white border-stone-900 shadow-xs"
                    : "bg-stone-50 border-stone-200 hover:bg-white hover:border-stone-300"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-stone-900">{rule.name}</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded uppercase font-semibold ${
                      rule.status === "active"
                        ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                        : "bg-amber-50 text-amber-800 border border-amber-200"
                    }`}
                  >
                    {rule.status}
                  </span>
                </div>
                <div className="text-[11px] text-stone-500 mt-1">Lane: {rule.lane}</div>
                <div className="flex items-center gap-3 mt-2 text-[11px] text-stone-600 font-medium">
                  <span>Cap: {rule.maxAttempts} touches</span>
                  <span>Cooldown: {rule.cooldownHours}h</span>
                  <span className="uppercase">{rule.channel}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Policy Notice */}
          <div className="p-3.5 rounded-lg bg-stone-100 border border-stone-200 text-xs text-stone-600 space-y-1">
            <div className="font-semibold text-stone-800 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-700" />
              <span>Merchant Policy Source of Truth</span>
            </div>
            <p className="text-[11px] text-stone-500 leading-relaxed">
              Base policies load from <code className="font-mono bg-white px-1 rounded text-stone-700">merchant_policies.yaml</code>. Changes made here simulate local adjustments for dry-run validation.
            </p>
          </div>
        </div>

        {/* Center & Right Columns: Visual Policy Editor */}
        <div className="lg:col-span-2 space-y-5">
          <div className="p-5 rounded-lg bg-white border border-stone-200 shadow-2xs space-y-5">
            <div className="border-b border-stone-200 pb-3 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-stone-900">{activeRule.name}</h3>
                <p className="text-xs text-stone-500 mt-0.5">Edit recovery boundaries and compliance gates.</p>
              </div>
              <span className="text-xs font-mono text-stone-400">ID: {activeRule.id}</span>
            </div>

            {/* Visual Pipeline Flow */}
            <div className="p-3 bg-stone-50 rounded-md border border-stone-200">
              <div className="text-[11px] font-bold uppercase tracking-wider text-stone-500 mb-2">
                Execution Pipeline Flow
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs font-medium">
                <span className="px-2 py-1 rounded bg-white border border-stone-300 text-stone-800">
                  1. Trigger: {activeRule.trigger}
                </span>
                <span className="text-stone-400">→</span>
                <span className="px-2 py-1 rounded bg-white border border-stone-300 text-stone-800">
                  2. Channel: {activeRule.channel.toUpperCase()}
                </span>
                <span className="text-stone-400">→</span>
                <span className="px-2 py-1 rounded bg-emerald-50 border border-emerald-200 text-emerald-800">
                  3. PolicyGuard Check (8 Rules)
                </span>
                <span className="text-stone-400">→</span>
                <span className="px-2 py-1 rounded bg-white border border-stone-300 text-stone-800">
                  4. Transactional Outbox Dispatch
                </span>
              </div>
            </div>

            {/* Form Fields */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              {/* Channel */}
              <div>
                <label className="block font-semibold text-stone-700 mb-1">Outreach Channel Rail</label>
                <select
                  value={activeRule.channel}
                  onChange={(e) => handleUpdate({ channel: e.target.value as "email" | "sms" | "whatsapp" | "voice" })}
                  className="w-full p-2 bg-stone-50 border border-stone-300 rounded-md text-stone-900 focus:outline-none focus:border-stone-500 font-medium"
                >
                  <option value="email">Email (SendGrid / Resend / SMTP)</option>
                  <option value="sms">SMS (Sandboxed Telecom Provider)</option>
                  <option value="whatsapp">WhatsApp Business API</option>
                  <option value="voice">Interactive Hinglish Voice Synthesis</option>
                </select>
                <span className="text-[10px] text-stone-500 mt-0.5 block">
                  Customer consent and quiet hours strictly validated prior to dispatch.
                </span>
              </div>

              {/* Cooldown Hours */}
              <div>
                <label className="block font-semibold text-stone-700 mb-1">
                  Mandatory Touch Cooldown (Hours)
                </label>
                <input
                  type="number"
                  min="1"
                  max="168"
                  value={activeRule.cooldownHours}
                  onChange={(e) => handleUpdate({ cooldownHours: parseInt(e.target.value) || 1 })}
                  className="w-full p-2 bg-stone-50 border border-stone-300 rounded-md text-stone-900 focus:outline-none focus:border-stone-500 font-medium"
                />
                <span className="text-[10px] text-stone-500 mt-0.5 block">
                  Enforces minimum elapsed time between recovery attempts.
                </span>
              </div>

              {/* Retry Attempt Ceiling */}
              <div>
                <label className="block font-semibold text-stone-700 mb-1">
                  Maximum Retry Attempts Ceiling
                </label>
                <input
                  type="number"
                  min="1"
                  max="5"
                  value={activeRule.maxAttempts}
                  onChange={(e) => handleUpdate({ maxAttempts: parseInt(e.target.value) || 1 })}
                  className="w-full p-2 bg-stone-50 border border-stone-300 rounded-md text-stone-900 focus:outline-none focus:border-stone-500 font-medium"
                />
                <span className="text-[10px] text-stone-500 mt-0.5 block">
                  Upon exceeding this limit, the case transitions to Escalated.
                </span>
              </div>

              {/* Human Approval Ceiling */}
              <div>
                <label className="block font-semibold text-stone-700 mb-1">
                  Mandatory Human Approval Threshold (₹)
                </label>
                <input
                  type="number"
                  step="50000"
                  value={activeRule.approvalThreshold}
                  onChange={(e) => handleUpdate({ approvalThreshold: parseFloat(e.target.value) || 0 })}
                  className="w-full p-2 bg-stone-50 border border-stone-300 rounded-md text-stone-900 focus:outline-none focus:border-stone-500 font-medium"
                />
                <span className="text-[10px] text-stone-500 mt-0.5 block">
                  Invoices exceeding this exposure cannot execute without operator sign-off.
                </span>
              </div>

              {/* Quiet Hours Window */}
              <div className="sm:col-span-2 grid grid-cols-2 gap-3 p-3 bg-stone-50 rounded-md border border-stone-200">
                <div>
                  <label className="block font-semibold text-stone-700 mb-1">Quiet Hours Start</label>
                  <input
                    type="time"
                    value={activeRule.quietHoursStart}
                    onChange={(e) => handleUpdate({ quietHoursStart: e.target.value })}
                    className="w-full p-2 bg-white border border-stone-300 rounded-md text-stone-900 font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-stone-700 mb-1">Quiet Hours End</label>
                  <input
                    type="time"
                    value={activeRule.quietHoursEnd}
                    onChange={(e) => handleUpdate({ quietHoursEnd: e.target.value })}
                    className="w-full p-2 bg-white border border-stone-300 rounded-md text-stone-900 font-mono text-xs"
                  />
                </div>
                <div className="col-span-2 text-[11px] text-stone-500">
                  <Clock className="w-3.5 h-3.5 inline mr-1 text-stone-400" />
                  Applies strictly in debtor local timezone (default Asia/Kolkata). Outreach queued during quiet hours is withheld until 08:00 AM.
                </div>
              </div>
            </div>
          </div>

          {/* The 8 Hard Stopping Rules Reference */}
          <div className="p-5 rounded-lg bg-white border border-stone-200 shadow-2xs space-y-3">
            <h3 className="text-xs font-bold text-stone-900 uppercase tracking-wider">
              The 8 Deterministic Stopping Rules (PolicyGuard)
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              {[
                { title: "1. Invoice Settled", desc: "Blocks outreach if invoice is Paid or Written Off." },
                { title: "2. STOP Opt-Out", desc: "Immediate customer freeze across all active sessions." },
                { title: "3. Active Dispute", desc: "Halts communications if a dispute or chargeback is filed." },
                { title: "4. Max Retries", desc: "Strictly enforces 3-attempt dunning ceiling." },
                { title: "5. Cooldown Window", desc: "Blocks touches within 24 hours of prior contact." },
                { title: "6. 90-Day Legal Cap", desc: "Ceases automated recovery if overdue > 90 days." },
                { title: "7. High-Value Ceiling", desc: "Mandatory human review for amounts > ₹5,00,000." },
                { title: "8. Economic Floor", desc: "Invoices below ₹100 are rejected as unviable." },
              ].map((rule, idx) => (
                <div key={idx} className="p-2.5 rounded bg-stone-50 border border-stone-200">
                  <div className="font-semibold text-stone-800 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                    <span>{rule.title}</span>
                  </div>
                  <div className="text-[11px] text-stone-500 mt-0.5 pl-5">{rule.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
