# PayBack-AI — Google Form Hackathon Submission Copy

---

## 1. Project Objectives

When we set out to build **PayBack-AI** for Razorpay AI Buildathon (Track 3: AI Revenue Recovery), our goal was simple but ambitious: **stop treating failed payments and unpaid invoices as lost causes, and build an intelligent engine that actively wins that money back.**

In the fintech and SaaS world, recovered revenue is the best kind of money you can make—it drops straight to your bottom line with zero customer acquisition cost. But right now, the way businesses handle failed revenue is fundamentally broken. Most tools just notify a team on Slack or fire dumb retry scripts that annoy customers and break compliance rules.

We set five core objectives for PayBack-AI:
1. **Close the Complete Recovery Loop**: Don't just detect problems or dump alerts on an already overwhelmed finance team. Autonomously triage the failure, figure out the root cause, pick the right intervention, execute it across Razorpay rails, and track it until the money actually hits the bank account.
2. **Adhere to "The Model Recommends; Deterministic Code Decides"**: AI should be used for what it’s great at—diagnosing nuanced human and banking failures, picking strategies, and adapting communication. But AI should **never** touch raw ledger money or make compliance calls. We wanted an architecture where deterministic guardrails (`PolicyGuard`) strictly hold the veto power over every action.
3. **Guarantee Zero-Money Hallucination**: An agent should never celebrate or count money recovered just because it sent an email or generated a link. A session is only marked recovered when a cryptographically verified Razorpay `payment.captured` webhook lands in our system.
4. **Enforce 100% Ethical & Compliant Recovery**: Recovery shouldn't feel like predatory debt collection. Our objective was to enforce strict RBI quiet hours (no messages between 9 PM and 8 AM), respect instant `STOP` opt-outs, cap contact frequencies, and offer flexible installment options instead of threatening customers.
5. **Prove Real, Causal Numbers**: We didn't want to make vanity claims. We wanted to measure our results against a true organic baseline (what would have been recovered naturally anyway) and measure against a theoretical mathematical ceiling across 20,000 cases to prove real incremental lift.

---

## 2. What Does It Solve?

### The Real-World Problem We See Every Day
Revenue loss rarely happens in one clean, obvious step. It bleeds out silently across multiple touchpoints:
- A customer tries to pay, but their bank's netbanking page times out.
- A monthly subscription mandate fails because of a temporary balance dip before payday.
- An enterprise client delays a large invoice because their own payments got stuck.
- A shopper gets distracted during checkout after an OTP fails.

Across India, over **₹12.5 lakh crore ($150 billion)** in working capital is trapped in delayed trade receivables and unpaid invoices. At the same time, online businesses lose **15% to 20% of their recurring customers to involuntary churn**—meaning the customer actually wanted the product, but a payment glitch quietly kicked them out.

### The Broken Choice Merchants Face Today
Currently, businesses are trapped between two terrible choices:
1. **Do Nothing (Passive Write-Offs)**: Small finance teams simply don’t have the time to follow up on hundreds of low-to-mid ticket unpaid accounts. Over time, these invoices get written off as bad debt. In our benchmarks, doing nothing leaves over ₹10.6 lakh uncollected for every 1,000 failed cases.
2. **Dumb Aggressive Badgering (Fixed Retries)**: Businesses buy automated tools that repeatedly ping failed cards or spam customers with generic "PAY NOW" reminders every few hours. This annoys customers, triggers bank chargeback penalties, damages brand reputation, and racks up severe regulatory violations (contacting people at midnight, chasing statutory 90-day expired debt, or ignoring opt-outs).

### How PayBack-AI Solves This Across 4 Lanes

PayBack-AI replaces both extremes with intelligent, empathetic, and bounded workflows tailored to four specific scenarios:

1. **Transient Payment Degradation**:
   When an HDFC or SBI gateway experiences temporary 3DS latency or a UPI handle times out, PayBack-AI doesn't spam the user. It recognizes that this is a temporary bank outage, waits for the bank recovery window, or automatically sends a fresh, secure Razorpay payment link over an alternate healthy rail (like switching to UPI if a card rail is failing).

2. **Subscription Rescue & Smart Mandate Sequencing**:
   When recurring UPI Autopay or e-mandates fail, our agent analyzes liquidity cycles and reschedules the retry around salary windows (such as the 1st–5th of the month) rather than burning through all allowed retries on day one. It also sends secure, self-serve card update links before subscriptions get prematurely canceled.

