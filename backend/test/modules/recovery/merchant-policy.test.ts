import { describe, it, expect } from 'vitest';
import { MerchantPolicyService, MerchantPolicyConfigSchema } from '../../../src/modules/policy/merchant-policy.service.js';
import { PolicyGuard, type RecoveryContract } from '../../../src/modules/recovery/recovery.contract.js';

describe('P2 — Versioned Merchant Policy Configuration', () => {
  it('loads valid merchant policy configuration from source of truth', () => {
    const policy = MerchantPolicyService.getPolicyForMerchant('default_merchant');

    expect(policy.version).toBeDefined();
    expect(policy.policyHash).toBeDefined();
    expect(policy.policyHash.length).toBe(64); // SHA-256
    expect(policy.amountFloor).toBe(100.0);
    expect(policy.holdoutRatio).toBe(0.20); // 20% holdout
    expect(policy.interventionCaps.maxContactsPerInvoice).toBe(3);
    expect(policy.interventionCaps.maxDailyContactsPerCustomer).toBe(1);
    expect(policy.retrySchedule.maxAttempts).toBe(3);
    expect(policy.retrySchedule.cooldownHours).toBe(24);
    expect(policy.compliance.quietHoursStart).toBe('21:00');
    expect(policy.compliance.quietHoursEnd).toBe('08:00');
    expect(policy.compliance.customerTimezone).toBe('Asia/Kolkata');
    expect(policy.compliance.requireHumanApprovalAbove).toBe(500000.0);
    expect(policy.compliance.allowedChannels).toContain('email');
    expect(policy.allowedIncidentLanes).toContain('payment_degradation');
    expect(policy.allowedIncidentLanes).toContain('subscription_rescue');
  });

  it('loads enterprise merchant profile with relaxed thresholds', () => {
    const policy = MerchantPolicyService.getPolicyForMerchant('enterprise_tenant_1');

    expect(policy.amountFloor).toBe(250.0);
    expect(policy.interventionCaps.maxContactsPerInvoice).toBe(5);
    expect(policy.interventionCaps.maxDailyContactsPerCustomer).toBe(2);
    expect(policy.retrySchedule.maxAttempts).toBe(5);
    expect(policy.compliance.requireHumanApprovalAbove).toBe(250000.0);
    expect(policy.compliance.allowedChannels).toContain('voice');
  });

  it('loads strict healthcare profile with tight restrictions', () => {
    const policy = MerchantPolicyService.getPolicyForMerchant('strict_health_tenant');

    expect(policy.amountFloor).toBe(500.0);
    expect(policy.interventionCaps.maxContactsPerInvoice).toBe(2);
    expect(policy.compliance.allowedChannels).toEqual(['email']); // No SMS or Voice
    expect(policy.compliance.requireHumanApprovalAbove).toBe(10000.0);
  });

  it('computes deterministic SHA-256 policy hash and detects any mutation', () => {
    const rawPolicy = {
      version: '1.0.0',
      amountFloor: 100.0,
      holdoutRatio: 0.20,
      interventionCaps: {
        maxContactsPerInvoice: 3,
        maxDailyContactsPerCustomer: 1,
        maxTotalSpendPerBatch: 5000.0,
      },
      retrySchedule: {
        maxAttempts: 3,
        cooldownHours: 24,
        retryIntervalsDays: [1, 3, 7],
      },
      compliance: {
        quietHoursStart: '21:00',
        quietHoursEnd: '08:00',
        customerTimezone: 'Asia/Kolkata',
        requireHumanApprovalAbove: 500000.0,
        allowedChannels: ['email', 'sms'],
      },
      allowedIncidentLanes: ['payment_degradation', 'subscription_rescue'] as any,
    };

    const hash1 = MerchantPolicyService.computePolicyHash(rawPolicy);
    const hash2 = MerchantPolicyService.computePolicyHash(rawPolicy);
    expect(hash1).toBe(hash2);

    // Any modification changes the hash
    const modified = { ...rawPolicy, amountFloor: 150.0 };
    const hashModified = MerchantPolicyService.computePolicyHash(modified);
    expect(hash1).not.toBe(hashModified);
  });

  it('enforces merchant policy in PolicyGuard', () => {
    const strictPolicy = MerchantPolicyService.getPolicyForMerchant('strict_health_tenant');

    const contract: RecoveryContract = {
      caseId: 'test_case_1',
      incidentLane: 'payment_degradation',
      customerId: 'cust_test_1',
      amountAtRisk: 300, // Below strict_health_tenant floor of 500
      currency: 'INR',
      diagnosis: { primary: 'card_declined', evidence: [], confidence: 0.9 },
      recommendedAction: 'send_payment_link',
      actionParameters: { maxAmount: 300, expiresInHours: 48, allowedMethods: ['upi'] },
      customerMessage: 'Please pay',
      cooldownHours: 48,
      maxAttempts: 2,
      escalateAfter: '48h',
      stopRules: ['payment_captured'],
      requiresHumanApproval: false,
      policyVersion: strictPolicy.version,
      policyHash: strictPolicy.policyHash,
      selectedChannel: 'sms', // Strict health disallows SMS
    };

    // Amount below strict policy floor (300 < 500)
    const floorCheck = PolicyGuard.validate(contract, {
      retryCount: 0,
      amountAtRisk: 300,
      merchantPolicy: strictPolicy,
    });
    expect(floorCheck.allowed).toBe(false);
    expect(floorCheck.violations.some(v => v.includes('ECONOMIC_FLOOR_VIOLATION'))).toBe(true);

    // Channel disallowed by strict health policy
    const channelCheck = PolicyGuard.validate(contract, {
      retryCount: 0,
      amountAtRisk: 1000,
      channel: 'sms',
      merchantPolicy: strictPolicy,
    });
    expect(channelCheck.allowed).toBe(false);
    expect(channelCheck.violations.some(v => v.includes('CHANNEL_NOT_PERMITTED'))).toBe(true);
  });
});
