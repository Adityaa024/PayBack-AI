"""
LLM Trace Recorder & Reproducibility Engine — PayBack-AI
Priority 2: Live LLM Verification, Prompt Hashing, Replay Cache, and Audit Logging.

Guarantees:
1. Every LLM call records: model, provider, metadata, prompt_hash (SHA-256),
   raw response, parsed response, schema validation result, and INR/USD cost.
2. Replay mode strictly looks up recorded traces: missing entries FAIL LOUDLY with KeyError.
3. NEVER silently substitutes heuristic outputs for missing LLM outputs.
"""
import os
import json
import hashlib
import time
from typing import Dict, Any, Optional
from pydantic import BaseModel, Field


class LLMTraceRecord(BaseModel):
    case_id: str
    model: str
    provider: str
    request_metadata: Dict[str, Any] = Field(default_factory=dict)
    prompt_hash: str
    raw_response: str
    parsed_response: Dict[str, Any] = Field(default_factory=dict)
    validation_result: bool
    prompt_tokens: int = 0
    completion_tokens: int = 0
    cost_inr: float = 0.0
    cost_usd: float = 0.0
    latency_ms: float = 0.0
    http_status: int = 200
    provider_headers: Dict[str, str] = Field(default_factory=dict)
    wire_protocol: str = "HTTP/1.1"
    decision_mode: str = "live_provider_call"
    recorded_at: str = Field(default_factory=lambda: time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()))


# Model pricing table per 1M tokens (USD)
PRICING_PER_1M_USD = {
    "groq/llama-3.3-70b-versatile": {"input": 0.59, "output": 0.79},
    "llama-3.3-70b-versatile": {"input": 0.59, "output": 0.79},
    "groq/llama-3.1-8b-instant": {"input": 0.05, "output": 0.08},
    "gemini-1.5-flash": {"input": 0.075, "output": 0.30},
    "gpt-4o-mini": {"input": 0.15, "output": 0.60},
}
USD_TO_INR = 86.50


def compute_prompt_hash(prompt_text: str) -> str:
    """Computes SHA-256 hex digest of normalized prompt string."""
    return hashlib.sha256(prompt_text.strip().encode("utf-8")).hexdigest()


def calculate_llm_cost(model: str, prompt_tokens: int, completion_tokens: int) -> tuple[float, float]:
    """Calculates (cost_usd, cost_inr) based on standard provider token rates."""
    pricing = PRICING_PER_1M_USD.get(model, {"input": 0.59, "output": 0.79})
    cost_usd = (prompt_tokens * pricing["input"] + completion_tokens * pricing["output"]) / 1_000_000.0
    cost_inr = cost_usd * USD_TO_INR
    return round(cost_usd, 6), round(cost_inr, 4)


class LLMTraceRecorder:
    def __init__(self, trace_file_path: Optional[str] = None):
        self.trace_file_path = trace_file_path
        self._traces: Dict[str, LLMTraceRecord] = {}
        if trace_file_path and os.path.exists(trace_file_path):
            self.load_traces(trace_file_path)

    def load_traces(self, path: str):
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
            records = data.get("records", {})
            for case_id, rec in records.items():
                self._traces[case_id] = LLMTraceRecord(**rec)

    def save_traces(self, path: Optional[str] = None):
        target_path = path or self.trace_file_path
        if not target_path:
            raise ValueError("No trace file path specified.")
        os.makedirs(os.path.dirname(os.path.abspath(target_path)), exist_ok=True)
        serializable = {
            "version": "1.0",
            "total_records": len(self._traces),
            "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "records": {k: v.model_dump() for k, v in self._traces.items()},
        }
        with open(target_path, "w", encoding="utf-8") as f:
            json.dump(serializable, f, indent=2)

    def record_call(
        self,
        case_id: str,
        model: str,
        provider: str,
        prompt_text: str,
        raw_response: str,
        parsed_response: Dict[str, Any],
        validation_result: bool,
        prompt_tokens: int = 0,
        completion_tokens: int = 0,
        latency_ms: float = 0.0,
        request_metadata: Optional[Dict[str, Any]] = None,
        http_status: int = 200,
        provider_headers: Optional[Dict[str, str]] = None,
        wire_protocol: str = "HTTP/1.1",
        decision_mode: str = "live_provider_call",
    ) -> LLMTraceRecord:
        prompt_hash = compute_prompt_hash(prompt_text)
        cost_usd, cost_inr = calculate_llm_cost(model, prompt_tokens, completion_tokens)

        record = LLMTraceRecord(
            case_id=case_id,
            model=model,
            provider=provider,
            request_metadata=request_metadata or {},
            prompt_hash=prompt_hash,
            raw_response=raw_response,
            parsed_response=parsed_response,
            validation_result=validation_result,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            cost_inr=cost_inr,
            cost_usd=cost_usd,
            latency_ms=latency_ms,
            http_status=http_status,
            provider_headers=provider_headers or {},
            wire_protocol=wire_protocol,
            decision_mode=decision_mode,
        )
        self._traces[case_id] = record
        return record

    def get_replay(self, case_id: str) -> LLMTraceRecord:
        """
        Retrieves recorded trace for exact replay.
        STRICT REQUIREMENT: Missing entries FAIL LOUDLY with KeyError.
        Never silently substitute heuristic output for missing LLM output!
        """
        if case_id not in self._traces:
            raise KeyError(
                f"[LLM REPLAY ERROR] Missing verified LLM trace record for case_id='{case_id}'. "
                "Silent heuristic fallback is strictly prohibited under Priority 2 rules. "
                "Ensure live LLM calls are recorded or evaluate under 'simulated_llm_policy'."
            )
        return self._traces[case_id]

    def has_trace(self, case_id: str) -> bool:
        return case_id in self._traces

    def get_all_traces(self) -> Dict[str, LLMTraceRecord]:
        return self._traces
