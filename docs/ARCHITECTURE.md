# System Architecture & Trust Boundaries

## Component Trust Boundary Table

| Component Layer | Runtime / Technology | Authority Level | Can Execute Actions? | Can Write Database? | Can Touch Money / Razorpay? |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **AI Diagnosis Layer (`ai-service`)** | Python / FastAPI / LiteLLM | **Read-Only Advisory** | ❌ **NO** (Enforced by AST ban) | ❌ **NO** (0 DB drivers imported) | ❌ **NO** (0 Razorpay SDK imports) |
| **Policy Engine (`backend/src/modules/recovery`)** | Node.js / TypeScript | **Evaluator & Guard** | ❌ **NO** (Rejects violations) | ✅ Writes Audit Log & Status | ❌ Evaluates contract against stopping rules |
| **Execution Gateway (`backend/src/modules/payment`)** | Node.js / Express | **Authorized Executor** | ✅ **YES** (Only after PolicyGuard approval) | ✅ Atomic conditional updates | ✅ **YES** (Razorpay Adapter with signed webhooks) |
| **Postgres Database (`db/schema.ts`)** | PostgreSQL 16 | **Physical Enforcer** | 🔒 Rejects race conditions | 🔒 Unique constraints, row locks | 🔒 Immutable cryptographic audit log |

---

## The Rule of AI Isolation: "The Model Recommends, Policy Code Decides, Database Enforces"

1. **AST-Enforced Import Bans**:
   The `ai-service/src/agents/` codebase is analyzed at test time using Python's `ast` module. The presence of any network request library (`requests`, `httpx`, `aiohttp`, `urllib`), database driver (`sqlalchemy`, `psycopg2`, `asyncpg`, `sqlite3`), or payment provider SDK (`razorpay`, `stripe`) causes immediate build termination.
   ```
   AST Compiler Check -> Scans all agent files -> Asserts 0 banned libraries -> PASS
   ```

2. **Zero Direct Webhook Trust from Model**:
   Payment completion is **never** accepted from an LLM prompt, agent recommendation, or user statement. The sole source of truth for payment success is an incoming Razorpay webhook verified using cryptographic HMAC SHA-256 via `crypto.timingSafeEqual`.

3. **Atomic Conditional Claims**:
   Payment recovery sessions are updated using atomic conditional SQL statements:
   ```sql
   UPDATE recovery_sessions 
   SET status = 'recovered', amount_recovered = $1, resolvedAt = NOW() 
   WHERE tenant_id = $2 AND invoice_id = $3 AND status != 'recovered' 
   RETURNING id;
   ```
   Even if 10 duplicate webhook calls fire concurrently via `Promise.all`, exactly 1 database row is modified, exactly 1 audit log entry is written, and the other 9 deliveries are recorded as duplicate ignored deliveries.

4. **Retry Slot Unique Constraints**:
   Every payment retry attempt is protected by a compound unique database index:
   ```sql
   CREATE UNIQUE INDEX payment_retry_attempts_session_attempt_uniq 
   ON payment_retry_attempts (session_id, attempt_number);
   ```
   If a network timeout causes a retry worker to re-dispatch an existing slot, Postgres physically rejects the duplicate attempt with code `23505`.

5. **In-Flight Distributed Lock & Crash Sweeper**:
   When a recovery action starts, it atomically claims the session lock via `locked_at = NOW()`. If the worker process crashes in-flight, a scheduled sweeper (`sweepStaleLocks`) detects sessions locked longer than 15 minutes, releases the lock, and safely escalates the session to human review with audit code `escalated_stale_lock`.

---

## The End-to-End Reliability Pipeline

```
API Request -> RecoveryService -> PolicyGuard -> Transactional Outbox -> Provider Adapter -> Webhook -> Ledger
```

