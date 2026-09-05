#!/usr/bin/env python3
"""
Multi-Seed Unseen Holdout Dataset Generator — PayBack-AI
Generates 5 independent unseen holdout datasets across isolated seeds (101, 202, 303, 404, 505),
each containing 250 payment failure cases uninspected by the policy rules or training datasets.

Saves:
- reports/unseen_holdout_batch.json (primary unseen holdout, seed 999)
- reports/unseen_holdouts/holdout_seed_101.json
- reports/unseen_holdouts/holdout_seed_202.json
- reports/unseen_holdouts/holdout_seed_303.json
- reports/unseen_holdouts/holdout_seed_404.json
- reports/unseen_holdouts/holdout_seed_505.json
- reports/hidden_holdout_batch.json (symlink/copy for backward compatibility)
"""

import sys
import json
import shutil
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent.parent
AI_SERVICE_DIR = ROOT_DIR / "ai-service"
sys.path.insert(0, str(AI_SERVICE_DIR))

from scripts.generate_dataset import generate_dataset

REPORTS_DIR = ROOT_DIR / "reports"
HOLDOUTS_DIR = REPORTS_DIR / "unseen_holdouts"
HOLDOUTS_DIR.mkdir(parents=True, exist_ok=True)

HOLDOUT_SEEDS = [101, 202, 303, 404, 505]
PRIMARY_HOLDOUT_SEED = 999
HOLDOUT_SIZE = 250


def generate_all_unseen_holdouts():
    print(f"Generating 5 independent unseen holdout datasets ({HOLDOUT_SIZE} cases each)...")
    summary = {}

    # Primary unseen holdout (seed 999)
    primary_cases = generate_dataset(seed=PRIMARY_HOLDOUT_SEED, total_cases_override=HOLDOUT_SIZE, write_to_disk=False)
    primary_path = REPORTS_DIR / "unseen_holdout_batch.json"
    with open(primary_path, "w", encoding="utf-8") as f:
        json.dump(primary_cases, f, indent=2)

    # Maintain hidden_holdout_batch.json copy for backward compatibility
    legacy_path = REPORTS_DIR / "hidden_holdout_batch.json"
    shutil.copyfile(primary_path, legacy_path)

    primary_val = sum(float(c["amount"]) for c in primary_cases)
    print(f"  [Primary] Seed {PRIMARY_HOLDOUT_SEED}: {len(primary_cases)} cases, Exposure: INR {primary_val:,.2f}")

    for seed in HOLDOUT_SEEDS:
        cases = generate_dataset(seed=seed, total_cases_override=HOLDOUT_SIZE, write_to_disk=False)
        seed_path = HOLDOUTS_DIR / f"holdout_seed_{seed}.json"
        with open(seed_path, "w", encoding="utf-8") as f:
            json.dump(cases, f, indent=2)

        tot_val = sum(float(c["amount"]) for c in cases)
        summary[f"seed_{seed}"] = {
            "seed": seed,
            "cases": len(cases),
            "total_value": tot_val,
            "path": str(seed_path.relative_to(ROOT_DIR)).replace("\\", "/"),
        }
        print(f"  [Unseen]  Seed {seed}: {len(cases)} cases, Exposure: INR {tot_val:,.2f}")

    summary_file = HOLDOUTS_DIR / "unseen_holdouts_manifest.json"
    with open(summary_file, "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2)

    print(f"[SUCCESS] Generated 5 independent unseen holdouts in {HOLDOUTS_DIR}")


if __name__ == "__main__":
    generate_all_unseen_holdouts()