3. **B2B Receivables & Cash-Flow Support**:
   For large, overdue business invoices, aggressive demands usually get ignored. PayBack-AI engages clients constructively by offering structured, interest-free installment plans (e.g., clearing the balance across 2 to 6 months) and tracking formal "Promise-to-Pay" commitments. If a customer raises a billing discrepancy, the system immediately freezes recovery outreach to let human account managers resolve the issue without harassing the client.

4. **Checkout Drop-Off Recovery**:
   When buyers drop off at the final checkout step, PayBack-AI sends an itemized, time-boxed (48-hour) Razorpay payment link via WhatsApp or SMS, turning an abandoned cart into a one-tap completed purchase.

### Built-in Guardrails & Humanized Design
What truly sets this apart is how safe and respectful it is:
- **PolicyGuard Defense**: Every intervention is checked against 8 deterministic stopping rules. If an invoice was already paid, if a customer texted `STOP`, if a dispute was filed, or if an account is past the 90-day legal ceiling, outreach is blocked instantly.
- **Culturally Attuned Communication**: It generates friendly, de-escalating Hinglish messages that explain what happened clearly without making the customer feel like they're being targeted by a collection agency.
- **Enterprise Reliability**: If our server or worker crashes mid-transaction, our transactional outbox pattern guarantees that not a single duplicate link or double charge will ever occur.

### The Bottom Line
In our 1,000-case canonical benchmark, PayBack-AI unlocked **₹12.11 lakh in gross recovery** (+₹8.59 lakh in net incremental lift above the do-nothing baseline), capturing **85.50% of the theoretical maximum recoverable ceiling** with **zero compliance violations** (compared to 143 violations from standard automated tools). It turns revenue recovery from a messy, stressful chore into a reliable, automated growth engine that merchants and customers can actually trust.

---

## 3. Build Challenges & Technical Obstacles
### What issues did you face while building, and how did you solve them?

Building an autonomous revenue recovery engine that touches both real financial rails and customer relationships forced us to confront messy real-world edge cases early on. In fintech, there is zero margin for error—an agent cannot hallucinate settled revenue, a background worker cannot double-charge an invoice after a crash, and outreach can never violate statutory compliance. Here are the biggest architectural and engineering hurdles we encountered, and the concrete ways we solved them:

**1. The "False Oracle Convergence" Trap & Proving Real Causal Decision Lift**
One of the most eye-opening moments occurred while evaluating our multi-agent decision engine against our 1,000-case benchmark. Early runs showed our AI recovery agent matching our theoretical-maximum clairvoyant Oracle ceiling down to the exact rupee (100.00% efficiency). When something looks that perfect in engineering, it is almost always a bug. Digging deep into our evaluation harness, we uncovered ground-truth label leakage: our synthetic evaluation dataset was using monolithic boolean flags (`truth.lane_recovery`), and the evaluator was simply checking deterministic PolicyGuard permissions rather than testing whether the agent's recommended intervention actually cured the underlying failure mode. In effect, the benchmark was testing our compliance gates, but had zero causal dependence on the AI’s diagnostic reasoning. We immediately tore down that logic and engineered a per-case strategy-conditioned effectiveness matrix across all candidate actions (payment link refresh, mandate retry, soft reminder, firm escalation, human escalation). Under this model, an intervention succeeds *only* if the agent's diagnosis and chosen strategy match the debtor's true failure lane. This introduced honest, real-world uncertainty: our AI agent achieves an empirical **85.50% of the Oracle ceiling** (₹12.11 lakh recovered), with the remaining gap cleanly explained by real diagnostic ambiguity and misclassifications on noisy cases. We even authored an adversarial regression test (`agent-decision-causality.test.ts`) that asserts an agent picking the wrong strategy recovers ₹0 while the Oracle recovers ₹5,000, proving that our reported numbers reflect true causal AI decision quality.

**2. Mid-Flight Worker Crashes, Idempotent Resumption & Drizzle ORM Error Masking**
In a distributed financial recovery system, network partitions, container restarts, and worker crashes are inevitable. If an outbox worker dies right after generating a Razorpay payment link or sending a WhatsApp template, but before committing the database transaction, a naive retry would create duplicate payment links, spam the customer, or trigger double charges. To ensure resilience, we implemented a Transactional Outbox pattern with compound idempotency keys (`tenant_id:invoice_id:attempt_number`), processed jobs using `SELECT ... FOR UPDATE SKIP LOCKED` worker pools, and added a stale-claim sweeper (`sweepStaleClaims()`). However, during chaos fault-injection tests (`chaos-crash.test.ts`), duplicate audit log appends triggered unexpected unhandled exceptions instead of gracefully deduplicating. The culprit was a subtle abstraction leak in Drizzle ORM: driver-level PostgreSQL error code `23505` (unique key constraint violation) was wrapped inside `err.cause.code`. A standard `err.code === '23505'` check evaluated to false, causing the process to fail closed. We updated the repository layer to forensically inspect `err.code`, `err.cause?.code`, and `err.message` for `23505` / `duplicate key`, allowing workers that crash and restart mid-flight to seamlessly detect prior attempts, suppress duplicate dispatch, and resume execution with zero customer impact.

