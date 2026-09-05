#!/usr/bin/env python3
"""
PayBack-AI Root Verification Dispatcher
Executes the master verification workflow at scripts/verify_all.py.
"""
import sys
import subprocess
from pathlib import Path

def main():
    root_dir = Path(__file__).resolve().parent
    script_path = root_dir / 'scripts' / 'verify_all.py'
    
    cmd = [sys.executable, str(script_path)] + sys.argv[1:]
    res = subprocess.run(cmd, cwd=root_dir)
    sys.exit(res.returncode)

if __name__ == '__main__':
    main()
