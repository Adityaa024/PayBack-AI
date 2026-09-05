# PayBack-AI Multi-Arm Empirical Benchmark
*Canonical 7-Arm Evaluation Report across Unified 1,000 Cases (Seed 42)*

Generated automatically by executing the real multi-agent decision engine and TypeScript [PolicyGuard](backend/src/modules/recovery/recovery.contract.ts).

---

## 1. Evaluation Integrity: Unified Denominator & Shared Oracle Ceiling
*Modeled on `piyush2676/recoverx` and `Ovais-Maker/razorpay-buildathon-recoup`*

### Denominator Consistency
All benchmark arms are evaluated on the **exact same complete dataset of 1,000 cases (Seed 42)**, eliminating denominator inconsistencies from split holdouts.
- **Total Portfolio Failed Debt**: ₹22,21,965.5 (Identical across all 7 arms).
- **Oracle Recoverable Ceiling**: ₹12,03,167.01 across 539 recoverable cases (54.15% of total debt).
- **Harness Coherence Proof**: `abs(oracle_recovered - oracle_ceiling) < 1e-6` => `✅ PASSED (100.00% exact match)`.
- **Shared Outcome Model**: The Oracle ceiling is calculated from the identical ground-truth customer responsiveness and PolicyGuard stopping rules applied to all arms.

---

## 2. 7-Arm Comprehensive Benchmark Comparison

| Metric | 1. Do Nothing | 2. Fixed Retry | 3. Contact Only | 4. Deterministic Policy | 5. Simulated LLM Policy | 6. Real LLM Policy | 7. Oracle Ceiling |
|---|---|---|---|---|---|---|---|
| **Total Failed Value (₹)** | ₹22,21,965.5 | ₹22,21,965.5 | ₹22,21,965.5 | ₹22,21,965.5 | ₹22,21,965.5 | Gated (offline) | ₹22,21,965.5 |
| **Oracle Recoverable Ceiling (₹)** | ₹12,03,167.01 | ₹12,03,167.01 | ₹12,03,167.01 | ₹12,03,167.01 | ₹12,03,167.01 | Gated (offline) | ₹12,03,167.01 |
| **Gross Recovered (₹)** | ₹3,52,002.94 | ₹7,30,703.24 | ₹7,30,703.24 | **₹11,62,390.82** | **₹11,89,650.23** | Gated | ₹12,03,167.01 |
| **Organic Recovery (₹)** | ₹3,52,002.94 | ₹3,52,002.94 | ₹3,52,002.94 | ₹3,52,002.94 | ₹3,52,002.94 | Gated | ₹3,52,002.94 |
| **Incremental Recovery (₹)** | Baseline (₹0.00) | ₹3,78,700.3 | ₹3,78,700.3 | **₹8,10,387.88** | **₹8,37,647.29** | Gated | **₹8,51,164.07** |
| **Recovery % of Oracle Ceiling** | 29.26% | 60.73% | 60.73% | **96.61%** | **98.88%** | Gated | **100.00%** |
| **Recovery % of Total Failed** | 15.84% | 32.89% | 32.89% | **52.31%** | **53.54%** | Gated | 54.15% |
| **Net Recovered Value (₹)** | ₹3,52,002.94 | ₹7,28,703.24 | ₹7,29,203.24 | **₹11,60,769.32** | **₹11,87,999.37** | Gated | ₹12,02,598.51 |
| **Contact Count** | 0 | 1000 | 1000 | 1040 | 1032 | Gated | 379 |
| **Retry Count** | 0 | 1000 | 0 | 123 | 117 | Gated | 0 |
| **Human Escalations** | 0 | 0 | 0 | 60 | 60 | Gated | 0 |
| **Compliance Violations** | **0** | **123** (opt-out/90d) | **123** (opt-out/90d) | **0** (PolicyGuard) | **0** (PolicyGuard) | Gated | **0** |
| **Duplicate Charges** | **0** | **0** | **0** | **0** | **0** | Gated | **0** |
| **Cost per Recovered Rupee (₹)** | ₹0.0000 | ₹0.0027 | ₹0.0021 | **₹0.0014** | **₹0.0014** | Gated | ₹0.0005 |
| **Customer Contact Cost (₹)** | ₹0.00 | ₹1500.00 | ₹1500.00 | ₹1560.00 | ₹1548.00 | Gated | ₹568.50 |
| **Retry Cost (₹)** | ₹0.00 | ₹500.00 | ₹0.00 | ₹61.50 | ₹58.50 | Gated | ₹0.00 |
| **LLM Inference Cost (₹)** | ₹0.00 | ₹0.00 | ₹0.00 | ₹0.00 | ₹44.36 | Gated | ₹0.00 |

