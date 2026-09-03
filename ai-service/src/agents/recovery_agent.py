"""
Recovery Agent — AI orchestrator for revenue recovery strategy selection.
Given an at-risk invoice, determines root cause and best intervention.
"""
import json
import re
from typing import Optional, List, Dict, Any, Literal
from pydantic import BaseModel, Field
from src.prompts.recovery_prompt import RECOVERY_SYSTEM_PROMPT, RECOVERY_USER_PROMPT
from src.security import sanitize_input
from src.llm_client import llm_client
from src.api.logging import logger


class RecoveryRequest(BaseModel):
    invoice_id: str = Field(..., max_length=100)
    invoice_no: str = Field(..., max_length=100)
    client_name: str = Field(..., max_length=200)
    invoice_amount: str = Field(..., max_length=50)
    currency: str = Field(default="INR", max_length=10)
    due_date: str = Field(..., max_length=50)
    days_overdue: int = Field(default=0)
    payment_status: str = Field(default="Overdue", max_length=50)
    followup_count: int = Field(default=0)
    retry_count: int = Field(default=0)
    failure_reason: Optional[str] = Field(default=None, max_length=500)
    portal_views: int = Field(default=0)
    has_dispute: bool = Field(default=False)
    ptp_count: int = Field(default=0)
    ptp_broken: int = Field(default=0)
    communication_history: Optional[List[Dict[str, Any]]] = None


class RecoveryDecision(BaseModel):
    incident_lane: Literal[
        "payment_degradation",
        "subscription_rescue",
        "checkout_dropoff",
        "b2b_receivables",
    ] = "payment_degradation"
    root_cause: Literal[
        "payment_method_failed",
        "checkout_abandoned",
        "subscription_lapsed",
        "behavioral_delay",
        "dispute_pending",
        "unknown",
    ] = "unknown"
    strategy: Literal[
        "payment_link_refresh",
        "soft_reminder",
        "firm_escalation",
        "mandate_retry",
        "promise_follow_up",
        "legal_stop",
    ] = "soft_reminder"
    confidence: float = Field(default=0.5, ge=0.0, le=1.0)
    reasoning: str = ""
    estimated_recovery_probability: float = Field(default=0.5, ge=0.0, le=1.0)
    recommended_delay_hours: int = Field(default=24)
    stopping_condition: str = ""
    personalization_hint: str = ""
    voice_script_hinglish: str = ""


class MessageObj:
    def __init__(self, type_str: str, content_str: str):
        self.type = type_str
        self.content = content_str


