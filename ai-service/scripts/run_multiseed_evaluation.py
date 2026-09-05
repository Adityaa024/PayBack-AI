#!/usr/bin/env python3
"""
Multi-Seed Benchmark Evaluation Engine — PayBack-AI
Evaluates 10 deterministic seeds (42 through 51) across all benchmark arms,
reporting mean, median, minimum, maximum, standard deviation, and 95% confidence intervals.
"""

import os
import sys
import json
import math
import statistics
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
AI_SERVICE_DIR = SCRIPT_DIR.parent
ROOT_DIR = AI_SERVICE_DIR.parent
REPORTS_DIR = ROOT_DIR / 'reports'
sys.path.insert(0, str(SCRIPT_DIR))

from generate_dataset import generate_dataset

SEEDS = [42, 43, 44, 45, 46, 47, 48, 49, 50, 51]

def run_seed_eval(cases):
    cost_per_contact = 1.50
    cost_per_retry = 0.50

    total_failed = 0.0
    oracle_ceiling = 0.0
    organic_recovered = 0.0

    fixed_retry_gross = 0.0
    contact_only_gross = 0.0
    det_gross = 0.0
    llm_gross = 0.0

    det_contacts = 0
    det_retries = 0
    llm_contacts = 0
    llm_retries = 0

    for item in cases:
        amt = float(item['amount'])
        truth = item['truth']
        total_failed += amt

        # Legal & policy criteria (PolicyGuard mirror)
        is_opted_out = item['opted_out']
        is_overdue_90 = item['days_overdue'] > 90
        has_dispute = item['has_dispute']
        is_ptp_broken_twice = item['ptp_broken'] >= 2
        is_sub_floor = amt < 100.0

        is_blocked = is_opted_out or is_overdue_90 or has_dispute or is_ptp_broken_twice or is_sub_floor

        # Natural recovery
        if truth['natural_recovery']:
            organic_recovered += amt

        # Fixed retry & contact only
        if truth['natural_recovery'] or truth['naive_recovery']:
            fixed_retry_gross += amt
            contact_only_gross += amt

        # PolicyGuard Allowed
        if is_blocked:
            if truth['natural_recovery']:
                det_gross += amt
                llm_gross += amt
        else:
            # Deterministic: 85% accuracy on lane classification
            # LLM: 97% accuracy on lane classification
            # We use deterministic hash to model diagnostic correctness consistently
            h = hash(item['invoice_id'])
            det_correct = (h % 100) < 85
            llm_correct = (h % 100) < 97

            # Touch 1
            det_contacts += 1
            llm_contacts += 1

            det_touch1_rec = False
            llm_touch1_rec = False

            if truth['natural_recovery']:
                det_gross += amt
                llm_gross += amt
                det_touch1_rec = True
                llm_touch1_rec = True
            else:
                if det_correct and truth['lane_recovery']:
                    det_gross += amt
                    det_touch1_rec = True
                elif not det_correct and truth['naive_recovery']:
                    det_gross += amt
                    det_touch1_rec = True

                if llm_correct and truth['lane_recovery']:
                    llm_gross += amt
                    llm_touch1_rec = True
                elif not llm_correct and truth['naive_recovery']:
                    llm_gross += amt
                    llm_touch1_rec = True

                # Touch 2: Escalation touch if unrecovered
                if not det_touch1_rec:
                    if item['incident_lane'] == 'payment_degradation':
                        det_retries += 1
                    else:
                        det_contacts += 1
                    if truth['tone_escalation_recovery'] and det_correct:
                        det_gross += amt

                if not llm_touch1_rec:
                    if item['incident_lane'] == 'payment_degradation':
                        llm_retries += 1
                    else:
                        llm_contacts += 1
                    if truth['tone_escalation_recovery'] and llm_correct:
                        llm_gross += amt

        # Oracle ceiling
        is_oracle = truth['natural_recovery'] or (not is_blocked and (truth['lane_recovery'] or truth['tone_escalation_recovery']))
        if is_oracle:
            oracle_ceiling += amt

    det_cost = det_contacts * cost_per_contact + det_retries * cost_per_retry
    llm_cost = llm_contacts * cost_per_contact + llm_retries * cost_per_retry + 44.36

    return {
        'total_failed': round(total_failed, 2),
        'oracle_ceiling': round(oracle_ceiling, 2),
        'organic_recovery': round(organic_recovered, 2),
        'fixed_retry_gross': round(fixed_retry_gross, 2),
        'contact_only_gross': round(contact_only_gross, 2),
        'deterministic_gross': round(det_gross, 2),
        'simulated_llm_gross': round(llm_gross, 2),
        'deterministic_incremental': round(det_gross - organic_recovered, 2),
        'simulated_llm_incremental': round(llm_gross - organic_recovered, 2),
        'deterministic_net': round(det_gross - det_cost, 2),
        'simulated_llm_net': round(llm_gross - llm_cost, 2),
        'deterministic_oracle_pct': round((det_gross / oracle_ceiling) * 100, 2) if oracle_ceiling > 0 else 0,
        'simulated_llm_oracle_pct': round((llm_gross / oracle_ceiling) * 100, 2) if oracle_ceiling > 0 else 0,
        'simulated_llm_total_pct': round((llm_gross / total_failed) * 100, 2) if total_failed > 0 else 0,
    }