**3. Ledger Concurrency Races & Cryptographic Audit Chain Splitting**
For CFOs and enterprise auditors to trust autonomous recovery, every action, reason, and rupee must be cryptographically auditable. We designed an append-only ledger where each log entry contains a cryptographic hash chain: `hash = SHA-256(previous_hash + payload)`. However, under stress testing with simultaneous webhook deliveries and parallel recovery jobs for the same merchant, we hit a classic concurrency race condition: two worker threads read the identical "latest" head hash at the exact same millisecond, computed their new hashes from that identical parent, and inserted concurrent rows. This split the hash chain into branches, causing our independent verifier (`verify-ledger.ts`) to flag broken integrity. We resolved this by wrapping the entire ledger append lifecycle—reading the head hash, serializing the payload, computing the SHA-256 digest, and inserting the record—inside an atomic PostgreSQL transaction guarded by tenant-level transaction advisory locks: `SELECT pg_advisory_xact_lock(hashtext('recovery_ledger_' || tenantId))`. This serializes ledger writes per tenant without bottlenecking cross-tenant throughput, guaranteeing a tamper-evident, 100% linear cryptographic audit trail that any auditor can independently verify.

**4. The "Zero Money Hallucination" Boundary**
Early on, we recognized a dangerous trap in AI application design: allowing language models to directly report or influence financial accounting state. If an LLM interprets an email from a debtor saying *"I've initiated the transfer"* or registers an outbound payment link generation as "money recovered," it introduces financial hallucination and corrupts the balance sheet. We established a strict architectural boundary: **The model recommends; deterministic code decides.** The multi-agent AI system diagnoses root causes, generates communication, and schedules retries, but it has zero permission to mark invoices paid or credit merchant balances. A recovery session is marked settled if and only if Razorpay's cryptographically signed HMAC-SHA256 webhook (`payment.captured` or `order.paid`) arrives at our backend, passes signature verification against the merchant secret, and reconciles against the exact invoice ID in PostgreSQL. If a customer pays through another channel or a webhook fails verification, the ledger remains untouched.

**5. Cross-Repository State Synchronization & PTP Escalation Bypass**
Our compliance engine, `PolicyGuard`, enforces 8 hard deterministic stopping rules to prevent harassment, including a strict rule that if a debtor breaks two formal Promises-to-Pay (PTP), automated collection must halt immediately and escalate to a human relationship manager. During integration testing, we caught a subtle synchronization bug: the check for `totalBroken >= MAX_PTP_BROKEN` was implemented inside the nightly cron job (`checkBrokenPromises`), but the real-time trigger path (`startRecoverySession`) was only checking days overdue. As a result, active session triggers were bypassing the broken promise count and attempting automated outreach on accounts that should have been frozen. We resolved this by introducing cross-repository state checks (`getOverduePTPs()`) directly into the session startup lifecycle and adding polymorphic invoice lookup, ensuring that active session execution and background reconciliation share an identical, synchronized view of debtor state. This is backed by 11 unit and integration tests enforcing stopping-rule invariants on every build.

**6. Uncompromising Scientific Rigor & Retracting Synthetic Benchmarks**
In early benchmark iterations, we explored modeling an offline LLM comparison, and an experimental script was written that simulated reasoning conservatism using character hashes rather than calling live provider APIs. Although intended as a quick offline placeholder, presenting synthetic numbers as model judgment is fundamentally unacceptable in engineering. Rather than hiding or rationalizing the mistake, we openly published a complete post-mortem in `FAILURES.md`, permanently deleted the script, and built a real provider trace recorder (`record_real_llm_traces.py`). This pipeline connects to live Groq and OpenAI endpoints, records genuine HTTP wire headers, captures token counts and millisecond latencies, and fails loudly if live API keys are absent. We expanded our evaluation across 20 distinct random seeds (20,000 cases) with 1,000-iteration bootstrap confidence intervals, and conservatively adjusted our benchmark credibility score to an honest, defensible **8.9 / 10.0**. Confronting our own assumptions with radical engineering honesty turned what could have been a fragile hackathon demo into a battle-tested, enterprise-grade platform.