*Note on Arm 6 (`real_llm_policy`)*: Gated offline. Under Section 2 rules, offline traces are strictly labeled as `simulated_llm_policy`. Replay mode requires recorded provider traces with loud-fail `KeyError` on miss.

---

## 3. Dimensional Slice Performance Breakdown

### By Failure Type (Incident Lane)
| Failure Type | Cases | Total Failed (₹) | Oracle Ceiling (₹) | Simulated LLM Gross (₹) | % of Oracle | % of Total |
|---|---|---|---|---|---|---|
| **subscription_rescue** | 319 | ₹7,16,935.64 | ₹4,02,614.36 | ₹3,97,007.31 | **98.61%** | 55.38% |
| **b2b_receivables** | 190 | ₹4,12,754.26 | ₹1,64,402.54 | ₹1,64,130.72 | **99.83%** | 39.76% |
| **payment_degradation** | 398 | ₹8,86,552.14 | ₹5,42,501.73 | ₹5,35,779.45 | **98.76%** | 60.43% |
| **checkout_dropoff** | 93 | ₹2,05,723.46 | ₹93,648.38 | ₹92,732.75 | **99.02%** | 45.08% |

### By Payment Rail
| Payment Rail | Cases | Total Failed (₹) | Oracle Ceiling (₹) | Simulated LLM Gross (₹) | % of Oracle | % of Total |
|---|---|---|---|---|---|---|
| **card** | 349 | ₹8,10,989.57 | ₹4,53,915.38 | ₹4,50,405.71 | **99.23%** | 55.54% |
| **mandate** | 246 | ₹5,38,939.05 | ₹2,63,452.66 | ₹2,59,136.15 | **98.36%** | 48.08% |
| **upi** | 185 | ₹3,92,449.92 | ₹2,23,613.56 | ₹2,19,485.32 | **98.15%** | 55.93% |
| **netbanking** | 220 | ₹4,79,586.96 | ₹2,62,185.41 | ₹2,60,623.05 | **99.4%** | 54.34% |

### By Amount Band
| Amount Band | Cases | Total Failed (₹) | Oracle Ceiling (₹) | Simulated LLM Gross (₹) | % of Oracle | % of Total |
|---|---|---|---|---|---|---|
| **< ₹1,000** | 79 | ₹56,805.94 | ₹29,795.68 | ₹29,852.39 | **100.19%** | 52.55% |
| **₹1,000–₹10,000** | 921 | ₹21,65,159.56 | ₹11,73,371.33 | ₹11,59,797.84 | **98.84%** | 53.57% |

### By Customer Segment
| Customer Segment | Cases | Total Failed (₹) | Oracle Ceiling (₹) | Simulated LLM Gross (₹) | % of Oracle | % of Total |
|---|---|---|---|---|---|---|
| **smb_saas** | 370 | ₹8,18,208.82 | ₹4,67,786.22 | ₹4,62,179.17 | **98.8%** | 56.49% |
| **enterprise_b2b** | 190 | ₹4,12,754.26 | ₹1,64,402.54 | ₹1,64,130.72 | **99.83%** | 39.76% |
| **consumer_d2c** | 440 | ₹9,91,002.42 | ₹5,70,978.25 | ₹5,63,340.34 | **98.66%** | 56.85% |

---

## 4. Hidden Holdout Generalization (250 Cases, Seed 999)
*Out-of-sample validation to prove policy rules generalize without overfitting:*

- **Holdout Cases Evaluated**: 250
- **Holdout Failed Portfolio**: ₹5,59,264.28
- **Holdout Oracle Ceiling**: ₹3,27,728.84
- **Holdout Deterministic Recovery**: ₹3,27,728.84
- **Holdout Oracle Efficiency**: **100%**


---

## 5. PolicyGuard Enforcement Telemetry (Real TypeScript Execution)
- **90-Day Overdue Statutory Bans:** 98 cases blocked.
- **Active Dispute Freezes:** 23 cases escalated to human review.
- **Customer Opt-Outs (STOP reply):** 21 cases halted immediately.
- **Broken Promise Caps (PTP >= 2):** 37 cases escalated to collections team.
- **Sub-Floor Checks (< ₹100):** 12 micro-debts suppressed.
- **First-Touch Settlements Captured:** 440 cases.
- **Escalated Touch Settlements Captured:** 39 cases.
- **Ambiguous Misdiagnosis Yield Suppressions:** 50 cases.

---

## 6. Guaranteed Engineering Invariants
- **Duplicate Payment Links**: **0** (Idempotency keys enforced)
- **Double Charges**: **0** (Advisory transaction locks serialize settlement)
- **Compliance Violations**: **0** (PolicyGuard hard stopping rules)
- **Database Failure Behavior**: **Fails Closed (0 external dispatches)**
- **Replay Determinism**: **100.00%** (Identical SHA-256 prompt hashes and decision parity)
