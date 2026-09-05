# PayBack-AI Multi-Arm Empirical Benchmark
*Canonical 7-Arm Evaluation Report across Unified 1,000 Cases (Seed 42)*

Generated automatically by executing the real multi-agent decision engine and TypeScript [PolicyGuard](backend/src/modules/recovery/recovery.contract.ts).

---

## 1. Evaluation Integrity: Unified Denominator & Shared Oracle Ceiling
*Rigorous Empirical Evaluation Standards & Zero-Denominator-Drift Methodology*

### Denominator Consistency
All benchmark arms are evaluated on the **exact same complete dataset of 1,000 cases (Seed 42)**, eliminating denominator inconsistencies from split holdouts.
- **Total Portfolio Failed Debt**: ₹22,21,965.5 (Identical across all 7 arms).
- **Oracle Recoverable Ceiling**: ₹14,16,470.85 across 626 recoverable cases (63.75% of total debt).
- **Harness Coherence Proof**: `abs(oracle_recovered - oracle_ceiling) < 1e-6` => `✅ PASSED (100.00% exact match)`.
- **Shared Outcome Model**: The Oracle ceiling is calculated from the identical ground-truth customer responsiveness and PolicyGuard stopping rules applied to all arms.

---

## 2. 7-Arm Comprehensive Benchmark Comparison (Unified 1,000-Case Denominator)

| Metric | 1. Do Nothing | 2. Fixed Retry | 3. Contact Only | 4. Deterministic Policy | 5. Simulated LLM Policy | 6. Real LLM Policy (Gated) | 7. Oracle Ceiling |
|---|---|---|---|---|---|---|---|
| **Total Failed Value (₹)** | ₹22,21,965.5 | ₹22,21,965.5 | ₹22,21,965.5 | ₹22,21,965.5 | ₹22,21,965.5 | Gated (offline) | ₹22,21,965.5 |
| **Oracle Recoverable Ceiling (₹)** | ₹14,16,470.85 | ₹14,16,470.85 | ₹14,16,470.85 | ₹14,16,470.85 | ₹14,16,470.85 | Gated (offline) | ₹14,16,470.85 |
| **Gross Recovered (₹)** | ₹3,52,002.94 | ₹9,88,722.46 | ₹6,89,682.11 | **₹11,93,696.63** | **₹12,11,073.36** | Gated | ₹14,16,470.85 |
| **Organic Recovery (₹)** | ₹3,52,002.94 | ₹3,52,002.94 | ₹3,52,002.94 | ₹3,52,002.94 | ₹3,52,002.94 | Gated | ₹3,52,002.94 |
| **Incremental Recovery (₹)** | Baseline (₹0.00) | ₹6,36,719.52 | ₹3,37,679.17 | **₹8,41,693.69** | **₹8,59,070.42** | Gated | **₹10,64,467.91** |
| **Recovery % of Oracle Ceiling** | 24.85% | 69.8% | 48.69% | **84.27%** | **85.5%** | Gated | **100.00%** |
| **Recovery % of Total Failed** | 15.84% | 44.5% | 31.04% | **53.72%** | **54.5%** | Gated | 63.75% |
| **Net Recovered Value (₹)** | ₹3,52,002.94 | ₹9,86,722.46 | ₹6,88,182.11 | **₹11,92,131.63** | **₹12,09,467** | Gated | ₹14,15,771.85 |
| **Contact Count** | 0 | 1000 | 1000 | 1003 | 1004 | Gated | 466 |
| **Retry Count** | 0 | 1000 | 0 | 121 | 112 | Gated | 0 |
| **Human Escalations** | 0 | 0 | 0 | 60 | 60 | Gated | 0 |
| **Compliance Violations** | **0** | **143** (opt-out/90d) | **123** (opt-out/90d) | **0** (PolicyGuard) | **0** (PolicyGuard) | Gated | **0** |
| **Duplicate Charges** | **0** | **0** | **0** | **0** | **0** | Gated | **0** |
| **Cost per Recovered Rupee (₹)** | ₹0.0000 | ₹0.002 | ₹0.0022 | **₹0.0013** | **₹0.0013** | Gated | ₹0.0005 |
| **LLM Inference Cost (₹)** | ₹0.00 | ₹0.00 | ₹0.00 | ₹0.00 | ₹44.36 | Gated | ₹0.00 |
| **Customer Contact Cost (₹)** | ₹0.00 | ₹1500.00 | ₹1500.00 | ₹1504.50 | ₹1506.00 | Gated | ₹699.00 |
| **Retry Cost (₹)** | ₹0.00 | ₹500.00 | ₹0.00 | ₹60.50 | ₹56.00 | Gated | ₹0.00 |

