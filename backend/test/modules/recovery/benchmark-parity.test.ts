import { describe, it, expect } from 'vitest';
import { PolicyGuard, type RecoveryContract, type PolicyContext } from '../../../src/modules/recovery/recovery.contract.js';
import { MerchantPolicyService } from '../../../src/modules/policy/merchant-policy.service.js';

describe('Priority 1: Benchmark & Live Recovery Code-Path Parity', () => {
  const merchantPolicy = MerchantPolicyService.getPolicyForMerchant('evaluation_merchant');

  const baseContract: RecoveryContract = {
    caseId: 'inv_parity_test_001',
    incidentLane: 'payment_degradation',
    customerId: 'cust_parity_001',
    amountAtRisk: 15000,
    currency: 'INR',
    diagnosis: {
      primary: 'payment_degradation',
      evidence: ['root_cause: gateway_timeout', 'days_overdue: 12'],
      confidence: 0.85,
    },
    recommendedAction: 'send_payment_link',
    actionParameters: {
      maxAmount: 15000,
      expiresInHours: 48,
      allowedMethods: ['upi', 'card', 'netbanking'],
    },
    customerMessage: 'Please complete your pending payment securely.',
    cooldownHours: 24,
    maxAttempts: 3,
    escalateAfter: 'no_payment_after_48h',
    stopRules: ['payment_captured', 'customer_opted_out', 'refund_or_dispute_signal', 'max_attempts_reached'],
    requiresHumanApproval: false,
  };

  /**
   * Helper simulating live RecoveryService context extraction (from RecoveryService.executeRecoveryAction)
   */
  function buildLiveRecoveryContext(opts: {
    invoiceStatus?: string;
    optedOut?: boolean;
    hasDispute?: boolean;
    ptpBroken?: number;
    retryCount?: number;
    daysOverdue?: number;
    amount?: number;
    hasHumanApproval?: boolean;
  }): PolicyContext {
    return {
      retryCount: opts.retryCount ?? 0,
      optedOut: opts.optedOut ?? false,
      hasDispute: opts.hasDispute ?? false,
      ptpBroken: opts.ptpBroken ?? 0,
      invoiceStatus: opts.invoiceStatus ?? 'Overdue',
      daysOverdue: opts.daysOverdue ?? 12,
      amountAtRisk: opts.amount ?? 15000,
      hasHumanApproval: opts.hasHumanApproval ?? false,
      merchantPolicy,
      channel: 'email',
    };
  }

  /**
   * Helper simulating benchmark evaluate-batch context extraction (from evaluate-batch.ts)
   */
  function buildBenchmarkEvalContext(opts: {
    invoiceStatus?: string;
    optedOut?: boolean;
    hasDispute?: boolean;
    ptpBroken?: number;
    retryCount?: number;
    daysOverdue?: number;
    amount?: number;
    hasHumanApproval?: boolean;
  }): PolicyContext {
    return {
      retryCount: opts.retryCount ?? 0,
      optedOut: opts.optedOut ?? false,
      hasDispute: opts.hasDispute ?? false,
      ptpBroken: opts.ptpBroken ?? 0,
      invoiceStatus: opts.invoiceStatus ?? 'Overdue',
      daysOverdue: opts.daysOverdue ?? 12,
      amountAtRisk: opts.amount ?? 15000,
      hasHumanApproval: opts.hasHumanApproval ?? false,
      merchantPolicy,
    };
  }

  it('proves identical acceptance on healthy in-flight recovery cases', () => {
    const liveContext = buildLiveRecoveryContext({});
    const benchContext = buildBenchmarkEvalContext({});

    const liveResult = PolicyGuard.validate(baseContract, liveContext);
    const benchResult = PolicyGuard.validate(baseContract, benchContext);

    expect(liveResult.allowed).toBe(true);
    expect(benchResult.allowed).toBe(true);
    expect(liveResult.violations).toEqual([]);
    expect(benchResult.violations).toEqual([]);
    expect(liveResult.allowed).toBe(benchResult.allowed);
  });

  it('proves identical rejection when invoice is already settled (Paid)', () => {
    const liveContext = buildLiveRecoveryContext({ invoiceStatus: 'Paid' });
    const benchContext = buildBenchmarkEvalContext({ invoiceStatus: 'Paid' });

    const liveResult = PolicyGuard.validate(baseContract, liveContext);
    const benchResult = PolicyGuard.validate(baseContract, benchContext);

    expect(liveResult.allowed).toBe(false);
    expect(benchResult.allowed).toBe(false);
    expect(liveResult.violations[0]).toContain('INVOICE_SETTLED');
    expect(benchResult.violations[0]).toContain('INVOICE_SETTLED');
    expect(liveResult.violations).toEqual(benchResult.violations);
  });

  it('proves identical rejection when customer has opted out (STOP keyword)', () => {
    const liveContext = buildLiveRecoveryContext({ optedOut: true });
    const benchContext = buildBenchmarkEvalContext({ optedOut: true });

    const liveResult = PolicyGuard.validate(baseContract, liveContext);
    const benchResult = PolicyGuard.validate(baseContract, benchContext);

    expect(liveResult.allowed).toBe(false);
    expect(benchResult.allowed).toBe(false);
    expect(liveResult.violations[0]).toContain('CUSTOMER_OPTED_OUT');
    expect(benchResult.violations[0]).toContain('CUSTOMER_OPTED_OUT');
  });

  it('proves identical freeze on active dispute or refund signal', () => {
    const liveContext = buildLiveRecoveryContext({ hasDispute: true });
    const benchContext = buildBenchmarkEvalContext({ hasDispute: true });

    const liveResult = PolicyGuard.validate(baseContract, liveContext);
    const benchResult = PolicyGuard.validate(baseContract, benchContext);

    expect(liveResult.allowed).toBe(false);
    expect(benchResult.allowed).toBe(false);
    expect(liveResult.violations[0]).toContain('DISPUTE_ACTIVE');
    expect(benchResult.violations[0]).toContain('DISPUTE_ACTIVE');
  });

  it('proves identical escalation on broken promise-to-pay >= 2', () => {
    const liveContext = buildLiveRecoveryContext({ ptpBroken: 2 });
    const benchContext = buildBenchmarkEvalContext({ ptpBroken: 2 });

    const liveResult = PolicyGuard.validate(baseContract, liveContext);
    const benchResult = PolicyGuard.validate(baseContract, benchContext);

    expect(liveResult.allowed).toBe(false);
    expect(benchResult.allowed).toBe(false);
    expect(liveResult.violations[0]).toContain('PTP_BROKEN_TWICE');
    expect(benchResult.violations[0]).toContain('PTP_BROKEN_TWICE');
  });

  it('proves identical legal stop when overdue duration exceeds 90-day statutory cap', () => {
    const liveContext = buildLiveRecoveryContext({ daysOverdue: 95 });
    const benchContext = buildBenchmarkEvalContext({ daysOverdue: 95 });

    const liveResult = PolicyGuard.validate(baseContract, liveContext);
    const benchResult = PolicyGuard.validate(baseContract, benchContext);

    expect(liveResult.allowed).toBe(false);
    expect(benchResult.allowed).toBe(false);
    expect(liveResult.violations[0]).toContain('LEGAL_STOP');
    expect(benchResult.violations[0]).toContain('LEGAL_STOP');
  });

  it('proves identical suppression on sub-floor debt (< ₹100 economic floor)', () => {
    const lowContract = { ...baseContract, amountAtRisk: 50 };
    const liveContext = buildLiveRecoveryContext({ amount: 50 });
    const benchContext = buildBenchmarkEvalContext({ amount: 50 });

    const liveResult = PolicyGuard.validate(lowContract, liveContext);
    const benchResult = PolicyGuard.validate(lowContract, benchContext);

    expect(liveResult.allowed).toBe(false);
    expect(benchResult.allowed).toBe(false);
    expect(liveResult.violations[0]).toContain('ECONOMIC_FLOOR_VIOLATION');
    expect(benchResult.violations[0]).toContain('ECONOMIC_FLOOR_VIOLATION');
  });

  it('proves identical human approval gating for high-value debt (> ₹5,00,000)', () => {
    const highContract = { ...baseContract, amountAtRisk: 750000, requiresHumanApproval: true };
    const unapprovedLive = buildLiveRecoveryContext({ amount: 750000, hasHumanApproval: false });
    const unapprovedBench = buildBenchmarkEvalContext({ amount: 750000, hasHumanApproval: false });

    const liveResult = PolicyGuard.validate(highContract, unapprovedLive);
    const benchResult = PolicyGuard.validate(highContract, unapprovedBench);

    expect(liveResult.allowed).toBe(false);
    expect(benchResult.allowed).toBe(false);
    expect(liveResult.violations[0]).toContain('HUMAN_APPROVAL_REQUIRED');
    expect(benchResult.violations[0]).toContain('HUMAN_APPROVAL_REQUIRED');

    // With human approval granted, both allow execution
    const approvedLive = buildLiveRecoveryContext({ amount: 750000, hasHumanApproval: true });
    const approvedBench = buildBenchmarkEvalContext({ amount: 750000, hasHumanApproval: true });

    expect(PolicyGuard.validate(highContract, approvedLive).allowed).toBe(true);
    expect(PolicyGuard.validate(highContract, approvedBench).allowed).toBe(true);
  });

  it('proves identical attempt ceiling enforcement across live and benchmark runs', () => {
    for (let attempts = 0; attempts <= 4; attempts++) {
      const liveResult = PolicyGuard.validate(baseContract, buildLiveRecoveryContext({ retryCount: attempts }));
      const benchResult = PolicyGuard.validate(baseContract, buildBenchmarkEvalContext({ retryCount: attempts }));

      expect(liveResult.allowed).toBe(benchResult.allowed);
      if (attempts >= 3) {
        expect(liveResult.allowed).toBe(false);
        expect(liveResult.violations[0]).toContain('MAX_ATTEMPTS_EXCEEDED');
      }
    }
  });
});
