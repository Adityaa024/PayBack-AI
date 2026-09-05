#!/usr/bin/env python3
"""
PayBack-AI — One-Command Verification Workflow
Executes:
1. Structural safety AST audit (zero banned execution/DB imports in AI agents)
2. Backend recovery test suite (15 suites: Unit, Concurrency, Ledger, Outbox, PolicyGuard, Parity, Adversarial)
3. Deterministic Batch Generation
4. Multi-Arm Empirical Evaluation (6 benchmark arms side-by-side)
5. Ablation & Sensitivity Sweeps
6. Deterministic Reproducibility Verification
7. Oracle Ceiling Self-Check Assertion (100.00% exact match)
"""

import subprocess
import sys
import time
import json
from pathlib import Path

# Fix Windows console UTF-8 output if needed
if sys.stdout.encoding and sys.stdout.encoding.lower() != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

ROOT_DIR = Path(__file__).resolve().parent.parent
BACKEND_DIR = ROOT_DIR / 'backend'
AI_SERVICE_DIR = ROOT_DIR / 'ai-service'
REPORTS_DIR = ROOT_DIR / 'reports'

def print_header(title: str):
    print("\n" + "=" * 70)
    print(f"  {title}")
    print("=" * 70)

def run_step(name: str, cmd: list, cwd: Path) -> bool:
    print(f"\n[RUN] {name} ...")
    start = time.time()
    try:
        use_shell = sys.platform == 'win32'
        res = subprocess.run(
            cmd,
            cwd=cwd,
            capture_output=True,
            text=True,
            encoding='utf-8',
            errors='replace',
            shell=use_shell,
            check=False
        )
        elapsed = time.time() - start
        if res.returncode == 0:
            print(f"  [PASS] {name} ({elapsed:.2f}s)")
            if res.stdout.strip():
                lines = res.stdout.strip().splitlines()
                for l in lines[-3:]:
                    print(f"    | {l}")
            return True
        else:
            print(f"  [FAIL] {name} ({elapsed:.2f}s, exit code {res.returncode})")
            if res.stdout.strip():
                print("    STDOUT:")
                for l in res.stdout.strip().splitlines()[-8:]:
                    print(f"      {l}")
            if res.stderr.strip():
                print("    STDERR:")
                for l in res.stderr.strip().splitlines()[-8:]:
                    print(f"      {l}")
            return False
    except Exception as e:
        print(f"  [FAIL] {name} EXCEPTION: {e}")
        return False