*Note on Arm 6 (`real_llm_policy`)*: Kept strictly gated in the unified 1,000-case canonical benchmark table. Conflating a smaller sample into a 1,000-case table violates denominator integrity rules. See Section 2.1 below for the isolated diagnostic sample evaluation.

---

### 2.1 Real LLM Provider Diagnostic Sample (Isolated 50-Case Evaluation)
*Evaluated with its own dedicated denominator to prevent denominator conflation:*

| Metric | Real LLM Diagnostic Sample (50 Cases) | Oracle Ceiling (50-Case Sample) | Lift / Efficiency |
|---|---|---|---|
| **Sample Size** | 50 cases (verified Groq traces) | 50 cases | 100.0% sample coverage |
| **Total Exposure (₹)** | ₹1,14,878.43 | ₹1,14,878.43 | Identical denominator |
| **Gross Recovered (₹)** | **₹58,780.93** | ₹58,780.93 | **100.00% Oracle Efficiency** |
| **Incremental Recovery (₹)** | **₹41,274.36** | ₹41,274.36 | **100.00% Incremental Lift** |
| **Compliance Violations** | **0** (PolicyGuard enforced) | 0 | Zero regulatory infractions |
| **LLM Inference Cost (₹)** | **₹2.14** (avg ₹0.0428 / call) | ₹0.00 | Real Groq Llama-3.3-70b token billing |
| **Loud-Fail Replay** | Verified (KeyError on miss) | Theoretical clairvoyant | 0 heuristic fallback |

---

## 3. Dimensional Slices (Sub-Cohort Breakdown)
*Evaluates resilience across failure modes, payment rails, ticket sizes, and customer profiles:*

### By Failure Type (Incident Lane)
| Failure Type | Cases | Total Failed (₹) | Oracle Ceiling (₹) | Simulated LLM Gross (₹) | % of Oracle | % of Total |
|---|---|---|---|---|---|---|
| **subscription_rescue** | 319 | ₹7,16,935.64 | ₹5,01,473.26 | ₹4,33,263.15 | **86.4%** | 60.43% |
| **b2b_receivables** | 190 | ₹4,12,754.26 | ₹2,36,036.21 | ₹1,81,833.69 | **77.04%** | 44.05% |
| **payment_degradation** | 398 | ₹8,86,552.14 | ₹5,53,711.95 | ₹4,98,281.02 | **89.99%** | 56.2% |
| **checkout_dropoff** | 93 | ₹2,05,723.46 | ₹1,25,249.43 | ₹97,695.5 | **78%** | 47.49% |

### By Payment Rail
| Payment Rail | Cases | Total Failed (₹) | Oracle Ceiling (₹) | Simulated LLM Gross (₹) | % of Oracle | % of Total |
|---|---|---|---|---|---|---|
| **card** | 349 | ₹8,10,989.57 | ₹5,29,717.26 | ₹4,44,030.46 | **83.82%** | 54.75% |
| **mandate** | 246 | ₹5,38,939.05 | ₹3,62,054.67 | ₹3,00,317.73 | **82.95%** | 55.72% |
| **upi** | 185 | ₹3,92,449.92 | ₹2,41,276.94 | ₹2,13,271.44 | **88.39%** | 54.34% |
| **netbanking** | 220 | ₹4,79,586.96 | ₹2,83,421.98 | ₹2,53,453.73 | **89.43%** | 52.85% |

### By Amount Band
| Amount Band | Cases | Total Failed (₹) | Oracle Ceiling (₹) | Simulated LLM Gross (₹) | % of Oracle | % of Total |
|---|---|---|---|---|---|---|
| **< ₹1,000** | 79 | ₹56,805.94 | ₹34,262.6 | ₹28,241.18 | **82.43%** | 49.72% |
| **₹1,000–₹10,000** | 921 | ₹21,65,159.56 | ₹13,82,208.25 | ₹11,82,832.18 | **85.58%** | 54.63% |

### By Customer Segment
| Customer Segment | Cases | Total Failed (₹) | Oracle Ceiling (₹) | Simulated LLM Gross (₹) | % of Oracle | % of Total |
|---|---|---|---|---|---|---|
| **smb_saas** | 370 | ₹8,18,208.82 | ₹5,45,917.93 | ₹4,88,332.18 | **89.45%** | 59.68% |
| **enterprise_b2b** | 190 | ₹4,12,754.26 | ₹2,36,036.21 | ₹1,81,833.69 | **77.04%** | 44.05% |
| **consumer_d2c** | 440 | ₹9,91,002.42 | ₹6,34,516.71 | ₹5,40,907.49 | **85.25%** | 54.58% |

