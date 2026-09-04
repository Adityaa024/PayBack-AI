# PayBack-AI Empirical Evaluation

This document is **auto-generated** by `ai-service/scripts/run_evaluation.py` to ensure reported figures never drift from the code's truth.

## The A/B Test Results

We ran a simulated batch of 1000 failed payments using our evaluation harness.
A strict hash-based 20% holdout (Control Arm) was applied to measure *true incremental lift*, not just gross recovery.

| Arm | Cases Eligible | Gross Recovered (₹) | Contacts Made | Intervention Cost (₹) | Net Recovered (₹) | Incremental Lift (₹) |
|-----|----------------|---------------------|---------------|-----------------------|-------------------|----------------------|
| **Control (Do Nothing)** | ₹424,846.23 | ₹83,881.46 | 0 | ₹0.00 | ₹83,881.46 | Baseline |
| **Naive (Always Contact)** | ₹1,836,144.56 | ₹572,570.83 | 811 | ₹1,216.50 | ₹571,354.33 | **₹208,826.72** |
| **PayBack-AI Agent** | ₹1,836,144.56 | ₹939,659.81 | 972 | ₹1,458.00 | ₹938,201.81 | **₹575,674.20** |

### Why PayBack-AI Wins
The Naive baseline recovers some money but burns capital on unnecessary contacts for cases that would have naturally recovered, and misses edge cases requiring multi-channel escalation. 

PayBack-AI uses the 5-Stage Tone Matrix and stops executing when policy guards (90-day cap, DLQ, Opt-out) are hit, yielding the highest **Incremental Lift** with compliance guaranteed.
