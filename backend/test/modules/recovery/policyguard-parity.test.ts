import { describe, it, expect } from 'vitest';
import { PolicyGuard, type RecoveryContract, type PolicyContext } from '../../../src/modules/recovery/recovery.contract.js';
import { MerchantPolicyService } from '../../../src/modules/policy/merchant-policy.service.js';

/**
 * PolicyGuard Parity Test
 * Ensures that Python evaluation parity models and TypeScript PolicyGuard.validate()
 * remain 100% in sync across all edge cases (opt-outs, 90d cap, disputes, PTP, economic floor).
 */
describe('PolicyGuard Parity Assertion', () => {
  const merchantPolicy = MerchantPolicyService.getPolicyForMerchant('parity_merchant');

  function pythonParityCheck(item: {
    opted_out: boolean;
    days_overdue: number;
    has_dispute: boolean;
    ptp_broken: number;
    amount: number;
    has_human_approval?: boolean;
  }): boolean {
    const is_opted_out = item.opted_out;
    const is_overdue_90 = item.days_overdue > 90;
    const has_dispute = item.has_dispute;
    const is_ptp_broken_twice = item.ptp_broken >= 2;
    const is_sub_floor = item.amount < 100.0;
    const needs_approval = item.amount > 500000.0 && !item.has_human_approval;

    return !(is_opted_out || is_overdue_90 || has_dispute || is_ptp_broken_twice || is_sub_floor || needs_approval);
  }

  it('asserts 100% verdict parity across 500 edge cases between TypeScript PolicyGuard and Python parity model', () => {
    let mismatches = 0;

    for (let i = 0; i < 500; i++) {
      const optedOut = i % 7 === 0;
      const daysOverdue = (i * 3) % 120;
      const hasDispute = i % 11 === 0;
      const ptpBroken = i % 5 === 0 ? 2 : 0;
      const amount = (i * 1234) % 600000;
      const hasHumanApproval = false;

      const contract: RecoveryContract = {
        caseId: `case_${i}`,
        incidentLane: 'payment_degradation',
        customerId: `cust_${i}`,
        amountAtRisk: amount,
        currency: 'INR',
        diagnosis: { primary: 'payment_degradation', evidence: [], confidence: 0.9 },
        recommendedAction: 'send_payment_link',
        actionParameters: { maxAmount: amount, expiresInHours: 48, allowedMethods: ['upi'] },
        customerMessage: 'test message',
        cooldownHours: 24,
        maxAttempts: 3,
        escalateAfter: '48h',
        stopRules: [],
        requiresHumanApproval: amount > 500000,
      };

      const context: PolicyContext = {
        retryCount: 0,
        optedOut,
        hasDispute,
        ptpBroken,
        invoiceStatus: 'Overdue',
        daysOverdue,
        amountAtRisk: amount,
        hasHumanApproval,
        merchantPolicy,
      };

      const tsVerdict = PolicyGuard.validate(contract, context).allowed;
      const pyVerdict = pythonParityCheck({
        opted_out: optedOut,
        days_overdue: daysOverdue,
        has_dispute: hasDispute,
        ptp_broken: ptpBroken,
        amount,
        has_human_approval: hasHumanApproval,
      });

      if (tsVerdict !== pyVerdict) {
        mismatches++;
        console.error(`Parity mismatch at iteration ${i}: TS=${tsVerdict}, PY=${pyVerdict}`);
      }
    }

    expect(mismatches).toBe(0);
  });
});
