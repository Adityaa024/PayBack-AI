#!/usr/bin/env python3
"""
Test Suite: Evaluation Harness Oracle Ceiling Self-Check
Reference: piyush2676/recoverx

Asserts that the Oracle arm collects EXACTLY 100% of its own ceiling.
Guarantees that the evaluation harness's definition of 'recoverable' and its
definition of 'recovered' are strictly coherent and mathematically identical.
"""

import json
import pytest
from pathlib import Path
import sys

# Add scripts directory to path
SCRIPTS_DIR = Path(__file__).resolve().parent.parent / 'scripts'
sys.path.insert(0, str(SCRIPTS_DIR))

from run_evaluation import evaluate_oracle_case, is_case_legally_barred

def test_oracle_arm_hits_exactly_100_percent_of_ceiling():
    reports_dir = Path(__file__).resolve().parent.parent.parent / 'reports'
    batch_file = reports_dir / 'simulated_batch.json'

    assert batch_file.exists(), f"Missing dataset: {batch_file}"

    with open(batch_file, 'r', encoding='utf-8') as f:
        dataset = json.load(f)

    oracle_ceiling = 0.0
    oracle_recovered = 0.0
    recoverable_count = 0
    non_recoverable_count = 0

    cost_per_contact = 1.50

    for case in dataset:
        if case.get('is_holdout'):
            continue

        amt = float(case['amount'])
        truth = case['truth']
        barred, _ = is_case_legally_barred(case)

        # Oracle definition of recoverable:
        is_rec = False
        if truth.get('natural_recovery'):
            is_rec = True
        elif not barred and (truth.get('lane_recovery') or truth.get('tone_escalation_recovery')):
            is_rec = True

        if is_rec:
            oracle_ceiling += amt
            recoverable_count += 1
        else:
            non_recoverable_count += 1

        # Oracle arm execution
        recovered, contacts, cost, was_rec = evaluate_oracle_case(case, cost_per_contact)

        # Invariant 1: was_rec returned by evaluator must match is_rec definition
        assert was_rec == is_rec, f"Discrepancy on case {case['invoice_id']}: was_rec={was_rec} vs is_rec={is_rec}"

        if recovered:
            oracle_recovered += amt
            # Invariant 2: Recovered case must only occur if case is recoverable
            assert is_rec is True, f"Case {case['invoice_id']} recovered but marked unrecoverable"
        else:
            # Invariant 3: Unrecovered case must only occur if case is not recoverable
            assert is_rec is False, f"Case {case['invoice_id']} recoverable but not recovered by oracle"

    # Invariant 4: Oracle recovered must match Oracle ceiling to floating precision
    diff = abs(oracle_recovered - oracle_ceiling)
    assert diff < 1e-6, f"Oracle arm diverged from ceiling: recovered={oracle_recovered}, ceiling={oracle_ceiling}, diff={diff}"

    # Invariant 5: Oracle Efficiency must be exactly 100.0%
    oracle_efficiency = (oracle_recovered / oracle_ceiling) * 100.0
    assert round(oracle_efficiency, 4) == 100.0, f"Oracle efficiency is {oracle_efficiency}%, expected 100.0%"

    print(f"\n[PASS] Oracle Ceiling: INR {oracle_ceiling:,.2f} across {recoverable_count} recoverable cases.")
    print(f"[PASS] Oracle Recovered: INR {oracle_recovered:,.2f} (Oracle Efficiency: {oracle_efficiency:.2f}%).")
    print(f"[PASS] Unrecoverable/Barred Cases: {non_recoverable_count} correctly filtered.")

if __name__ == '__main__':
    test_oracle_arm_hits_exactly_100_percent_of_ceiling()
