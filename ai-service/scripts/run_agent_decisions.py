#!/usr/bin/env python3
"""
PayBack-AI — Multi-Agent Batch Decision Runner

Executes the real AI agent decision pipeline:
- RecoveryAgent (src.agents.recovery_agent): Diagnoses incident lane, root cause, and initial strategy.
- PaymentRetryAgent (src.agents.payment_retry_agent): Classifies payment failures & determines retry schedules.
- MandateSequencerAgent (src.agents.mandate_sequencer_agent): Plans time-boxed mandate recovery sequence.

Writes: reports/agent_decisions.json
"""

import sys
import json
import asyncio
from pathlib import Path

# Add ai-service to Python path
SCRIPT_DIR = Path(__file__).resolve().parent
AI_SERVICE_DIR = SCRIPT_DIR.parent
ROOT_DIR = AI_SERVICE_DIR.parent
sys.path.insert(0, str(AI_SERVICE_DIR))

from src.agents.recovery_agent import recovery_agent, RecoveryRequest
from src.agents.payment_retry_agent import payment_retry_agent, PaymentRetryRequest
from src.agents.mandate_sequencer_agent import mandate_sequencer_agent, MandateSequenceRequest


async def run_agent_decisions():
    batch_file = ROOT_DIR / 'reports' / 'simulated_batch.json'
    if not batch_file.exists():
        raise FileNotFoundError(f"Missing simulated batch at {batch_file}")

    with open(batch_file, 'r', encoding='utf-8') as f:
        cases = json.load(f)

    decisions = []
    correct_diagnoses = 0
    total_cases = len(cases)

    lane_counts = {
        'payment_degradation': 0,
        'subscription_rescue': 0,
        'checkout_dropoff': 0,
        'b2b_receivables': 0,
    }

    for case in cases:
        req = RecoveryRequest(
            invoice_id=case['invoice_id'],
            invoice_no=case.get('invoice_no', f"INV-{case['invoice_id']}"),
            client_name=case.get('client_name', 'Customer'),
            invoice_amount=str(case['amount']),
            due_date=case.get('due_date', '2026-08-15'),
            days_overdue=case['days_overdue'],
            retry_count=case.get('retry_count', 0),
            failure_reason=case.get('failure_reason'),
            portal_views=case.get('portal_views', 0),
            has_dispute=case.get('has_dispute', False),
            ptp_broken=case.get('ptp_broken', 0),
        )

        # 1. Execute RecoveryAgent
        rec_decision = await recovery_agent.analyze(req)
        diagnosed_lane = rec_decision.incident_lane

        if diagnosed_lane in lane_counts:
            lane_counts[diagnosed_lane] += 1

        if diagnosed_lane == case['incident_lane']:
            correct_diagnoses += 1

        # 2. Execute PaymentRetryAgent for payment degradation
        retry_dict = None
        if diagnosed_lane == 'payment_degradation':
            retry_req = PaymentRetryRequest(
                invoice_id=case['invoice_id'],
                invoice_no=req.invoice_no,
                client_name=req.client_name,
                invoice_amount=req.invoice_amount,
                due_date=req.due_date,
                days_overdue=req.days_overdue,
                error_code=case.get('error_code'),
                error_description=case.get('failure_reason'),
                retry_count=case.get('retry_count', 0),
                previous_link_sent=False,
            )
            retry_res = await payment_retry_agent.decide(retry_req)
            retry_dict = {
                'should_retry': retry_res.should_retry,
                'failure_classification': retry_res.failure_classification,
                'delay_hours': retry_res.delay_hours,
                'personalized_reason': retry_res.personalized_reason,
            }

        # 3. Execute MandateSequencerAgent for subscription rescue
        mandate_dict = None
        if diagnosed_lane == 'subscription_rescue':
            mandate_req = MandateSequenceRequest(
                invoice_id=case['invoice_id'],
                client_name=req.client_name,
                invoice_amount=req.invoice_amount,
                failure_reason=case.get('failure_reason'),
                previous_failures=case.get('retry_count', 0),
                mandate_status='active',
                communication_count=0,
            )
            mandate_res = await mandate_sequencer_agent.plan(mandate_req)
            mandate_dict = {
                'should_sequence': mandate_res.should_sequence,
                'stop_reason': mandate_res.stop_reason,
                'retry_slots': [s.dict() for s in mandate_res.retry_slots],
                'escalation_after_all_failed': mandate_res.escalation_after_all_failed,
            }

        decisions.append({
            'invoice_id': case['invoice_id'],
            'diagnosed_lane': diagnosed_lane,
            'strategy': rec_decision.strategy,
            'confidence': rec_decision.confidence,
            'root_cause': rec_decision.root_cause,
            'estimated_recovery_probability': rec_decision.estimated_recovery_probability,
            'retry_decision': retry_dict,
            'mandate_plan': mandate_dict,
        })

    accuracy_pct = round((correct_diagnoses / total_cases) * 100, 2)
    output_path = ROOT_DIR / 'reports' / 'agent_decisions.json'
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(decisions, f, indent=2)

    print(f"Executed AI Agents across {total_cases} cases.")
    print(f"Agent Diagnostic Accuracy: {accuracy_pct}% ({correct_diagnoses}/{total_cases} correct lane diagnoses).")
    print(f"Wrote decisions to {output_path}.")
    return decisions


def main():
    asyncio.run(run_agent_decisions())


if __name__ == '__main__':
    main()
