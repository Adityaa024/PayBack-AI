#!/usr/bin/env python3
"""
PayBack-AI Empirical Evaluation Engine Runner

Executes the two-stage evaluation pipeline:
1. AI Agent Stage (ai-service/scripts/run_agent_decisions.py):
   Executes RecoveryAgent, PaymentRetryAgent, and MandateSequencerAgent across all cases.
2. Enforcement & Causal Lift Stage (backend/src/scripts/evaluate-batch.ts):
   Executes PolicyGuard.validate() and MerchantPolicyService, evaluating causal recovery
   and dual-denominator lift (Total Failed Debt vs Oracle Ceiling).
"""

import subprocess
import sys
from pathlib import Path

def run_evaluation():
    root_dir = Path(__file__).resolve().parent.parent.parent
    ai_service_dir = root_dir / 'ai-service'
    backend_dir = root_dir / 'backend'
    
    use_shell = sys.platform == 'win32'
    
    # Stage 1: Run Multi-Agent Decision Engine
    print("[RUN] Multi-Agent Strategic Diagnosis (RecoveryAgent, PaymentRetryAgent, MandateSequencerAgent)...")
    agent_script = str(ai_service_dir / 'scripts' / 'run_agent_decisions.py')
    res1 = subprocess.run(
        [sys.executable, agent_script],
        cwd=ai_service_dir,
        shell=use_shell,
        check=True
    )
    if res1.returncode != 0:
        return res1.returncode

    # Stage 2: Run Backend PolicyGuard & Lift Evaluation
    print("[RUN] PolicyGuard Enforcement & Dual-Denominator Lift Calculation...")
    script_path = 'src/scripts/evaluate-batch.ts'
    cmd = ['npx', 'tsx', script_path]
    
    res2 = subprocess.run(
        cmd,
        cwd=backend_dir,
        shell=use_shell,
        check=True
    )
    return res2.returncode

if __name__ == '__main__':
    run_evaluation()
