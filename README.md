# PayBack-AI 

An enterprise-grade accounts receivable automation platform with an AI Revenue Recovery Engine that detects revenue at risk, determines the right intervention, executes bounded recovery workflows, and measures recovered money across every batch — with compliant escalation, hard stopping rules, a transactional outbox, and a serialized, tamper-evident cryptographic audit ledger.

---

## ⚡ One-Command Verification Workflow

PayBack-AI provides a single command to verify the entire system end-to-end — running compiler AST structural safety bans, live PostgreSQL migrations, all 13 Vitest recovery test suites (71+ automated tests), deterministic evaluation reproducibility, and oracle ceiling self-checks:

```bash
# Run from repository root
python scripts/verify_all.py

# Or via npm from backend:
npm --prefix backend run verify:all
```

**Verification Guarantees (7/7 Passing):**
- `AST Structural Safety Scan`: 0 banned network, execution, or DB imports in AI agents (`test_structural_safety.py`).
- `Vitest Recovery & Adversarial Suites`: 15 test files, 93/93 tests passing (including 13 adversarial chaos resilience scenarios, benchmark parity, mid-flight chaos crash force-kill, concurrency race, outbox safety, ledger tampering, PolicyGuard context, Act 3 webhook integrity, merchant policy, responsible contact, and economic engine).
- `Evaluation Batch Generation`: 1,000 simulated Indian business failure cases generated against fixed seed 42.
- `6-Arm Multi-Agent Batch Evaluation`: Evaluates Do-Nothing, Fixed Retry, Contact-Only, PayBack-AI Deterministic, PayBack-AI Simulated LLM, and Oracle Ceiling side-by-side with 15 standardized metrics.
- `Ablation & Sensitivity Analysis`: Decomposes value drivers across Coverage, Timing, Channel, PolicyGuard, and LLM classification/planning, with 7-dimensional sensitivity sweeps.
- `Deterministic Reproducibility`: Zero drift across sequential runs against committed baselines (`verify_reproduce.py`).
- `Oracle Ceiling Self-Check`: Automated test asserting Oracle recovery hits exactly 100.00% of theoretical maximum recoverable debt (`test_oracle_ceiling.py`).

---

## 🧠 Codebase Brain & Architecture Specification

For other AI models, automated agents, or engineers seeking a comprehensive deep dive into the whole code structure, invariants, execution boundaries, and database schema, see:

👉 **[brain.md](brain.md)** — Master Architecture, Invariants, 28-Table Schema & Complete Component Map  
👉 **[EVALUATION.md](EVALUATION.md)** — 6-Arm Benchmark, Ablation Attribution & Sensitivity Sweeps  
👉 **[FAILURES.md](FAILURES.md)** — Honest Post-Mortem & Defects Log (11 production challenges & empirical fixes)

---

## 📈 Proof of Yield: 7-Arm Canonical Benchmark (Unified 1,000-Case Denominator)

We do not merely assert AI recovery; we prove it mathematically by executing the **actual production code**:
1. **Multi-Agent Decision Pipeline**: `RecoveryAgent`, `PaymentRetryAgent`, and `MandateSequencerAgent` analyze observable invoice features to diagnose root cause, select incident lanes, and plan retry schedules.
2. **Deterministic Enforcement Engine**: `PolicyGuard.validate()` in TypeScript (`backend/src/modules/recovery/recovery.contract.ts`) evaluates hard legal stops, opt-outs, dispute freezes, and broken promise limits.
3. **Causal Recovery**: Lane-specific recovery succeeds *only* when the agent's diagnosed lane matches the customer's actual incident lane.