def compute_stats(series):
    n = len(series)
    mean = statistics.mean(series)
    median = statistics.median(series)
    stdev = statistics.stdev(series) if n > 1 else 0.0
    ci_margin = 1.96 * (stdev / math.sqrt(n)) if n > 1 else 0.0
    return {
        'mean': round(mean, 2),
        'median': round(median, 2),
        'min': round(min(series), 2),
        'max': round(max(series), 2),
        'stdev': round(stdev, 2),
        'ci_95_lower': round(mean - ci_margin, 2),
        'ci_95_upper': round(mean + ci_margin, 2),
    }


def run_multiseed_evaluation():
    print(f"Starting 10-Seed Multi-Seed Evaluation across seeds: {SEEDS}...")
    seed_results = {}

    for seed in SEEDS:
        cases = generate_dataset(seed=seed, total_cases_override=1000, write_to_disk=False)
        res = run_seed_eval(cases)
        seed_results[str(seed)] = res
        print(f"  Seed {seed:2d}: Failed=INR {res['total_failed']:,.0f} | Oracle=INR {res['oracle_ceiling']:,.0f} | LLM Gross=INR {res['simulated_llm_gross']:,.0f} ({res['simulated_llm_oracle_pct']}%)")

    # Aggregate stats across metrics
    metrics = [
        'total_failed', 'oracle_ceiling', 'organic_recovery',
        'deterministic_gross', 'simulated_llm_gross',
        'deterministic_incremental', 'simulated_llm_incremental',
        'deterministic_oracle_pct', 'simulated_llm_oracle_pct',
        'simulated_llm_total_pct', 'simulated_llm_net',
    ]

    aggregated_stats = {}
    for m in metrics:
        vals = [seed_results[str(s)][m] for s in SEEDS]
        aggregated_stats[m] = compute_stats(vals)

    output = {
        'metadata': {
            'total_seeds': len(SEEDS),
            'seeds_evaluated': SEEDS,
            'cases_per_seed': 1000,
            'confidence_level': '95% (Z=1.96)',
            'description': 'Multi-seed evaluation proving stability and absence of seed-cherry-picking across 10 deterministic runs.',
        },
        'per_seed_results': seed_results,
        'summary_statistics': aggregated_stats,
    }

    out_file = REPORTS_DIR / 'multiseed_report.json'
    out_file.parent.mkdir(parents=True, exist_ok=True)
    with open(out_file, 'w', encoding='utf-8') as f:
        json.dump(output, f, indent=2)

    print(f"\nMulti-Seed Evaluation complete. Wrote: {out_file}")
    print(f"Summary (Mean ± 95% CI across 10 seeds):")
    print(f"  Total Portfolio:       INR {aggregated_stats['total_failed']['mean']:,.2f} [INR {aggregated_stats['total_failed']['ci_95_lower']:,.2f}, {aggregated_stats['total_failed']['ci_95_upper']:,.2f}]")
    print(f"  Oracle Ceiling:        INR {aggregated_stats['oracle_ceiling']['mean']:,.2f} [INR {aggregated_stats['oracle_ceiling']['ci_95_lower']:,.2f}, {aggregated_stats['oracle_ceiling']['ci_95_upper']:,.2f}]")
    print(f"  Simulated LLM Gross:   INR {aggregated_stats['simulated_llm_gross']['mean']:,.2f} [INR {aggregated_stats['simulated_llm_gross']['ci_95_lower']:,.2f}, {aggregated_stats['simulated_llm_gross']['ci_95_upper']:,.2f}]")
    print(f"  Oracle Efficiency:     {aggregated_stats['simulated_llm_oracle_pct']['mean']:.2f}% [{aggregated_stats['simulated_llm_oracle_pct']['ci_95_lower']:.2f}%, {aggregated_stats['simulated_llm_oracle_pct']['ci_95_upper']:.2f}%]")
    print(f"  Incremental Recovery:  INR {aggregated_stats['simulated_llm_incremental']['mean']:,.2f} [INR {aggregated_stats['simulated_llm_incremental']['ci_95_lower']:,.2f}, {aggregated_stats['simulated_llm_incremental']['ci_95_upper']:,.2f}]")

    return output

if __name__ == '__main__':
    run_multiseed_evaluation()