def main():
    print_header("PayBack-AI -- Complete System Verification Workflow")
    print(f"Working directory: {ROOT_DIR}")

    passed_steps = []
    failed_steps = []

    # Step 1: AST Structural Safety Scan
    step1 = ("AST Structural Safety Import Ban", [sys.executable, "test/src/test_structural_safety.py"], AI_SERVICE_DIR)
    if run_step(*step1):
        passed_steps.append(step1[0])
    else:
        failed_steps.append(step1[0])

    # Step 2: All 15 Recovery Test Suites (Unit, Concurrency, Ledger, Outbox, PolicyGuard, Parity, Adversarial)
    step2 = ("Vitest Recovery & Adversarial Suites (93+ tests)", ["npx", "vitest", "run", "test/modules/recovery/"], BACKEND_DIR)
    if run_step(*step2):
        passed_steps.append(step2[0])
    else:
        failed_steps.append(step2[0])

    # Step 3: Deterministic Batch Generation
    step3 = ("Evaluation Batch Dataset Generation", [sys.executable, "scripts/generate_dataset.py"], AI_SERVICE_DIR)
    if run_step(*step3):
        passed_steps.append(step3[0])
    else:
        failed_steps.append(step3[0])

    # Step 4: 6-Arm Multi-Agent Batch Evaluation
    step4 = ("6-Arm Empirical Benchmark Evaluation", [sys.executable, "scripts/run_evaluation.py"], AI_SERVICE_DIR)
    if run_step(*step4):
        passed_steps.append(step4[0])
    else:
        failed_steps.append(step4[0])

    # Step 5: Ablation & Sensitivity Sweeps
    step5 = ("Ablation & Sensitivity Analysis Sweeps", [sys.executable, "scripts/run_ablation_sensitivity.py"], AI_SERVICE_DIR)
    if run_step(*step5):
        passed_steps.append(step5[0])
    else:
        failed_steps.append(step5[0])

    # Step 6: Reproducibility Baseline Verification
    step6 = ("Deterministic Reproducibility Verification", [sys.executable, "scripts/verify_reproduce.py"], AI_SERVICE_DIR)
    if run_step(*step6):
        passed_steps.append(step6[0])
    else:
        failed_steps.append(step6[0])

    # Step 7: Oracle Ceiling Self-Check Assertion (recoverx benchmark)
    step7 = ("Evaluation Harness Oracle Ceiling Self-Check", [sys.executable, "test/test_oracle_ceiling.py"], AI_SERVICE_DIR)
    if run_step(*step7):
        passed_steps.append(step7[0])
    else:
        failed_steps.append(step7[0])

    # Read latest evaluation report
    eval_json_path = REPORTS_DIR / 'evaluation.json'
    eval_summary = {}
    if eval_json_path.exists():
        try:
            with open(eval_json_path, 'r', encoding='utf-8') as f:
                eval_summary = json.load(f)
        except Exception:
            pass

    # Print Summary Report
    print_header("Verification Results Summary")
    print(f"Passed: {len(passed_steps)}/{len(passed_steps) + len(failed_steps)}")
    for p in passed_steps:
        print(f"  [PASS] {p}")
    for f in failed_steps:
        print(f"  [FAIL] {f}")

    if eval_summary:
        print("\nLatest Verified 6-Arm Benchmark Lift (20% Holdout Control Arm):")
        arms = eval_summary.get('arms', {})
        orc = arms.get('oracle_ceiling', {})
        ctrl = arms.get('do_nothing_baseline', {})
        fixed = arms.get('fixed_retry_baseline', {})
        contact = arms.get('contact_only_baseline', {})
        det = arms.get('deterministic_policy', {})
        llm = arms.get('simulated_llm_policy', {})

        print(f"  1. Oracle Ceiling (Max Realizable): INR {orc.get('gross_recovered_value', 0):,.2f} ({orc.get('recovery_pct_total_value', 0)}% of debt, 100.00% ceiling)")
        print(f"  2. Do-Nothing Control (0 Action):   Recovered INR {ctrl.get('gross_recovered_value', 0):,.2f} ({ctrl.get('recovery_pct_total_value', 0)}% organic)")
        print(f"  3. Fixed Retry (Blind 2-touch):    Lift INR {fixed.get('incremental_recovery', 0):,.2f} (Contacts: {fixed.get('contact_count', 0)}, Violations: {fixed.get('compliance_violations', 0)})")
        print(f"  4. Contact-Only (Day 1):           Lift INR {contact.get('incremental_recovery', 0):,.2f} (Contacts: {contact.get('contact_count', 0)}, Violations: {contact.get('compliance_violations', 0)})")
        print(f"  5. PayBack-AI Deterministic:       Lift INR {det.get('incremental_recovery', 0):,.2f} (Eff: {det.get('recovery_pct_oracle_ceiling', 0)}%, Violations: {det.get('compliance_violations', 0)})")
        print(f"  6. PayBack-AI Simulated LLM:       Lift INR {llm.get('incremental_recovery', 0):,.2f} (Eff: {llm.get('recovery_pct_oracle_ceiling', 0)}%, Cost: INR {llm.get('llm_cost', 0):.2f})")

    if failed_steps:
        print(f"\n[FAILED] Verification failed on {len(failed_steps)} step(s).")
        sys.exit(1)
    else:
        print("\n[SUCCESS] All verifications passed successfully. System is demo-ready and mathematically honest.")
        sys.exit(0)

if __name__ == '__main__':
    main()
