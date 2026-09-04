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

## The 6 Hard Stopping Rules + Economic Floor Guard

Every automated action recommended by the AI layer must pass deterministic validation in `PolicyGuard` before any API call is dispatched:

1. **90-Day Overdue Hard Cap**: Invoices older than 90 days are escalated to human collections to prevent automated harassment.
2. **3-Retry Ceiling**: No invoice may undergo more than 3 automated payment link or mandate retry attempts.
3. **PTP-Broken-Twice**: If a customer breaks a Promise-to-Pay (PTP) twice, automated reminders stop and the case escalates to manual intervention.
4. **DLQ Threshold (Dead Letter Queue)**: Exhausted recovery sessions transition into an explicit `escalated` state for operator review.
5. **Mandate-Cap**: Subscriptions with recurring mandate rejections are capped after 3 tries.
6. **Invoice-Paid / Settled**: Any settled, paid, or written-off invoice instantly halts all active recovery sessions.
7. **Economic Floor Check (< ₹100)**: Any invoice with amount below ₹100 is skipped as economically unviable for recovery communication costs.
