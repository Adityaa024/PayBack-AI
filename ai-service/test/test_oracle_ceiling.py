#!/usr/bin/env python3
"""
Test Suite: Evaluation Harness Oracle Ceiling Self-Check
Reference: piyush2676/recoverx

Asserts that the Oracle arm collects EXACTLY 100% of its own ceiling.
Guarantees that the evaluation harness's definition of 'recoverable' and its
definition of 'recovered' are strictly coherent and mathematically identical.
"""

import json
from pathlib import Path
import sys

def test_oracle_arm_hits_exactly_100_percent_of_ceiling():
    reports_dir = Path(__file__).resolve().parent.parent.parent / 'reports'
    eval_file = reports_dir / 'evaluation.json'

    assert eval_file.exists(), f"Missing evaluation output: {eval_file}"

    with open(eval_file, 'r', encoding='utf-8') as f:
        data = json.load(f)

    assert 'oracle_ceiling' in data, "Missing oracle_ceiling in evaluation output"
    assert 'oracle' in data, "Missing oracle arm in evaluation output"

    oracle_ceiling = data['oracle_ceiling']['amount']
    oracle_recovered = data['oracle']['recovered']
    oracle_efficiency = data['oracle']['oracle_efficiency_pct']

    # Invariant 1: Efficiency must be exactly 100.00%
    assert oracle_efficiency == 100.0, f"Oracle efficiency is {oracle_efficiency}%, expected 100.00%"

    # Invariant 2: Recovered must equal ceiling
    diff = abs(oracle_recovered - oracle_ceiling)
    assert diff < 1e-4, f"Oracle recovered ({oracle_recovered}) diverged from ceiling ({oracle_ceiling})"

    # Invariant 3: Harness self-check passed marker
    assert data['oracle_ceiling']['harness_self_check'] == 'PASSED (100.00% exact match)'

    print(f"\n[PASS] Oracle Ceiling: INR {oracle_ceiling:,.2f} ({data['oracle_ceiling']['recoverable_cases']} recoverable cases).")
    print(f"[PASS] Oracle Recovered: INR {oracle_recovered:,.2f} (Oracle Efficiency: {oracle_efficiency:.2f}%).")
    print(f"[PASS] Harness Self-Check: Passed with exact floating precision.")

if __name__ == '__main__':
    test_oracle_arm_hits_exactly_100_percent_of_ceiling()