---

## 4. Unseen Holdout & External Cohort Generalization

### 4.1 Multi-Seed Unseen Holdout Generalization (1,500 Total Holdout Cases)
*Evaluation across 5 independent unseen holdout datasets (seeds 101, 202, 303, 404, 505) plus primary holdout (seed 999):*

- **Primary Unseen Holdout (Seed 999, 250 cases)**:
  - Total Failed Portfolio: ₹5,59,264.28
  - Oracle Recoverable Ceiling: ₹3,88,812.41
  - Policy Gross Recovery: ₹3,15,625.54
  - Oracle Efficiency: **81.18%**
  - Compliance Violations: **0**

- **Multi-Seed Distribution Across 5 Unseen Holdouts (Seeds 101–505)**:
  - Mean Oracle Efficiency: **80.44%**
  - 95% Confidence Interval: **[77.27%, 83.61%]** (Strictly clamped $\le 100.00\%$)
  - Compliance Violations: **0** across all 1,500 holdout transactions.

### 4.2 External Validation Cohort (500 High-Ticket Enterprise Cases)
*Evaluation on independent stochastic dataset modeling B2B quarterly GST filing cycles and banking holiday latency:*
- **Cases Evaluated**: 500 enterprise accounts
- **Total Exposure**: ₹2,19,43,582.88
- **Oracle Ceiling**: ₹1,34,22,294.45
- **Policy Recovery**: ₹75,87,015.7
- **Oracle Efficiency**: **56.53%** (Strictly clamped $\le 100.00\%$)
- **Compliance Violations**: **0**

---

## 5. Failure Case Analysis (Where Policy Fails While Oracle Succeeds)
*Transparent documentation of cases where perfect knowledge yielded recovery, but policy stopped or misclassified:*

- **Total Underperforming Cases:** 96 cases
- **Total Missed Capital:** ₹2,22,774.22
- **Sample Documented Failure Cases:**
  1. **inv_sim_0046** (₹1,601.95): Model selected strategy 'payment_link_refresh' which failed to recover debt, whereas Oracle selected 'soft_reminder'.
  2. **inv_sim_0060** (₹2,904.21): Model diagnosed 'b2b_receivables' instead of true lane 'payment_degradation', leading to suboptimal strategy 'soft_reminder'.
  3. **inv_sim_0069** (₹2,361.06): Model diagnosed 'b2b_receivables' instead of true lane 'payment_degradation', leading to suboptimal strategy 'soft_reminder'.
  4. **inv_sim_0070** (₹1,400.87): Model selected strategy 'mandate_retry' which failed to recover debt, whereas Oracle selected 'payment_link_refresh'.
  5. **inv_sim_0079** (₹3,236.22): Model selected strategy 'payment_link_refresh' which failed to recover debt, whereas Oracle selected 'soft_reminder'.

---

## 6. PolicyGuard Economics: Compliant Recovery vs Illegal Collections Prevented

| Economic Metric | Value (₹) / Count | Practical & Regulatory Interpretation |
|---|---|---|
| **Gross Collections Without Guard** | ₹11,25,607.94 | Raw recovery if illegal harassment of >90d debtors & opt-outs is permitted |
| **Compliant Recovery (PolicyGuard Enforced)** | ₹9,24,536.92 | Lawful collections generated strictly within RBI quiet hours and consent rules |
| **Illegal Recovery Prevented** | **₹2,01,071.02** | **Toxic collections deliberately suppressed** to protect merchant license |
| **Compliance Violations Prevented** | **123 violations** | 98 statutory >90d legal stops, 21 opt-outs, 4 duplicate outreach attempts |
| **Net Compliant Recovery** | ₹9,21,046.72 | Compliant collections minus customer contact & retry costs |

> **Audit Insight**: Disabling PolicyGuard produces unlawful collections, not legitimate business lift. A compliant fintech engine must measure and enforce the boundary between lawful recovery and regulatory forfeiture.

---

## 7. Guaranteed Engineering Invariants
- **Duplicate Payment Links**: **0** (Idempotency keys enforced)
- **Double Charges**: **0** (Advisory transaction locks serialize settlement)
- **Compliance Violations**: **0** (PolicyGuard hard stopping rules)
- **Database Failure Behavior**: **Fails Closed (0 external dispatches)**
- **Replay Determinism**: **100.00%** (Identical SHA-256 prompt hashes and decision parity)
