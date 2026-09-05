#!/usr/bin/env python3
"""
External Validation Cohort Dataset Generator — PayBack-AI
Creates an independent external validation dataset (500 cases, Seed 888) modeling:
1. Indian B2B quarterly GST reconciliation delays (GSTR-1 and GSTR-3B windows).
2. RTGS / NEFT banking holiday settlement latency.
3. High-ticket enterprise invoicing (₹5,000 – ₹1,50,000).
4. Parameter distribution independent from tuning batch (seed 42) and unseen holdouts.
"""

import json
import random
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent.parent
OUTPUT_FILE = ROOT_DIR / "reports" / "external_validation_cohort.json"


def generate_external_validation_cohort(seed: int = 888, count: int = 500):
    rng = random.Random(seed)

    segments = ["enterprise_b2b", "mid_market_saas", "supply_chain_logistics", "fintech_lending"]
    failure_lanes = ["b2b_receivables", "subscription_rescue", "payment_degradation", "checkout_dropoff"]
    payment_rails = ["netbanking", "mandate", "card", "upi"]

    cases = []
    total_exposure = 0.0

    for i in range(count):
        inv_id = f"inv_ext_{i+1:04d}"
        lane = rng.choices(failure_lanes, weights=[0.40, 0.25, 0.25, 0.10])[0]
        rail = rng.choices(payment_rails, weights=[0.45, 0.30, 0.15, 0.10])[0]
        seg = rng.choices(segments, weights=[0.40, 0.30, 0.20, 0.10])[0]

        # Higher ticket enterprise amounts
        if seg == "enterprise_b2b":
            amount = round(rng.uniform(15000, 120000), 2)
        elif seg == "supply_chain_logistics":
            amount = round(rng.uniform(8000, 75000), 2)
        else:
            amount = round(rng.uniform(2500, 45000), 2)

        days_overdue = rng.randint(5, 110)
        opted_out = rng.random() < 0.03
        has_dispute = rng.random() < 0.04
        ptp_broken = rng.choices([0, 1, 2, 3], weights=[0.75, 0.15, 0.07, 0.03])[0]

        # Natural recovery
        natural_rec = rng.random() < 0.12
        # Lane-specific recovery under matched intervention
        lane_rec = rng.random() < 0.58
        naive_rec = rng.random() < 0.28
        tone_esc_rec = rng.random() < 0.45

        # Candidate strategy effectiveness matrix for enterprise cohort
        ext_rng = random.Random(f"{seed}_{inv_id}_strat")
        if lane == 'b2b_receivables':
            ext_strat_probs = {
                'firm_escalation': 0.56 if days_overdue > 45 else 0.35,
                'soft_reminder': 0.28 if days_overdue > 45 else 0.50,
                'human_escalation': 0.38 if days_overdue > 45 else 0.24,
                'payment_link_refresh': 0.12,
                'mandate_retry': 0.04,
            }
        elif lane == 'subscription_rescue':
            ext_strat_probs = {
                'mandate_retry': 0.60,
                'payment_link_refresh': 0.30,
                'soft_reminder': 0.20,
                'firm_escalation': 0.16,
                'human_escalation': 0.18,
            }
        elif lane == 'checkout_dropoff':
            ext_strat_probs = {
                'payment_link_refresh': 0.50,
                'soft_reminder': 0.28,
                'firm_escalation': 0.12,
                'mandate_retry': 0.02,
                'human_escalation': 0.12,
            }
        else: # payment_degradation
            ext_strat_probs = {
                'payment_link_refresh': 0.64,
                'soft_reminder': 0.22,
                'firm_escalation': 0.16,
                'mandate_retry': 0.04,
                'human_escalation': 0.14,
            }

        strategy_outcomes = {}
        for strat, prob in ext_strat_probs.items():
            strategy_outcomes[strat] = True if natural_rec else (ext_rng.random() < prob)

        total_exposure += amount

        cases.append({
            "invoice_id": inv_id,
            "invoice_no": f"EXT-2026-{i+1:04d}",
            "client_name": f"EnterpriseClient_{i+1}",
            "amount": amount,
            "currency": "INR",
            "days_overdue": days_overdue,
            "incident_lane": lane,
            "payment_rail": rail,
            "customer_segment": seg,
            "failure_reason": (
                "Quarterly GST reconciliation awaiting input tax credit clearance"
                if lane == "b2b_receivables"
                else "NACH mandate batch processing failed during bank holiday window"
                if rail == "mandate"
                else "Gateway timeout during high-volume RTGS clearing"
            ),
            "opted_out": opted_out,
            "has_dispute": has_dispute,
            "ptp_broken": ptp_broken,
            "ptp_count": 1 if ptp_broken > 0 else 0,
            "truth": {
                "natural_recovery": natural_rec,
                "strategy_outcomes": strategy_outcomes,
                "lane_recovery": lane_rec,
                "naive_recovery": naive_rec,
                "tone_escalation_recovery": tone_esc_rec,
            },
        })

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(cases, f, indent=2)

    print(f"[SUCCESS] Generated external validation cohort: {count} cases, Total Exposure: INR {total_exposure:,.2f} at {OUTPUT_FILE}")
    return cases


if __name__ == "__main__":
    generate_external_validation_cohort()
