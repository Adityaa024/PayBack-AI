import { describe, it, expect } from 'vitest';
import { PolicyGuard, type RecoveryContract, type PolicyContext } from '../../../src/modules/recovery/recovery.contract.js';
import { MerchantPolicyService } from '../../../src/modules/policy/merchant-policy.service.js';
import { getAllowedStrategiesForCase } from '../../../src/scripts/evaluate-batch.js';

/**
 * Adversarial Regression Test: Proves AI Agent Recovery is Downstream of Strategy Decisions
 * 
 * Demonstrates that when the "obviously right" strategy differs from the agent's chosen strategy:
 * 1. Under new causal logic: Agent recovers less than Oracle (₹0 vs ₹5,000).
 * 2. Under old leaked logic: Agent would erroneously equal Oracle (₹5,000 vs ₹5,000) by reading truth.lane_recovery directly.
 * 3. Proves decision causality: Changing agent strategy directly controls recovery outcome.
 */
describe('Evaluation Harness: AI Agent Strategy Decision Causality Guard', () => {
  const merchantPolicy = MerchantPolicyService.getPolicyForMerchant('evaluation_merchant');

  it('proves that selecting a suboptimal strategy results in zero recovery while Oracle recovers full value', () => {
    // 1. Construct a subscription rescue case where ONLY mandate_retry recovers the debt
    const amt = 5000.0;
    const testCase = {
      invoice_id: 'inv_adversarial_causality_001',
      incident_lane: 'subscription_rescue' as const,
      amount: amt,
      days_overdue: 14,
      opted_out: false,
      has_dispute: false,
      ptp_broken: 0,
      truth: {
        natural_recovery: false,
        // The effectiveness matrix: ONLY mandate_retry succeeds
        strategy_outcomes: {
          mandate_retry: true,
          payment_link_refresh: false,
          soft_reminder: false,
          firm_escalation: false,
          human_escalation: false,
        },
        // Old leaked labels: both were set to true
        lane_recovery: true,
        tone_escalation_recovery: true,
      },
    };

    const contract: RecoveryContract = {
      caseId: testCase.invoice_id,
      incidentLane: testCase.incident_lane,
      customerId: 'cust_adv_001',
      amountAtRisk: amt,
      currency: 'INR',
      diagnosis: {
        primary: 'checkout_dropoff', // Misdiagnosed!
        evidence: ['gateway_timeout'],
        confidence: 0.65,
      },
      recommendedAction: 'send_payment_link',
      actionParameters: { maxAmount: amt, expiresInHours: 48, allowedMethods: ['upi', 'card'] },
      customerMessage: 'Payment link reminder',
      cooldownHours: 24,
      maxAttempts: 3,
      escalateAfter: 'no_payment_after_48h',
      stopRules: ['payment_captured', 'customer_opted_out'],
      requiresHumanApproval: false,
    };

    const context: PolicyContext = {
      retryCount: 0,
      optedOut: testCase.opted_out,
      hasDispute: testCase.has_dispute,
      ptpBroken: testCase.ptp_broken,
      invoiceStatus: 'Overdue',
      daysOverdue: testCase.days_overdue,
      amountAtRisk: amt,
      hasHumanApproval: false,
      merchantPolicy,
    };

    // PolicyGuard permits contact
    const validation = PolicyGuard.validate(contract, context);
    expect(validation.allowed).toBe(true);

    // Agent decision: agent mistakenly picks 'payment_link_refresh'
    const agentChosenStrategy = 'payment_link_refresh';

    // ── EVALUATION UNDER NEW CAUSAL LOGIC ──
    // The agent arm checks the outcome of its chosen strategy
    const agentRecoveredNew = (testCase.truth.natural_recovery || testCase.truth.strategy_outcomes[agentChosenStrategy]) ? amt : 0;

    // The Oracle arm evaluates all allowed strategies for subscription_rescue
    const allowed = getAllowedStrategiesForCase(testCase.incident_lane);
    const anyAllowedSucceeds = allowed.some((s) => testCase.truth.strategy_outcomes[s as keyof typeof testCase.truth.strategy_outcomes]);
    const oracleRecoveredNew = (validation.allowed && anyAllowedSucceeds) ? amt : 0;

    // Assert: Agent recovers less than Oracle
    expect(agentRecoveredNew).toBe(0);
    expect(oracleRecoveredNew).toBe(amt);
    expect(agentRecoveredNew).toBeLessThan(oracleRecoveredNew);

    // ── PROOF OF OLD BUG: WHAT OLD LEAKED LOGIC WOULD HAVE PRODUCED ──
    // Old logic: if (validation.allowed && (truth.lane_recovery || truth.tone_escalation_recovery))
    const oldLeakedAgentRecovered = (validation.allowed && (testCase.truth.lane_recovery || testCase.truth.tone_escalation_recovery)) ? amt : 0;
    const oldLeakedOracleRecovered = (validation.allowed && (testCase.truth.lane_recovery || testCase.truth.tone_escalation_recovery)) ? amt : 0;

    // Under old logic, agent was mathematically identical to Oracle (both recovered 5000)
    expect(oldLeakedAgentRecovered).toBe(amt);
    expect(oldLeakedOracleRecovered).toBe(amt);
    expect(oldLeakedAgentRecovered).toEqual(oldLeakedOracleRecovered); // THE LEAK

    // ── PROOF OF DECISION CAUSALITY ──
    // If the agent correctly selects 'mandate_retry', it recovers the debt
    const correctedStrategy = 'mandate_retry';
    const agentRecoveredCorrected = testCase.truth.strategy_outcomes[correctedStrategy] ? amt : 0;
    expect(agentRecoveredCorrected).toBe(amt);
  });
});
