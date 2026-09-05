"""
Mandate Retry Sequencer Agent — plans the Razorpay mandate/subscription
retry sequence with time-boxed slots and hard stopping rules at 3 failures.
"""
import json
import re
from typing import Optional, List
from pydantic import BaseModel, Field
from src.prompts.recovery_prompt import MANDATE_SEQUENCER_SYSTEM_PROMPT, MANDATE_SEQUENCER_USER_PROMPT
from src.security import sanitize_input
from src.llm_client import llm_client
from src.api.logging import logger


class MandateSequenceRequest(BaseModel):
    invoice_id: str = Field(..., max_length=100)
    client_name: str = Field(..., max_length=200)
    invoice_amount: str = Field(..., max_length=50)
    currency: str = Field(default="INR", max_length=10)
    failure_reason: Optional[str] = Field(default=None, max_length=500)
    previous_failures: int = Field(default=0)
    mandate_status: str = Field(default="active", max_length=50)
    communication_count: int = Field(default=0)


class RetrySlot(BaseModel):
    attempt: int
    delay_hours: int
    notify_customer: bool = True
    message_tone: str = "warm"


class MandateRetryPlan(BaseModel):
    should_sequence: bool = True
    stop_reason: Optional[str] = None
    retry_slots: List[RetrySlot] = []
    escalation_after_all_failed: str = "human_review"
    reasoning: str = ""


class MessageObj:
    def __init__(self, type_str: str, content_str: str):
        self.type = type_str
        self.content = content_str


class MandateSequencerAgent:
    """
    Plans the mandate retry sequence with compliant stopping rules.
    Hard cap: 3 retry attempts maximum.
    """

    MAX_MANDATE_RETRIES = 3
    # Default retry schedule if LLM fails: T+24h, T+72h, T+168h (1 week)
    DEFAULT_RETRY_SLOTS = [
        RetrySlot(attempt=1, delay_hours=24, notify_customer=True, message_tone="warm"),
        RetrySlot(attempt=2, delay_hours=72, notify_customer=True, message_tone="firm"),
        RetrySlot(attempt=3, delay_hours=168, notify_customer=True, message_tone="serious"),
    ]

    async def plan(self, request: MandateSequenceRequest) -> MandateRetryPlan:
        """Generate the mandate retry plan."""

        # Hard stop if already at max failures
        if request.previous_failures >= self.MAX_MANDATE_RETRIES:
            logger.info(
                "mandate_sequencer_hard_stop",
                invoice_id=request.invoice_id,
                previous_failures=request.previous_failures,
            )
            return MandateRetryPlan(
                should_sequence=False,
                stop_reason=f"Maximum mandate retries ({self.MAX_MANDATE_RETRIES}) already exhausted",
                retry_slots=[],
                escalation_after_all_failed="human_review",
                reasoning="Hard stop: maximum retries reached. Escalating to human review.",
            )

        if request.mandate_status == "cancelled":
            return MandateRetryPlan(
                should_sequence=False,
                stop_reason="Mandate has been cancelled by customer",
                retry_slots=[],
                escalation_after_all_failed="legal_review",
                reasoning="Mandate cancelled. No automated retries possible.",
            )

        # Only plan remaining slots
        remaining_attempts = self.MAX_MANDATE_RETRIES - request.previous_failures

        # If LLM API key is not configured or in offline mode, use expert sequence reasoning
        from src.api.config import settings
        if not (settings.LLM_API_KEY or "").strip():
            return MandateRetryPlan(
                should_sequence=True,
                stop_reason=None,
                retry_slots=self.DEFAULT_RETRY_SLOTS[:remaining_attempts],
                escalation_after_all_failed="human_review",
                reasoning="Automated mandate recovery sequence configured with graduated tone escalation (warm -> firm -> serious).",
            )

        clean_client = sanitize_input(request.client_name or "")
        clean_failure_reason = sanitize_input(request.failure_reason or "Unknown")

        user_prompt = MANDATE_SEQUENCER_USER_PROMPT.format(
            invoice_id=request.invoice_id,
            client_name=clean_client,
            currency=request.currency,
            invoice_amount=request.invoice_amount,
            failure_reason=clean_failure_reason,
            previous_failures=request.previous_failures,
            mandate_status=request.mandate_status,
            communication_count=request.communication_count,
        )

        messages = [
            MessageObj("system", MANDATE_SEQUENCER_SYSTEM_PROMPT),
            MessageObj("user", user_prompt),
        ]

        try:
            response = await llm_client.generate(messages, temperature=0.15)
            content = response.content.strip()

            json_match = re.search(r"\{[\s\S]*\}", content)
            json_str = json_match.group(0) if json_match else content
            data = json.loads(json_str)

            should_sequence = bool(data.get("should_sequence", True))
            stop_reason = data.get("stop_reason") or None

            retry_slots = []
            for slot in data.get("retry_slots", [])[:remaining_attempts]:
                retry_slots.append(RetrySlot(
                    attempt=int(slot.get("attempt", 1)),
                    delay_hours=max(24, int(slot.get("delay_hours", 24))),
                    notify_customer=bool(slot.get("notify_customer", True)),
                    message_tone=str(slot.get("message_tone", "warm")),
                ))

            logger.info(
                "mandate_sequencer_plan",
                invoice_id=request.invoice_id,
                should_sequence=should_sequence,
                slots_planned=len(retry_slots),
            )

            return MandateRetryPlan(
                should_sequence=should_sequence,
                stop_reason=stop_reason,
                retry_slots=retry_slots,
                escalation_after_all_failed=str(data.get("escalation_after_all_failed", "human_review")),
                reasoning=str(data.get("reasoning", "") or ""),
            )

        except Exception as e:
            logger.error(
                "mandate_sequencer_failed",
                error=str(e),
                invoice_id=request.invoice_id,
                exc_info=True,
            )
            # Return default safe sequence using remaining slots
            return MandateRetryPlan(
                should_sequence=True,
                stop_reason=None,
                retry_slots=self.DEFAULT_RETRY_SLOTS[:remaining_attempts],
                escalation_after_all_failed="human_review",
                reasoning=f"Default sequence applied due to AI error: {str(e)}",
            )


mandate_sequencer_agent = MandateSequencerAgent()
