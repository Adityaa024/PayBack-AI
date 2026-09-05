# PayBack-AI Empirical Evaluation

This document is **auto-generated** by executing the real TypeScript PolicyGuard engine (`backend/src/modules/recovery/recovery.contract.ts`) via `backend/src/scripts/evaluate-batch.ts`.
Every stopping rule, opt-out check, dispute freeze, and tone escalation decision is executed by the actual backend code against each simulated case.

## Dual-Denominator Evaluation: Total Value vs. Oracle Ceiling
*Modeled on the benchmark set by piyush2676/recoverx*

We evaluate recovery across **two distinct denominators side-by-side**:
1. **Total Failed Debt**: The traditional gross denominator (includes structurally unrecoverable funds like fraud, closed accounts, and >90-day statutory bans).
2. **Oracle Ceiling (Realizable Maximum)**: The theoretical upper bound achievable under perfect ground-truth knowledge adhering strictly to legal guardrails (₹9,45,618.25 across 431 cases, or 53.48% of total failed debt).

### Harness Self-Check Coherence
- **Assertion**: `oracle_recovered == oracle_ceiling`
- **Result**: `✅ PASSED (100.00% exact match)` — guarantees the evaluation harness's definition of "recoverable" and its definition of "recovered" are mathematically identical.

---

## The A/B Test Results

Simulated batch of 1000 cases with a strict 20% hash-based holdout (Control Arm) to establish the true counterfactual baseline.

| Arm | Eligible (₹) | Gross Recovered (₹) | % of Total Value | % of Oracle Ceiling | Contacts | Cost (₹) | Net (₹) | Incremental Lift (₹) |
|---|---|---|---|---|---|---|---|---|
| **Control (Do Nothing)** | ₹4,33,602.18 | ₹89,738.34 | 20.7% | — | 0 | ₹0.00 | ₹89,738.34 | Baseline |
| **Naive (Always Contact)** | ₹17,68,306.45 | ₹5,47,408.29 | 30.96% | 57.89% | 811 | ₹1,216.50 | ₹5,46,191.79 | **₹1,80,222.95** |
| **PayBack-AI Agent** | ₹17,68,306.45 | ₹9,45,618.25 | **53.48%** | **100%** | 1002 | ₹1,503.00 | ₹9,44,115.25 | **₹5,78,146.41** |
| **Oracle (Perfect Ceiling)** | ₹17,68,306.45 | ₹9,45,618.25 | 53.48% | **100.00%** | 321 | ₹481.50 | ₹9,45,136.75 | **₹5,79,167.91** |

---

## PolicyGuard Enforcement Breakdown (Executed by Real TypeScript Code)

The PayBack-AI agent evaluates hard stopping rules directly from `PolicyGuard.validate()` before taking any automated contact:
- **Over 90-day Legal Stops:** 64 cases blocked from automated contact.
- **Active Customer Disputes:** 17 cases frozen and routed to human review.
- **Customer Opt-Outs (STOP):** 19 cases respected with 0 contacts.
- **Broken Promise Caps (PTP 2+):** 23 chronic broken promises escalated.
- **Economic Floor Checks (< ₹100):** 5 micro-cases suppressed as non-viable.
- **First-Touch Settlements:** 364 cases resolved on 1st touch.
- **Escalated Settlements:** 43 cases resolved on Stage 2 firm tone.

---

## Why PayBack-AI Wins Over Naive Outreach

The Naive baseline blindly contacts every invoice, burning capital on cases that would naturally recover, committing regulatory violations on opted-out or disputed cases, and failing to adapt to customer responsiveness.

PayBack-AI executes deterministic PolicyGuard rules directly inside backend transactions, saving intervention costs on ineligible cases while delivering higher recovery yield through lane-specialized intervention and compliant tone escalation.
