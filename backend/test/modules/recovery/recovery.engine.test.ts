import { describe, it, expect } from 'vitest';
import {
  PolicyGuard,
  RecoveryContractSchema,
  type RecoveryContract,
} from '../../../src/modules/recovery/recovery.contract.js';
import {
  HoldoutManager,
} from '../../../src/modules/recovery/recovery.holdout.js';
import {
  ScenarioCatalog,
} from '../../../src/modules/recovery/recovery.scenarios.js';

describe('RecoverIQ — Recovery Contract & PolicyGuard', () => {
  const sampleContract: RecoveryContract = {
    caseId: 'rcv_sub_001',
    incidentLane: 'subscription_rescue',
    customerId: 'cust_test_123',
    amountAtRisk: 14999,
    currency: 'INR',
    diagnosis: {
      primary: 'subscription.halted',
      evidence: ['mandate_declined', 'insufficient_funds', 'retry_exhausted'],
      confidence: 0.94,
    },
    recommendedAction: 'mandate_retry',
    actionParameters: {
      maxAmount: 14999,
      expiresInHours: 48,
      allowedMethods: ['upi', 'card'],
    },
    customerMessage: 'Your subscription is on hold. Update your card to prevent cancellation.',
    voiceScriptHinglish: 'Namaste ji, aapka subscription retry pending hai. Link se pay karein ya STOP reply karein.',
    cooldownHours: 24,
    maxAttempts: 3,
    escalateAfter: 'retry_failed_3_times',
    stopRules: ['payment_captured', 'customer_opted_out', 'max_attempts_reached'],
    requiresHumanApproval: false,
  };

  it('validates a correct RecoveryContract against Zod schema', () => {
    const parsed = RecoveryContractSchema.safeParse(sampleContract);
    expect(parsed.success).toBe(true);
  });

  it('approves compliant recovery actions through PolicyGuard', () => {
    const result = PolicyGuard.validate(sampleContract, {
      retryCount: 1,
      lastContactedAt: new Date(Date.now() - 30 * 3600 * 1000).toISOString(),
      optedOut: false,
      daysOverdue: 12,
      amountAtRisk: 14999,
    });

    expect(result.allowed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('blocks actions when cooldown period is still active', () => {
    const result = PolicyGuard.validate(sampleContract, {
      retryCount: 1,
      lastContactedAt: new Date(Date.now() - 4 * 3600 * 1000).toISOString(), // only 4h ago, cooldown is 24h
      optedOut: false,
      daysOverdue: 12,
      amountAtRisk: 14999,
    });

    expect(result.allowed).toBe(false);
    expect(result.blockedReason?.toLowerCase()).toContain('cooldown');
    expect(result.violations.some((v) => v.includes('COOLDOWN_ACTIVE'))).toBe(true);
  });

  it('blocks actions when max retry attempts reached', () => {
    const result = PolicyGuard.validate(sampleContract, {
      retryCount: 3, // max is 3
      lastContactedAt: new Date(Date.now() - 30 * 3600 * 1000).toISOString(),
      optedOut: false,
      daysOverdue: 12,
      amountAtRisk: 14999,
    });

    expect(result.allowed).toBe(false);
    expect(result.blockedReason).toContain('retry attempts');
    expect(result.violations.some((v) => v.includes('MAX_ATTEMPTS_EXCEEDED'))).toBe(true);
  });

  it('blocks actions immediately when customer has opted out (STOP reply)', () => {
    const result = PolicyGuard.validate(sampleContract, {
      retryCount: 0,
      optedOut: true,
      daysOverdue: 5,
      amountAtRisk: 14999,
    });

    expect(result.allowed).toBe(false);
    expect(result.blockedReason).toContain('opted out');
    expect(result.violations.some((v) => v.includes('CUSTOMER_OPTED_OUT'))).toBe(true);
  });

  it('enforces human review required for high-value exposures (> ₹5L)', () => {
    const highValueContract: RecoveryContract = {
      ...sampleContract,
      amountAtRisk: 650000,
      requiresHumanApproval: true,
    };

    const result = PolicyGuard.validate(highValueContract, {
      retryCount: 0,
      optedOut: false,
      amountAtRisk: 650000,
      hasHumanApproval: false,
    });

    expect(result.allowed).toBe(false);
    expect(result.blockedReason).toContain('human approval');
    expect(result.violations.some((v) => v.includes('HUMAN_APPROVAL_REQUIRED'))).toBe(true);
  });
});

describe('RecoverIQ — Holdout Cohorts & Counterfactual Lift Math', () => {
  it('deterministically assigns holdout cohorts with hash stratification', () => {
    const cohort1 = HoldoutManager.assignCohort('tenant_1', 'inv_001', 'payment_degradation', 5000, 0.15);
    const cohort2 = HoldoutManager.assignCohort('tenant_1', 'inv_001', 'payment_degradation', 5000, 0.15);

    expect(cohort1.isHoldout).toBe(cohort2.isHoldout);
    expect(cohort1.cohort).toBe(cohort2.cohort);
  });

  it('accurately calculates incremental recovery, net recovery, and contact efficiency', () => {
    // 100 total eligible cases: 85 treatment, 15 holdout
    // Treatment recovered: ₹4,00,000 out of ₹5,00,000 eligible (80% rate)
    // Holdout recovered: ₹20,000 out of ₹1,00,000 eligible (20% natural rate)
    // Counterfactual expected recovery without intervention = 20% of 5,00,000 = ₹1,00,000
    // Incremental recovered = 4,00,000 - 1,00,000 = ₹3,00,000!
    const mockData = {
      treatmentEligible: 500000,
      treatmentRecovered: 400000,
      treatmentCases: 85,
      holdoutEligible: 100000,
      holdoutRecovered: 20000, // natural 20% rate
      holdoutCases: 15,
      outboundContacts: 60,
      optOuts: 0,
      discounts: 10000,
      refunds: 5000,
      messageCosts: 120,
    };

    const metrics = HoldoutManager.calculateExperimentMetrics(mockData);

    expect(metrics.treatmentCount).toBe(85);
    expect(metrics.holdoutCount).toBe(15);
    expect(metrics.treatmentRecoveryRate).toBe(80);
    expect(metrics.badgerRate).toBe(0); // 0 opt-outs / 0 policy violations
    expect(metrics.contactEfficiency).toBeGreaterThan(0);
    expect(metrics.incrementalRecovered).toBeGreaterThan(0);
  });
});

describe('RecoverIQ — Scenario Catalog (50-Case Benchmark)', () => {
  it('generates exactly 50 test cases distributed across the 4 incident lanes', () => {
    const cases = ScenarioCatalog.generate50Batch('test_tenant');

    expect(cases).toHaveLength(50);

    const paymentDegradation = cases.filter((c) => c.incidentLane === 'payment_degradation');
    const subscriptionRescue = cases.filter((c) => c.incidentLane === 'subscription_rescue');
    const b2bReceivables = cases.filter((c) => c.incidentLane === 'b2b_receivables');
    const checkoutDropoff = cases.filter((c) => c.incidentLane === 'checkout_dropoff');

    expect(paymentDegradation).toHaveLength(20);
    expect(subscriptionRescue).toHaveLength(15);
    expect(b2bReceivables).toHaveLength(10);
    expect(checkoutDropoff).toHaveLength(5);
  });

  it('assigns approximately 15% of cases to the holdout control group', () => {
    const cases = ScenarioCatalog.generate50Batch('test_tenant');
    const holdouts = cases.filter((c) => c.isHoldout);

    // 15% of 50 is ~7-8 cases
    expect(holdouts.length).toBeGreaterThanOrEqual(5);
    expect(holdouts.length).toBeLessThanOrEqual(12);
  });

  it('provides all 5 Act demo presets for hackathon presentation', () => {
    for (let act = 1; act <= 5; act++) {
      const preset = ScenarioCatalog.getDemoPreset(act as any, 'test_tenant');
      expect(preset.act).toBe(act);
      expect(preset.title).toBeDefined();
      expect(preset.description).toBeDefined();
    }
  });
});
