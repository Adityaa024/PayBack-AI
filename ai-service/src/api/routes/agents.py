from fastapi import APIRouter
from src.agents.dispute_agent import (
    DisputeRequest, DisputeResponse, DisputeAgent,
    DisputeDraftRequest, DisputeDraftResponse
)
from src.agents.summary_agent import SummaryRequest, SummaryResponse, SummaryAgent
from src.agents.recovery_agent import RecoveryRequest, RecoveryDecision, recovery_agent
from src.agents.payment_retry_agent import PaymentRetryRequest, PaymentRetryDecision, payment_retry_agent
from src.agents.mandate_sequencer_agent import MandateSequenceRequest, MandateRetryPlan, mandate_sequencer_agent
from src.agents.promise_tracker_agent import PTPExtractRequest, PTPExtractResult, promise_tracker_agent

router = APIRouter(prefix="/agents", tags=["Agents"])

dispute_agent = DisputeAgent()
summary_agent = SummaryAgent()


# ──────────────────────────────────────────────────────────────
# Existing endpoints
# ──────────────────────────────────────────────────────────────

@router.post("/dispute", response_model=DisputeResponse)
async def handle_dispute(request: DisputeRequest):
    return await dispute_agent.handle(request)


@router.post("/dispute/draft", response_model=DisputeDraftResponse)
async def handle_dispute_draft(request: DisputeDraftRequest):
    return await dispute_agent.generate_draft(request)


@router.post("/summarize", response_model=SummaryResponse)
async def handle_summarize(request: SummaryRequest):
    return await summary_agent.summarize(request)


# ──────────────────────────────────────────────────────────────
# AI Revenue Recovery endpoints
# ──────────────────────────────────────────────────────────────

@router.post("/recovery", response_model=RecoveryDecision, summary="Analyze at-risk invoice and select recovery strategy")
async def handle_recovery(request: RecoveryRequest):
    """
    Analyzes an at-risk invoice, applies hard stopping rules, and returns
    the optimal AI-driven recovery strategy with confidence score.
    """
    return await recovery_agent.analyze(request)


@router.post("/payment-retry", response_model=PaymentRetryDecision, summary="Classify payment failure and plan retry outreach")
async def handle_payment_retry(request: PaymentRetryRequest):
    """
    Classifies a Razorpay payment failure, determines if retry is appropriate,
    and generates personalized recovery email with tone matched to attempt number.
    """
    return await payment_retry_agent.decide(request)


@router.post("/mandate-sequence", response_model=MandateRetryPlan, summary="Plan mandate retry sequence")
async def handle_mandate_sequence(request: MandateSequenceRequest):
    """
    Plans a time-boxed Razorpay mandate retry sequence with hard cap at 3 attempts.
    Returns timestamped retry slots with escalation path.
    """
    return await mandate_sequencer_agent.plan(request)


@router.post("/promise-extract", response_model=PTPExtractResult, summary="Extract payment promise from inbound email")
async def handle_promise_extract(request: PTPExtractRequest):
    """
    Extracts promise-to-pay signals from debtor inbound email text.
    Returns promised date, amount, and required follow-up date.
    """
    return await promise_tracker_agent.extract(request)
