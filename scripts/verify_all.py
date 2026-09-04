#!/usr/bin/env python3
"""
PayBack-AI — One-Command Verification Workflow
Executes:
1. Structural safety AST audit (zero banned execution/DB imports in AI agents)
2. Backend recovery test suite (Unit, Integration, Concurrency, Outbox, PolicyGuard, Ledger Tamper)
3. Deterministic Evaluation Harness & Reproducibility Verification
4. Generates an evidence-backed verification report
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
        # Use shell=True on Windows for npm/npx
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

    # Step 2: All 11 Recovery Test Suites (Unit, Concurrency, Ledger, Outbox, Policy)
    step2 = ("Vitest Recovery Test Suites (67+ tests)", ["npx", "vitest", "run", "test/modules/recovery/"], BACKEND_DIR)
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

    # Step 4: Empirical A/B Evaluation Calculation
    step4 = ("A/B Evaluation & Lift Report Generation", [sys.executable, "scripts/run_evaluation.py"], AI_SERVICE_DIR)
    if run_step(*step4):
        passed_steps.append(step4[0])
    else:
        failed_steps.append(step4[0])

    # Step 5: Reproducibility Baseline Verification
    step5 = ("Deterministic Reproducibility Verification", [sys.executable, "scripts/verify_reproduce.py"], AI_SERVICE_DIR)
    if run_step(*step5):
        passed_steps.append(step5[0])
    else:
        failed_steps.append(step5[0])

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
        print("\nLatest Verified Empirical Lift (20% Holdout Control Arm):")
        ai = eval_summary.get('ai', {})
        naive = eval_summary.get('naive', {})
        ctrl = eval_summary.get('control', {})
        print(f"  * Control (Baseline): Gross Recovered INR {ctrl.get('recovered', 0):,.2f} (Cost: INR 0.00)")
        print(f"  * Naive Baseline:     Incremental Lift INR {naive.get('incremental', 0):,.2f} (Contacts: {naive.get('contacts', 0)})")
        print(f"  * PayBack-AI Agent:   Incremental Lift INR {ai.get('incremental', 0):,.2f} (Contacts: {ai.get('contacts', 0)})")

    if failed_steps:
        print(f"\n[FAILED] Verification failed on {len(failed_steps)} step(s).")
        sys.exit(1)
    else:
        print("\n[SUCCESS] All verifications passed successfully. System is demo-ready and mathematically honest.")
        sys.exit(0)

if __name__ == '__main__':
    main()
