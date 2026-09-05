#!/usr/bin/env python3
"""
Ablation Telescoping Sum Integrity Test — PayBack-AI
Priority 3 requirement:
"Add a test proving:
 sum(ablation increments) == final incremental lift
 within a documented floating-point tolerance."
"""

import json
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent.parent
ABLATION_FILE = ROOT_DIR / "reports" / "ablation_report.json"


def test_ablation_telescoping_sum_invariant():
    """
    Proves that the sum of all marginal ablation increments equals
    the final cumulative incremental lift within 1e-4 floating point tolerance.
    """
    assert ABLATION_FILE.exists(), f"Ablation report missing at {ABLATION_FILE}. Run run_ablation_sensitivity.py first."

    with open(ABLATION_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)

    final_lift = data["benchmark_total_incremental_lift"]
    layers = data["layers"]

    # Sum all marginal increments (excluding base layer index 0 which has 0 lift)
    incremental_layers = layers[1:]
    sum_increments = sum(layer["marginal_lift_inr"] for layer in incremental_layers)

    tolerance = 1e-4
    diff = abs(sum_increments - final_lift)

    print(f"\n[Ablation Proof] Final Cumulative Lift: INR {final_lift:,.2f}")
    print(f"[Ablation Proof] Sum of Marginal Lifts: INR {sum_increments:,.2f}")
    print(f"[Ablation Proof] Float Difference: {diff:.8f} (Tolerance: {tolerance})")

    assert diff < tolerance, (
        f"Ablation integrity invariant violated! "
        f"Sum of increments ({sum_increments}) does not match final lift ({final_lift}). "
        f"Diff: {diff} >= {tolerance}"
    )
    assert data["invariant_verified"] is True


def test_all_ablation_layers_present():
    """Proves all 8 required architectural layers are measured in the ablation report."""
    with open(ABLATION_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)

    layers = data["layers"]
    layer_names = [l["layer"] for l in layers]

    required_keywords = [
        "Base",
        "Coverage Outreach",
        "Retry Timing",
        "Channel Selection",
        "Dynamic Cooldowns",
        "PolicyGuard",
        "Deterministic Classification",
        "LLM",
    ]

    for kw in required_keywords:
        assert any(kw.lower() in name.lower() for name in layer_names), f"Missing required ablation layer for: {kw}"


def test_leave_one_feature_out_lofo_present():
    """Proves Leave-One-Feature-Out (LOFO) order-independent ablation results exist for all 8 features."""
    with open(ABLATION_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)

    assert "leave_one_feature_out_ablation" in data, "LOFO ablation section missing"
    lofo = data["leave_one_feature_out_ablation"]
    assert len(lofo) == 8, f"Expected 8 LOFO features, found {len(lofo)}"

    for item in lofo:
        assert "feature" in item
        assert "marginal_drop_when_removed" in item
        assert "isolated_causal_contribution" in item


def test_order_permutation_sensitivity_present():
    """Proves order permutation sensitivity measurements exist across features."""
    with open(ABLATION_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)

    assert "order_permutation_sensitivity" in data, "Order permutation section missing"
    perms = data["order_permutation_sensitivity"]
    assert len(perms) == 8, f"Expected 8 permutation feature measurements, found {len(perms)}"

    for item in perms:
        assert "feature" in item
        assert "mean_marginal_lift" in item
        assert "order_sensitivity_range" in item


if __name__ == "__main__":
    test_ablation_telescoping_sum_invariant()
    test_all_ablation_layers_present()
    test_leave_one_feature_out_lofo_present()
    test_order_permutation_sensitivity_present()
    print("ALL ABLATION INTEGRITY TESTS PASSED!")