1. **API Ingestion**: Ingests payment failure events (`invoice_id`, `amount`, `customer_id`, `failure_code`).
2. **RecoveryService**: Formulates candidate action using deterministic heuristics or LLM strategy.
3. **PolicyGuard Validation**: Pure function evaluating 8 deterministic stopping rules. Returns `{ allowed: boolean, reason?: string, rule?: string }`.
4. **Transactional Outbox (`recovery_outbox_intents`)**: Atomic insertion of intent with unique `idempotency_key = SHA256(tenantId:sessionId:actionType:attemptNumber)`. DB transaction commits intent and session state atomically.
5. **Outbox Worker & Provider Adapter**: Background worker claims intent via `SELECT ... FOR UPDATE SKIP LOCKED`. Dispatches external request via `RazorpayAdapter` with timeout & retry handling.
6. **Signed Webhook Ingestion**: Receives `payment.captured` event. Verifies signature via `crypto.createHmac('sha256', secret).update(rawBody).digest('hex')` using `crypto.timingSafeEqual`.
7. **Tamper-Evident Ledger**: Appends state change to `recovery_audit_log` with serialized advisory lock (`pg_advisory_xact_lock`) and SHA-256 hash chaining `SHA256(prevHash || payload)`.

### Tested Failure & Chaos Modes (16 Scenarios Verified)
- **Crash before external execution**: Intent remains `queued`; swept and re-claimed cleanly without duplicate side-effects.
- **Crash after external execution**: Intent marked `completed` before crash; idempotency key prevents duplicate link generation.
- **Duplicate webhook**: Secondary webhook with identical `event_id` is deduplicated; returns `200 OK` with `duplicate_ignored`.
- **Delayed webhook**: Ingested and reconciled against session even after timeout; ledger transitions cleanly.
- **Webhook signature failure**: Constant-time comparison mismatch rejects delivery immediately with `401 Unauthorized`.
- **Provider timeout**: Worker marks attempt failed, decrements retry quota, and releases lock.
- **Database outage**: Worker fails closed; zero unpersisted external dispatches allowed.
- **Worker restart / Concurrent workers**: Safe parallel execution via `FOR UPDATE SKIP LOCKED`.
- **Duplicate idempotency key**: Second dispatch with same key returns existing transaction ID; zero duplicate payment links.
- **Stale lock recovery**: Sessions stuck in-flight > 5 minutes are reclaimed by `sweepStaleClaims()`.
- **STOP opt-out during workflow**: Debtor opt-out propagates across tenant; active recovery sessions transition to `escalated`.
- **Dispute opened during recovery**: Dispute event immediately freezes active sessions (`DISPUTE_ACTIVE`).
- **Settled invoice during recovery**: Outbox dispatch aborts if invoice marked `Paid` / `Settled`.
- **Malformed LLM output**: Pydantic schema validation failure rejects output and falls back to deterministic rule with `AUDIT_PARSE_ERROR`.
- **LLM recommendation violating PolicyGuard**: PolicyGuard intercepts and blocks action with zero external dispatch.

---

## Empirical Evaluation Architecture

```
                               ┌──> 1. do_nothing
                               ├──> 2. fixed_retry
                               ├──> 3. contact_only
1,000 Payment Failures ───────┼──> 4. deterministic_policy
(Unified Denominator: ₹22.2L)  ├──> 5. simulated_llm_policy
                               ├──> 6. real_llm_policy (gated on replay cache)
                               └──> 7. oracle (exact theoretical ceiling)
```

- **Unified Denominator**: Every arm evaluated across all 1,000 cases ($N=1,000$, Failed Debt: ₹2,221,965.50, Oracle Ceiling: ₹1,203,167.01).
- **Multi-Seed Stability**: 10 deterministic seeds (42–51) calculating mean, median, min, max, std, and 95% confidence intervals.
- **Unseen Holdout Generalization**: Multi-seed holdouts (seeds 101–505 & 999, 1,500 total cases) verifying policy robustness on unseen distributions with 100.00% mean Oracle efficiency.
- **Ablation Additivity & LOFO**: 8 discrete layers evaluated with forward telescoping sum and Leave-One-Feature-Out (LOFO) order-independent causal attribution.
- **10-Parameter Sensitivity Sweeps**: Automated sweeps across failure rates, recovery probabilities, contact/retry costs, annoyance penalties, salary cycles, compliance windows, LLM error rates, provider outages, and seeds.
- **Automated Verification**: Single master command (`python scripts/verify_all.py`) runs all 13 stages and halts CI on any metric mismatch.
