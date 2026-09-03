"""
Promise-to-Pay Tracker Agent — extracts payment promises from inbound debtor
emails using LLM, creating structured PTP records for follow-up tracking.
"""
import json
import re
from typing import Optional
from datetime import date, timedelta
from pydantic import BaseModel, Field
from src.prompts.recovery_prompt import PTP_EXTRACT_SYSTEM_PROMPT, PTP_EXTRACT_USER_PROMPT
from src.security import sanitize_input
from src.llm_client import llm_client
from src.api.logging import logger


class PTPExtractRequest(BaseModel):
    invoice_id: str = Field(..., max_length=100)
    invoice_no: str = Field(..., max_length=100)
    client_name: str = Field(..., max_length=200)
    invoice_amount: str = Field(..., max_length=50)
    currency: str = Field(default="INR", max_length=10)
    email_text: str = Field(..., max_length=5000)


class PTPExtractResult(BaseModel):
    has_promise: bool = False
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    promised_date: Optional[str] = None          # YYYY-MM-DD
    promised_amount: Optional[float] = None
    promise_type: str = "none"                   # explicit|partial|conditional|soft|none
    extracted_text: str = ""
    requires_followup_at: Optional[str] = None   # YYYY-MM-DD


class MessageObj:
    def __init__(self, type_str: str, content_str: str):
        self.type = type_str
        self.content = content_str


class PromiseTrackerAgent:
    """
    Extracts and structures payment promises from debtor inbound emails.
    Used to create PTP records that trigger auto-escalation if broken.
    """

    async def extract(self, request: PTPExtractRequest) -> PTPExtractResult:
        """Extract payment promise from inbound email text."""

        clean_email = sanitize_input(request.email_text or "")
        clean_client = sanitize_input(request.client_name or "")
        clean_invoice_no = sanitize_input(request.invoice_no or "")

        user_prompt = PTP_EXTRACT_USER_PROMPT.format(
            invoice_no=clean_invoice_no,
            currency=request.currency,
            invoice_amount=request.invoice_amount,
            client_name=clean_client,
            email_text=clean_email,
        )

        messages = [
            MessageObj("system", PTP_EXTRACT_SYSTEM_PROMPT),
            MessageObj("user", user_prompt),
        ]

        try:
            response = await llm_client.generate(messages, temperature=0.1)
            content = response.content.strip()

            json_match = re.search(r"\{[\s\S]*\}", content)
            json_str = json_match.group(0) if json_match else content
            data = json.loads(json_str)

            has_promise = bool(data.get("has_promise", False))
            confidence = max(0.0, min(1.0, float(data.get("confidence", 0.0))))

            promised_date = data.get("promised_date") or None
            # Validate date format
            if promised_date:
                try:
                    parsed = date.fromisoformat(promised_date)
                    promised_date = parsed.isoformat()
                    # Calculate follow-up date (day after promise)
                    followup = (parsed + timedelta(days=1)).isoformat()
                except (ValueError, TypeError):
                    promised_date = None
                    followup = None
            else:
                followup = None

            promised_amount = None
            raw_amount = data.get("promised_amount")
            if raw_amount is not None:
                try:
                    promised_amount = float(raw_amount)
                except (ValueError, TypeError):
                    promised_amount = None

            valid_types = {"explicit", "partial", "conditional", "soft", "none"}
            promise_type = data.get("promise_type", "none")
            if promise_type not in valid_types:
                promise_type = "none"

            logger.info(
                "ptp_extraction_result",
                invoice_id=request.invoice_id,
                has_promise=has_promise,
                confidence=confidence,
                promise_type=promise_type,
                promised_date=promised_date,
            )

            return PTPExtractResult(
                has_promise=has_promise,
                confidence=confidence,
                promised_date=promised_date,
                promised_amount=promised_amount,
                promise_type=promise_type,
                extracted_text=str(data.get("extracted_text", "") or ""),
                requires_followup_at=followup or data.get("requires_followup_at") or None,
            )

        except Exception as e:
            logger.error(
                "ptp_extraction_failed",
                error=str(e),
                invoice_id=request.invoice_id,
                exc_info=True,
            )
            return PTPExtractResult(
                has_promise=False,
                confidence=0.0,
                extracted_text="",
                promise_type="none",
            )


promise_tracker_agent = PromiseTrackerAgent()
