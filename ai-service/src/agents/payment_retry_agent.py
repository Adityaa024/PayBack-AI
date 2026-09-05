"""
Payment Retry Agent — classifies Razorpay payment failures and generates
personalized outreach with a fresh payment link for each retry attempt.
"""
import json
import re
from typing import Optional, Literal
from pydantic import BaseModel, Field
from src.prompts.recovery_prompt import PAYMENT_RETRY_SYSTEM_PROMPT, PAYMENT_RETRY_USER_PROMPT
from src.security import sanitize_input
from src.llm_client import llm_client
from src.api.logging import logger


class PaymentRetryRequest(BaseModel):
    invoice_id: str = Field(..., max_length=100)
    invoice_no: str = Field(..., max_length=100)
    client_name: str = Field(..., max_length=200)
    invoice_amount: str = Field(..., max_length=50)
    currency: str = Field(default="INR", max_length=10)
    due_date: str = Field(..., max_length=50)
    days_overdue: int = Field(default=0)
    error_code: Optional[str] = Field(default=None, max_length=100)
    error_description: Optional[str] = Field(default=None, max_length=500)
    retry_count: int = Field(default=0)
    previous_link_sent: bool = Field(default=False)


class PaymentRetryDecision(BaseModel):
    should_retry: bool = True
    failure_classification: Literal[
        "technical_decline",
        "insufficient_funds",
        "expired_card",
        "network_error",
        "user_cancelled",
        "unknown",
    ] = "unknown"
    delay_hours: int = Field(default=24)
    email_subject: str = ""
    email_body: str = ""
    personalized_reason: str = ""


class MessageObj:
    def __init__(self, type_str: str, content_str: str):
        self.type = type_str
        self.content = content_str


class PaymentRetryAgent:
    """
    Handles failed Razorpay payment classification and retry decision-making.
    Generates personalized outreach for each retry attempt with tone escalation.
    """

    MAX_AUTO_RETRIES = 3

    def _decide_heuristic(self, request: PaymentRetryRequest) -> PaymentRetryDecision:
        clean_code = (request.error_code or "").upper()
        clean_desc = (request.error_description or "").lower()
        clean_invoice_no = sanitize_input(request.invoice_no or "")
        clean_client = sanitize_input(request.client_name or "")

        if "TIMEOUT" in clean_code or "GATEWAY" in clean_code or "network" in clean_desc or "timeout" in clean_desc:
            classification = "network_error"
            delay_hours = 2
            should_retry = True
            reason = "Temporary network / gateway timeout. Retrying payment link after cooldown."
        elif "INSUFFICIENT" in clean_code or "funds" in clean_desc:
            classification = "insufficient_funds"
            delay_hours = 48
            should_retry = True
            reason = "Customer account had insufficient funds. Scheduling retry at next billing window."
        elif "EXPIRED" in clean_code or "expired" in clean_desc:
            classification = "expired_card"
            delay_hours = 0
            should_retry = False
            reason = "Card on file has expired. Customer must enter new payment method details."
        elif "CANCELLED" in clean_code or "abandoned" in clean_desc:
            classification = "user_cancelled"
            delay_hours = 24
            should_retry = True
            reason = "User cancelled transaction before authorization. Sending reminder."
        else:
            classification = "technical_decline"
            delay_hours = 12
            should_retry = True
            reason = "Technical payment decline from issuing bank."

        return PaymentRetryDecision(
            should_retry=should_retry,
            failure_classification=classification,  # type: ignore
            delay_hours=delay_hours,
            email_subject=f"Update regarding payment for Invoice #{clean_invoice_no}",
            email_body=(
                f"Dear {clean_client},\n\nYour payment for invoice #{clean_invoice_no} was not completed: {reason}\n"
                f"Please use your secure link to retry:\n[PAYMENT_LINK]\n\nBest regards,\nAccounts Team"
            ),
            personalized_reason=reason,
        )

    async def decide(self, request: PaymentRetryRequest) -> PaymentRetryDecision:
        """Classify failure and generate personalized retry outreach."""

        # Hard stop: no more auto-retries after threshold
        if request.retry_count >= self.MAX_AUTO_RETRIES:
            logger.info(
                "payment_retry_max_reached",
                invoice_id=request.invoice_id,
                retry_count=request.retry_count,
            )
            return PaymentRetryDecision(
                should_retry=False,
                failure_classification="unknown",
                delay_hours=0,
                email_subject="",
                email_body="",
                personalized_reason=f"Max retry attempts ({self.MAX_AUTO_RETRIES}) exhausted. Manual review required.",
            )

        # If LLM API key is not configured or in offline mode, use expert diagnostic reasoning
        from src.api.config import settings
        if not (settings.LLM_API_KEY or "").strip():
            return self._decide_heuristic(request)

        # Sanitize inputs
        clean_client = sanitize_input(request.client_name or "")
        clean_invoice_no = sanitize_input(request.invoice_no or "")
        clean_error_code = sanitize_input(request.error_code or "N/A")
        clean_error_desc = sanitize_input(request.error_description or "Payment was not completed")

        user_prompt = PAYMENT_RETRY_USER_PROMPT.format(
            invoice_no=clean_invoice_no,
            client_name=clean_client,
            currency=request.currency,
            invoice_amount=request.invoice_amount,
            due_date=request.due_date,
            days_overdue=request.days_overdue,
            error_code=clean_error_code,
            error_description=clean_error_desc,
            retry_count=request.retry_count,
            previous_link_sent=request.previous_link_sent,
        )

        messages = [
            MessageObj("system", PAYMENT_RETRY_SYSTEM_PROMPT),
            MessageObj("user", user_prompt),
        ]

        try:
            response = await llm_client.generate(messages, temperature=0.3)
            content = response.content.strip()

            json_match = re.search(r"\{[\s\S]*\}", content)
            json_str = json_match.group(0) if json_match else content
            data = json.loads(json_str)

            valid_classifications = {
                "technical_decline", "insufficient_funds", "expired_card",
                "network_error", "user_cancelled", "unknown"
            }
            classification = data.get("failure_classification", "unknown")
            if classification not in valid_classifications:
                classification = "unknown"

            should_retry = bool(data.get("should_retry", True))
            delay_hours = max(0, int(data.get("delay_hours", 24)))

            logger.info(
                "payment_retry_decision",
                invoice_id=request.invoice_id,
                classification=classification,
                should_retry=should_retry,
                delay_hours=delay_hours,
            )

            return PaymentRetryDecision(
                should_retry=should_retry,
                failure_classification=classification,  # type: ignore
                delay_hours=delay_hours,
                email_subject=str(data.get("email_subject", "") or ""),
                email_body=str(data.get("email_body", "") or ""),
                personalized_reason=str(data.get("personalized_reason", "") or ""),
            )

        except Exception as e:
            logger.warning(
                "payment_retry_agent_llm_failed_falling_back_to_heuristic",
                error=str(e),
                invoice_id=request.invoice_id,
            )
            return self._decide_heuristic(request)


payment_retry_agent = PaymentRetryAgent()
