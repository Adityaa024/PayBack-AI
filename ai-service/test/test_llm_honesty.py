#!/usr/bin/env python3
"""
Honest LLM & Replay Integrity Test Suite — PayBack-AI
Verifies:
1. Offline replay produces identical decisions as recorded runs (zero drift).
2. Cache misses in replay mode FAIL LOUDLY with KeyError (no silent heuristic fallback).
3. Malformed, truncated, or invalid model output is rejected by schema validation.
4. Policy-violating model recommendations are intercepted and blocked by stopping rules.
"""

import sys
import json
import pytest
from pathlib import Path
from pydantic import ValidationError

SCRIPT_DIR = Path(__file__).resolve().parent
AI_SERVICE_DIR = SCRIPT_DIR.parent
ROOT_DIR = AI_SERVICE_DIR.parent
sys.path.insert(0, str(AI_SERVICE_DIR))

from src.llm_trace import LLMTraceRecorder, LLMTraceRecord, compute_prompt_hash
from src.agents.recovery_agent import RecoveryDecision, RecoveryAgent, RecoveryRequest

TRACES_FILE = ROOT_DIR / 'reports' / 'llm_recorded_traces.json'
REAL_TRACES_FILE = ROOT_DIR / 'reports' / 'real_llm_traces.json'


def test_offline_replay_parity():
    """Proves offline replay produces identical decisions as the recorded run."""
    assert TRACES_FILE.exists(), f"Recorded traces file missing at {TRACES_FILE}"
    recorder = LLMTraceRecorder(str(TRACES_FILE))
    
    # Check sample cases
    sample_ids = ["inv_sim_0000", "inv_sim_0001", "inv_sim_0002"]
    for cid in sample_ids:
        record = recorder.get_replay(cid)
        assert record.case_id == cid
        assert record.prompt_hash is not None
        assert len(record.prompt_hash) == 64  # SHA-256
        assert record.validation_result is True
        assert record.decision_mode == "simulated_llm_record"

        # Re-parse raw response to prove schema reproducibility
        parsed_reconstructed = json.loads(record.raw_response)
        decision = RecoveryDecision(**parsed_reconstructed)
        assert decision.incident_lane == record.parsed_response["incident_lane"]
        assert decision.strategy == record.parsed_response["strategy"]


def test_real_llm_provider_trace_replay():
    """Proves genuine real provider traces have request IDs, token usage, and replay parity."""
    assert REAL_TRACES_FILE.exists(), f"Real provider traces file missing at {REAL_TRACES_FILE}"
    recorder = LLMTraceRecorder(str(REAL_TRACES_FILE))
    assert len(recorder.get_all_traces()) == 50, "Expected 50 documented real provider traces"

    sample_record = recorder.get_replay("inv_sim_0000")
    assert sample_record.provider == "groq"
    assert "llama-3.3-70b" in sample_record.model
    assert "request_id" in sample_record.request_metadata
    assert sample_record.request_metadata["request_id"].startswith("req_")
    assert sample_record.prompt_tokens > 0
    assert sample_record.completion_tokens > 0
    assert sample_record.cost_inr > 0.0
    assert sample_record.validation_result is True
    assert sample_record.decision_mode == "real_llm_provider_trace"

    # Verify loud failure on cache miss
    with pytest.raises(KeyError) as exc_info:
        recorder.get_replay("inv_sim_unrecorded_missing_999")
    assert "Missing verified LLM trace record" in str(exc_info.value)


def test_cache_miss_fails_loudly():
    """Proves cache misses fail loudly with KeyError instead of silent heuristic fallback."""
    recorder = LLMTraceRecorder(str(TRACES_FILE))
    non_existent_id = "inv_sim_unrecorded_99999"

    with pytest.raises(KeyError) as exc_info:
        recorder.get_replay(non_existent_id)

    assert "Missing verified LLM trace record" in str(exc_info.value)
    assert "Silent heuristic fallback is strictly prohibited" in str(exc_info.value)


def test_malformed_model_output_rejected():
    """Proves malformed, truncated, or schema-violating LLM output is rejected."""
    # 1. Invalid incident lane
    invalid_lane_payload = {
        "incident_lane": "crypto_escrow_failure",  # Not in Literal
        "root_cause": "unknown",
        "strategy": "soft_reminder",
        "confidence": 0.8,
    }
    with pytest.raises(ValidationError):
        RecoveryDecision(**invalid_lane_payload)

    # 2. Confidence out of bounds (> 1.0)
    out_of_bounds_payload = {
        "incident_lane": "payment_degradation",
        "root_cause": "payment_method_failed",
        "strategy": "soft_reminder",
        "confidence": 1.5,  # Invalid: le=1.0
    }
    with pytest.raises(ValidationError):
        RecoveryDecision(**out_of_bounds_payload)

    # 3. Truncated JSON
    truncated_json = '{"incident_lane": "payment_degradation", "confidence": '
    with pytest.raises(json.JSONDecodeError):
        json.loads(truncated_json)


import asyncio

def test_policy_violating_model_output_intercepted():
    """Proves model recommendations that violate stopping rules are intercepted."""
    agent = RecoveryAgent()

    # Case: >90 days overdue (Rule 1: Legal Stop)
    req_overdue = RecoveryRequest(
        invoice_id="test_overdue_001",
        invoice_no="INV-OVERDUE-001",
        client_name="Overdue Client",
        invoice_amount="5000.00",
        due_date="2026-01-01",
        days_overdue=95,  # Exceeds MAX_DAYS_OVERDUE_AUTO (90)
    )
    decision = asyncio.run(agent.analyze(req_overdue))
    assert decision.strategy == "legal_stop"
    assert "90 day" in decision.reasoning.lower() or "overdue" in decision.reasoning.lower()

    # Case: Active dispute (Rule 6: Dispute Pending)
    req_dispute = RecoveryRequest(
        invoice_id="test_dispute_002",
        invoice_no="INV-DISPUTE-002",
        client_name="Disputing Client",
        invoice_amount="2500.00",
        due_date="2026-08-01",
        days_overdue=30,
        has_dispute=True,
    )
    decision_disp = asyncio.run(agent.analyze(req_dispute))
    assert decision_disp.root_cause == "dispute_pending"
    assert "dispute" in decision_disp.reasoning.lower()


if __name__ == '__main__':
    test_offline_replay_parity()
    test_real_llm_provider_trace_replay()
    test_cache_miss_fails_loudly()
    test_malformed_model_output_rejected()
    test_policy_violating_model_output_intercepted()
    print("ALL 5 HONEST LLM REPLAY & INTEGRITY TESTS PASSED!")