class RecoveryAgent:
    """
    AI Recovery Orchestrator — determines root cause and optimal recovery strategy
    for each at-risk invoice. Enforces stopping rules before returning strategy.
    """

    # Hard stopping rules evaluated before calling LLM
    MAX_RETRIES = 3
    MAX_DAYS_OVERDUE_AUTO = 90

    def _apply_stopping_rules(self, request: RecoveryRequest) -> Optional[RecoveryDecision]:
        """Returns a legal_stop decision if hard stopping rules are met."""
        reasons = []

        if request.days_overdue > self.MAX_DAYS_OVERDUE_AUTO:
            reasons.append(f"Invoice {request.days_overdue} days overdue (>90 day cap)")

        if request.retry_count >= self.MAX_RETRIES:
            reasons.append(f"Max retry attempts reached ({request.retry_count})")

        if request.ptp_broken >= 2:
            reasons.append(f"Promise-to-pay broken {request.ptp_broken} times")

        if reasons:
            reason_text = "; ".join(reasons)
            logger.info(
                "recovery_hard_stop_triggered",
                invoice_id=request.invoice_id,
                reasons=reason_text,
            )
            return RecoveryDecision(
                root_cause="unknown",
                strategy="legal_stop",
                confidence=1.0,
                reasoning=f"Automatic stop: {reason_text}",
                estimated_recovery_probability=0.05,
                recommended_delay_hours=0,
                stopping_condition=reason_text,
                personalization_hint="Refer to legal team — do not send automated comms",
            )
        return None

    async def analyze(self, request: RecoveryRequest) -> RecoveryDecision:
        """
        Analyzes the at-risk invoice and returns a recovery decision.
        Applies hard stopping rules first, then falls back to LLM for strategy.
        """
        # 1. Hard stopping rules (no LLM needed)
        stop_decision = self._apply_stopping_rules(request)
        if stop_decision:
            return stop_decision

        # 2. Sanitize inputs
        clean_client = sanitize_input(request.client_name or "")
        clean_invoice_no = sanitize_input(request.invoice_no or "")
        clean_failure_reason = sanitize_input(request.failure_reason or "N/A")

        # Format communication history summary
        comms_text = "None"
        if request.communication_history:
            summaries = []
            for c in request.communication_history[:3]:
                subj = sanitize_input(str(c.get("subject", "") or ""))
                status = str(c.get("status", ""))
                summaries.append(f"- [{status}] {subj}")
            if summaries:
                comms_text = "\n".join(summaries)

        user_prompt = RECOVERY_USER_PROMPT.format(
            invoice_id=request.invoice_id,
            invoice_no=clean_invoice_no,
            client_name=clean_client,
            currency=request.currency,
            invoice_amount=request.invoice_amount,
            due_date=request.due_date,
            days_overdue=request.days_overdue,
            payment_status=request.payment_status,
            followup_count=request.followup_count,
            retry_count=request.retry_count,
            failure_reason=clean_failure_reason,
            portal_views=request.portal_views,
            has_dispute=request.has_dispute,
            ptp_count=request.ptp_count,
            ptp_broken=request.ptp_broken,
            communication_history=comms_text,
        )

        messages = [
            MessageObj("system", RECOVERY_SYSTEM_PROMPT),
            MessageObj("user", user_prompt),
        ]

        try:
            response = await llm_client.generate(messages, temperature=0.2)
            content = response.content.strip()

            json_match = re.search(r"\{[\s\S]*\}", content)
            json_str = json_match.group(0) if json_match else content
            data = json.loads(json_str)

            # Validate and clamp numeric fields
            confidence = max(0.0, min(1.0, float(data.get("confidence", 0.5))))
            recovery_prob = max(0.0, min(1.0, float(data.get("estimated_recovery_probability", 0.5))))
            delay_hours = max(0, int(data.get("recommended_delay_hours", 24)))

            # Validate enums with fallback
            root_cause = data.get("root_cause", "unknown")
            valid_causes = {
                "payment_method_failed",
                "checkout_abandoned",
                "subscription_lapsed",
                "behavioral_delay",
                "dispute_pending",
                "unknown",
            }
            if root_cause not in valid_causes:
                root_cause = "unknown"

            strategy = data.get("strategy", "soft_reminder")
            valid_strategies = {
                "payment_link_refresh",
                "soft_reminder",
                "firm_escalation",
                "mandate_retry",
                "promise_follow_up",
                "legal_stop",
            }
            if strategy not in valid_strategies:
                strategy = "soft_reminder"

            incident_lane = data.get("incident_lane", "payment_degradation")
            valid_lanes = {"payment_degradation", "subscription_rescue", "checkout_dropoff", "b2b_receivables"}
            if incident_lane not in valid_lanes:
                incident_lane = "payment_degradation"

            voice_script = str(data.get("voice_script_hinglish", "") or "")

            logger.info(
                "recovery_agent_decision",
                invoice_id=request.invoice_id,
                incident_lane=incident_lane,
                root_cause=root_cause,
                strategy=strategy,
                confidence=confidence,
            )

            return RecoveryDecision(
                incident_lane=incident_lane,  # type: ignore
                root_cause=root_cause,  # type: ignore
                strategy=strategy,  # type: ignore
                confidence=confidence,
                reasoning=str(data.get("reasoning", "") or ""),
                estimated_recovery_probability=recovery_prob,
                recommended_delay_hours=delay_hours,
                stopping_condition=str(data.get("stopping_condition", "") or ""),
                personalization_hint=str(data.get("personalization_hint", "") or ""),
                voice_script_hinglish=voice_script,
            )

        except Exception as e:
            logger.error("recovery_agent_llm_failed", error=str(e), invoice_id=request.invoice_id)
            # Fail-safe: return conservative soft reminder strategy
            return RecoveryDecision(
                root_cause="unknown",
                strategy="soft_reminder",
                confidence=0.3,
                reasoning=f"AI analysis failed, defaulting to soft reminder: {str(e)}",
                estimated_recovery_probability=0.4,
                recommended_delay_hours=24,
                stopping_condition="manual review recommended",
                personalization_hint="Generic follow-up",
            )


recovery_agent = RecoveryAgent()