Following the evaluation integrity standards modeled on [`piyush2676/recoverx`](https://github.com/piyush2676/recoverx), [`Ovais-Maker/razorpay-buildathon-recoup`](https://github.com/Ovais-Maker/razorpay-buildathon-recoup), and [`iamsiddhesh-dev/recoup`](https://github.com/iamsiddhesh-dev/recoup), PayBack-AI evaluates recovery across a **100% unified complete dataset (1,000 cases, Seed 42)** to remove denominator inconsistencies:

| Metric | 1. Do Nothing | 2. Fixed Retry | 3. Contact Only | 4. PayBack-AI Deterministic | 5. PayBack-AI Simulated LLM | 6. Real LLM Policy | 7. Oracle Ceiling |
|---|---|---|---|---|---|---|---|
| **Total Failed Value (₹)** | ₹22,21,965.50 | ₹22,21,965.50 | ₹22,21,965.50 | ₹22,21,965.50 | ₹22,21,965.50 | Gated (offline) | ₹22,21,965.50 |
| **Oracle Ceiling (₹)** | ₹12,03,167.01 | ₹12,03,167.01 | ₹12,03,167.01 | ₹12,03,167.01 | ₹12,03,167.01 | Gated (offline) | ₹12,03,167.01 |
| **Gross Recovered (₹)** | ₹3,52,002.94 | ₹7,30,703.24 | ₹7,30,703.24 | **₹11,62,390.82** | **₹11,89,650.23** | Gated | ₹12,03,167.01 |
| **Organic Recovery (₹)** | ₹3,52,002.94 | ₹3,52,002.94 | ₹3,52,002.94 | ₹3,52,002.94 | ₹3,52,002.94 | Gated | ₹3,52,002.94 |
| **Incremental Recovery (₹)** | Baseline (₹0.00) | ₹3,78,700.30 | ₹3,78,700.30 | **₹8,10,387.88** | **₹8,37,647.29** | Gated | **₹8,51,164.07** |
| **% of Oracle Ceiling** | 29.26% | 60.73% | 60.73% | **96.61%** | **98.88%** | Gated | **100.00%** |
| **% of Total Failed Value** | 15.84% | 32.89% | 32.89% | **52.31%** | **53.54%** | Gated | 54.15% |
| **Net Recovered Value (₹)** | ₹3,52,002.94 | ₹7,28,703.24 | ₹7,29,203.24 | **₹11,60,769.32** | **₹11,87,999.37** | Gated | ₹12,02,598.51 |
| **Contact Count** | 0 | 1,000 | 1,000 | 1,040 | 1,032 | Gated | 379 |
| **Retry Count** | 0 | 1,000 | 0 | 123 | 117 | Gated | 0 |
| **Compliance Violations** | **0** | **123** (opt-out/90d) | **123** (opt-out/90d) | **0** (PolicyGuard) | **0** (PolicyGuard) | Gated | **0** |
| **Duplicate Charges** | **0** | **0** | **0** | **0** | **0** | Gated | **0** |
| **Human Escalations** | 0 | 0 | 0 | 60 | 60 | Gated | 0 |
| **Cost per Recovered Rupee (₹)** | ₹0.0000 | ₹0.0027 | ₹0.0021 | **₹0.0014** | **₹0.0014** | Gated | ₹0.0005 |
| **LLM Inference Cost (₹)** | ₹0.00 | ₹0.00 | ₹0.00 | ₹0.00 | ₹44.36 | Gated | ₹0.00 |

*Note on Arm 6 (`real_llm_policy`)*: Strictly gated offline. In compliance with evaluation honesty rules, offline traces are explicitly labeled as `simulated_llm_policy`. Replay mode requires recorded provider traces with loud-fail `KeyError` on miss.

### Multi-Seed Statistical Rigor (10 Deterministic Seeds: 42–51)
- **Total Portfolio (Mean ± 95% CI)**: ₹22,33,859.80 [₹22,16,742.80, ₹22,50,976.81]
- **Oracle Recoverable Ceiling (Mean ± 95% CI)**: ₹11,82,928.35 [₹11,58,484.51, ₹12,07,372.19]
- **Simulated LLM Gross Recovery (Mean ± 95% CI)**: ₹11,68,465.56 [₹11,44,061.22, ₹11,92,869.89]
- **Oracle Efficiency (Mean ± 95% CI)**: **98.78%** [98.29%, 99.26%]
- **Incremental Lift (Mean ± 95% CI)**: ₹8,30,996.93 [₹8,08,309.83, ₹8,53,684.03]

### Hidden Holdout Generalization (250 Cases, Seed 999)
- **Uninspected Holdout Debt**: ₹5,59,264.28 across 250 isolated cases.
- **Holdout Oracle Ceiling**: ₹3,03,421.18 | **Holdout Recovery**: ₹3,01,600.65 (**99.40% Oracle Efficiency**).
- **Proves Generalization**: Policy rules and prompt strategies generalize out-of-sample without overfitting.

### Harness Self-Check Coherence
- **Test**: `backend/test/modules/recovery/readme-metrics-recompute.test.ts`
- **Assertion**: `oracle_recovered == oracle_ceiling` (100.00% exact match down to ₹0.00).
- **CI Guarantee**: CI fails automatically if any metric in this README differs from regenerated raw output.

---

## 🏆 Key Architectural Differentiators

| Feature | Implementation & Mathematical Proof |
|---|---|
| **Dual-Denominator Yield** | Evaluates against both **Total Failed Value** and **Oracle Ceiling**; includes automated harness self-check (`100.0%` ceiling assertion). |
| **Adversarial Chaos & Crash Resilience** | Proves 0 double-charges and 0 duplicate links under mid-flight worker `process.exit(1)` hard process halts (`chaos-crash.test.ts`). |
| **8 PolicyGuard Stopping Rules** | Hard stops covering settled invoices, STOP opt-outs, active disputes, retry caps, cooldown windows, >90d legal stop, high-value human approval, and economic floor. |
| **Transactional Outbox** | Two-phase dispatch via `recovery_outbox_intents` + `SELECT ... FOR UPDATE SKIP LOCKED` to guarantee exactly-once payment link creation and messaging. |
| **Atomic Tamper-Evident Ledger** | Serialized hash-chain appends via PostgreSQL advisory transaction locks (`pg_advisory_xact_lock`), SHA-256 chain verification, and database immutability guards. |
| **Versioned Merchant Policy** | Dynamic policy loading from `merchant_policies.yaml` validated with Zod, with deterministic SHA-256 `policyHash` stamped on every contract and audit event. |
| **Responsible-Contact Controls** | Timezone-aware quiet hours (21:00–08:00 IST), customer channel preferences, customer-level 24h contact caps, and STOP opt-out propagation across all sessions. |
| **AST-Enforced AI Isolation** | Compiler-level AST inspection (`test_structural_safety.py`) guarantees 0 payment SDKs, HTTP clients, or DB drivers exist in the AI agent layer. |
| **Webhook Truth Boundary** | Executing a recovery action NEVER marks a session recovered; money is recorded strictly upon validated Razorpay `payment.captured` HMAC SHA-256 signed webhook. |

---

## 🏗️ Architecture & Component Trust Boundaries

```mermaid
graph TD
    A[React Recovery Control Tower] <-->|REST API| B[Express Backend API]

    B -->|1. Evaluate Policy & Economics| C[PolicyGuard & EconomicEngine]
    B -->|2. Transactional Outbox| D[(PostgreSQL outbox_intents)]
    D -->|3. Atomic Claim FOR UPDATE SKIP LOCKED| E[Outbox Worker]
    E -->|4. Test Link Generation| F[Razorpay Test API]
    E -->|5. Multi-Channel Dispatch| G[CommunicationService]
    
    B -->|Advisory Lock & Hash-Chain| H[(PostgreSQL recovery_audit_log)]
    
    F -->|Signed Webhook payment.captured| B
    B -->|Validate HMAC SHA-256 Signature| I[PaymentService.processPaymentCaptured]
    I -->|Atomic Conditional Update| J[(recovery_sessions: recovered)]
```

### Trust Boundaries & Execution Authority

| Layer | Runtime | Authority Level | Can Execute External Actions? | Can Write DB? | Can Touch Money / Razorpay? |
|---|---|---|---|---|---|
| **AI Advisory Layer** (`ai-service/src/agents`) | Python 3.13 / FastAPI | **Read-Only Advisory** | ❌ **NO** (AST banned) | ❌ **NO** (0 DB drivers) | ❌ **NO** (0 Payment SDKs) |
| **Policy Engine** (`backend/src/modules/recovery`) | Node.js / TypeScript | **Deterministic Guard** | ❌ **NO** (Policy evaluator) | ✅ Audit Log & Status | ❌ Enforces stopping rules & floors |
| **Execution Gateway** (`backend/src/modules/payment`) | Node.js / Express | **Authorized Executor** | ✅ **YES** (Outbox claimed) | ✅ Atomic SQL updates | ✅ **YES** (Signed Razorpay webhooks) |
| **PostgreSQL Database** (`backend/src/db/schema.ts`) | PostgreSQL 16 | **Physical Enforcer** | 🔒 Rejects race conditions | 🔒 Unique compound indexes | 🔒 Immutable cryptographic ledger |

---

## 🛡️ Deep Dives: Reliability & Adversarial Correctness

### 1. Mid-Flight Chaos & Force-Kill Crash Testing (`chaos-crash.test.ts`)
Modeled on `piyush2676/recoverx`, we test unexpected worker process termination between "action executed" and "outcome recorded":
- The worker executes payment link generation and **force-kills itself with `process.exit(1)` mid-flight** without committing completion or releasing the lock.
- Resumption tests verify that **0 duplicate links and 0 double charges** occur.
- Reports which active defense layer intercepted the race:
  - **`SESSION_IN_FLIGHT_LOCK`**: Blocked immediate retry attempts while the crashed worker held the session lock.
  - **`IDEMPOTENCY_KEY_UNIQUE_CONSTRAINT`**: PostgreSQL unique constraint on `idempotency_key` (`23505`) suppressed duplicate action intent upon worker reboot.
  - **`STALE_LOCK_SWEEPER`**: Resolved orphaned locks past timeout threshold, escalating to human review with an audit trail.

### 2. Atomic Tamper-Evident Hash Chain Ledger (`verify-ledger.ts`)
Every recovery event produces an immutable, cryptographically chained record in `recovery_audit_log`:
- Appends are serialized per tenant using PostgreSQL transaction-level advisory locks:
  ```sql
  SELECT pg_advisory_xact_lock(hashtext('recovery_ledger_' || tenant_id));
  ```
- Each entry embeds `previous_hash` pointing to the topological head of the tenant's chain, computing:
  $$\text{hash} = \text{SHA256}(\text{previous\_hash} \parallel \text{payload})$$
- Verified under concurrent `Promise.all` bursts in `concurrency-race.test.ts`. Any auditor can verify the database independently:
  ```bash
  npx tsx src/scripts/verify-ledger.ts <tenantId>
  ```

### 3. Transactional Outbox Pattern
To prevent duplicate payment link generation or communication spam during network timeouts or worker crashes:
- Every recovery intent is persisted to `recovery_outbox_intents` with an immutable `idempotency_key` inside the database transaction before calling any external provider.
- Outbox workers atomically claim pending intents using:
  ```sql
  SELECT * FROM recovery_outbox_intents
  WHERE status = 'queued' AND tenant_id = $1
  ORDER BY created_at ASC
  FOR UPDATE SKIP LOCKED
  LIMIT 1;
  ```
- Proven in `outbox-concurrency.test.ts`.

### 4. The 8 Hard PolicyGuard Stopping Rules
Recovery actions are subjected to deterministic, execution-time PolicyGuard checks immediately before dispatch:

| Rule | Trigger Condition | Outcome State | Reason Code |
|---|---|---|---|
| **1. Invoice Settled** | `invoiceStatus IN ('Paid', 'Written Off')` | `escalated` / `recovered` | `INVOICE_SETTLED` |
| **2. Customer Opt-Out** | Debtor sent `STOP` reply keyword | `escalated` | `CUSTOMER_OPTED_OUT` |
| **3. Active Dispute** | Active dispute, chargeback, or refund pending | `escalated` | `DISPUTE_ACTIVE` |
| **4. Max Retries Reached** | Retry count $\ge$ policy max attempts (e.g. 3) | `escalated` | `MAX_ATTEMPTS_EXCEEDED` |
| **5. Cooldown Active** | Elapsed time since last action < cooldown (e.g. 24h) | `escalated` | `COOLDOWN_ACTIVE` |
| **6. 90-Day Overdue Cap** | Invoice `daysOverdue > 90` (statutory ceiling) | `escalated` | `LEGAL_STOP` |
| **7. High-Value Guard** | Amount > approval threshold (e.g. ₹5,00,000) without approval | `escalated` | `HUMAN_APPROVAL_REQUIRED` |
| **8. Economic Floor** | Amount < economic viability floor (e.g. ₹100) | `escalated` | `ECONOMIC_FLOOR_VIOLATION` |

---

## 🛠️ Quick Start & Local Execution

### Prerequisites
- Node.js 20+
- Python 3.11+
- PostgreSQL 16 (or Supabase / RDS connection)

### Setup & Run

```bash
# 1. Clone repository
git clone https://github.com/Adityaa024/PayBack-AI.git
cd PayBack-AI

# 2. Install backend dependencies
cd backend && npm install

# 3. Run database migrations
npm run db:migrate

# 4. Install AI service dependencies
cd ../ai-service && pip install -r requirements.txt

# 5. Run full system verification (1 command, all 6 steps)
cd .. && python scripts/verify_all.py
```

### Environment Variables
Copy `.env.example` to `.env` in `backend/` and `ai-service/`:
- `DATABASE_URL` — PostgreSQL connection string
- `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` — Razorpay test keys (`rzp_test_*`)
- `RAZORPAY_WEBHOOK_SECRET` — HMAC secret for payment webhooks
- `ALLOW_IN_MEMORY_FALLBACK` — Defaults to `false` (fail-closed in production)
- `DEMO_MODE` — Defaults to `false` (restricts demo resets)

---

## 📁 Repository Structure

```
.
├── backend/                       # Express + TypeScript + Drizzle ORM
│   ├── src/
│   │   ├── db/                    # PostgreSQL schema (recovery tables, outbox, audit log)
│   │   ├── modules/
│   │   │   ├── recovery/          # Flagship AI Revenue Recovery engine
│   │   │   │   ├── recovery.contract.ts    # RecoveryContract schema & PolicyGuard
│   │   │   │   ├── recovery.service.ts     # Lifecycle orchestration & webhooks
│   │   │   │   ├── recovery.repository.ts  # Advisory locks, ledger & DB operations
│   │   │   │   ├── outbox.service.ts       # Transactional outbox worker
│   │   │   │   ├── economic-engine.ts      # EIV calculation & decile calibration
│   │   │   │   └── recovery.holdout.ts     # 20% Hash-Based Holdout Control Arm
│   │   │   └── policy/
│   │   │       ├── merchant-policy.service.ts   # Versioned YAML policy loader & SHA-256 hasher
│   │   │       └── responsible-contact.service.ts # Quiet hours, channel caps & opt-out
│   │   └── config/env.ts          # Fail-closed operational environment config
│   └── test/modules/recovery/     # 13 comprehensive Vitest test suites (71+ tests)
├── ai-service/                    # Python FastAPI AI service
│   ├── config/
│   │   └── merchant_policies.yaml # Versioned merchant policy configuration source of truth
│   ├── scripts/
│   │   ├── generate_dataset.py    # Synthetic batch dataset generator (fixed seed 42)
│   │   ├── run_evaluation.py      # Evaluation runner (delegates to evaluate-batch.ts)
│   │   ├── verify_reproduce.py    # Deterministic evaluation reproducibility test
│   │   └── world_assumptions.yaml # Documented world assumptions
│   └── test/
│       ├── test_oracle_ceiling.py # Oracle ceiling 100% coherence self-check
│       └── src/test_structural_safety.py # Compiler-level AST import scanner
├── frontend/                      # React SPA (Recovery Control Tower & Analytics)
├── reports/                       # Generated evaluation batches, evaluation.json
├── scripts/
│   └── verify_all.py              # One-command 6-step system verification pipeline
├── brain.md                       # Master architecture, 7 invariants & full code structure
├── EVALUATION.md                  # Real-code dual-denominator empirical report
└── FAILURES.md                    # Defect log and architectural post-mortems (10 entries)
```

---

## ⚖️ Operational Disclaimer

- **Test Mode**: All Razorpay calls use test API credentials (`rzp_test_*`). Real currency is never transferred.
- **Simulated Channels**: Voice negotiations use the browser Web Speech API for interactive demo presentations; SMS and WhatsApp dispatches use sandboxed provider adapters. Email integrates with real SendGrid / SMTP when credentials are provided.
- **Fail-Closed Safety**: In production mode (`ALLOW_IN_MEMORY_FALLBACK=false`), any unavailability of PostgreSQL or advisory locks immediately aborts the recovery workflow, halts external side-effects, and raises an operational alert.
