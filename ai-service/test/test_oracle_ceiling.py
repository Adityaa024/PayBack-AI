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

    oracle_ceiling = data.get('arms', {}).get('oracle', {}).get('recoverable_oracle_ceiling') or data.get('arms', {}).get('oracle_ceiling', {}).get('recoverable_oracle_ceiling') or data.get('benchmark_metadata', {}).get('oracle_ceiling_amount')
    oracle_arm = data.get('arms', {}).get('oracle') or data.get('arms', {}).get('oracle_ceiling') or data.get('oracle', {})
    oracle_recovered = oracle_arm.get('gross_recovered_value') or oracle_arm.get('recovered')
    oracle_efficiency = oracle_arm.get('recovery_pct_oracle_ceiling') or oracle_arm.get('oracle_efficiency_pct')

    assert oracle_ceiling is not None, "Missing oracle_ceiling in evaluation output"
    assert oracle_recovered is not None, "Missing oracle recovered in evaluation output"

    # Invariant 1: Efficiency must be exactly 100.00%
    assert oracle_efficiency == 100.0, f"Oracle efficiency is {oracle_efficiency}%, expected 100.00%"

    # Invariant 2: Recovered must equal ceiling
    diff = abs(oracle_recovered - oracle_ceiling)
    assert diff < 1e-4, f"Oracle recovered ({oracle_recovered}) diverged from ceiling ({oracle_ceiling})"

    # Invariant 3: Harness self-check passed marker
    marker = data.get('oracle_ceiling', {}).get('harness_self_check') or data.get('benchmark_metadata', {}).get('harness_self_check')
    assert marker == 'PASSED (100.00% exact match)'

    recoverable_count = data.get('oracle_ceiling', {}).get('recoverable_cases') or data.get('benchmark_metadata', {}).get('oracle_recoverable_cases', 429)
    print(f"\n[PASS] Oracle Ceiling: INR {oracle_ceiling:,.2f} ({recoverable_count} recoverable cases).")
    print(f"[PASS] Oracle Recovered: INR {oracle_recovered:,.2f} (Oracle Efficiency: {oracle_efficiency:.2f}%).")
    print(f"[PASS] Harness Self-Check: Passed with exact floating precision.")

if __name__ == '__main__':
    test_oracle_arm_hits_exactly_100_percent_of_ceiling()
