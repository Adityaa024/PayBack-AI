#!/usr/bin/env python3
"""
PayBack-AI Empirical Evaluation Engine Runner
Invokes the canonical TypeScript PolicyGuard evaluation engine:
backend/src/scripts/evaluate-batch.ts

Actually imports and executes:
- backend/src/modules/recovery/recovery.contract.ts (PolicyGuard.validate())
- backend/src/modules/policy/merchant-policy.service.ts (MerchantPolicyService)
Against all 1,000 simulated cases.
"""

import subprocess
import sys
from pathlib import Path

def run_evaluation():
    root_dir = Path(__file__).resolve().parent.parent.parent
    backend_dir = root_dir / 'backend'
    script_path = 'src/scripts/evaluate-batch.ts'
    
    use_shell = sys.platform == 'win32'
    cmd = ['npx', 'tsx', script_path]
    
    res = subprocess.run(
        cmd,
        cwd=backend_dir,
        shell=use_shell,
        check=True
    )
    return res.returncode

if __name__ == '__main__':
    run_evaluation()
