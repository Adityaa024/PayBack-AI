#!/usr/bin/env python3
"""
Generate Unseen Holdout Dataset — PayBack-AI
Creates an isolated out-of-sample dataset (250 cases, Seed 999) that the agent prompts
and heuristic tuning cannot inspect, verifying true policy generalization without overfitting.
"""

from pathlib import Path
import sys

SCRIPT_DIR = Path(__file__).resolve().parent
AI_SERVICE_DIR = SCRIPT_DIR.parent
ROOT_DIR = AI_SERVICE_DIR.parent
sys.path.insert(0, str(SCRIPT_DIR))

from generate_dataset import generate_dataset

def main():
    holdout_file = ROOT_DIR / 'reports' / 'hidden_holdout_batch.json'
    print(f"Generating unseen holdout dataset with seed 999 (250 cases)...")
    dataset = generate_dataset(seed=999, output_file=holdout_file, total_cases_override=250)
    total_val = sum(c['amount'] for c in dataset)
    print(f"Unseen holdout dataset created: 250 cases, Total Value: INR {total_val:,.2f}")

if __name__ == '__main__':
    main()
