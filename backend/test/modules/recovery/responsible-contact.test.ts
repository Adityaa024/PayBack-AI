import { describe, it, expect } from 'vitest';
import { ResponsibleContactService } from '../../../src/modules/policy/responsible-contact.service.js';
import { MerchantPolicyService } from '../../../src/modules/policy/merchant-policy.service.js';
import { PolicyGuard, type RecoveryContract } from '../../../src/modules/recovery/recovery.contract.js';

describe('P2 — Responsible-Contact Controls', () => {
  const defaultPolicy = MerchantPolicyService.getPolicyForMerchant('default_merchant');

  const baseContract: RecoveryContract = {
    caseId: 'case_resp_1',
    incidentLane: 'payment_degradation',
    customerId: 'cust_responsible_1',
    amountAtRisk: 5000,
    currency: 'INR',
    diagnosis: { primary: 'insufficient_funds', evidence: [], confidence: 0.9 },
    recommendedAction: 'send_payment_link',
    actionParameters: { maxAmount: 5000, expiresInHours: 48, allowedMethods: ['upi', 'card'] },
    customerMessage: 'Please complete payment',
    cooldownHours: 24,
    maxAttempts: 3,
    escalateAfter: '48h',
    stopRules: ['payment_captured', 'customer_opted_out'],
    requiresHumanApproval: false,
    policyVersion: defaultPolicy.version,
    policyHash: defaultPolicy.policyHash,
    selectedChannel: 'email',
  };

  describe('Quiet Hours in Customer Timezone', () => {
    it('suppresses outreach during quiet hours in Asia/Kolkata (e.g. 23:00 / 11 PM)', () => {
      // 23:00 IST is 17:30 UTC
      const nightDate = new Date('2026-09-05T17:30:00.000Z');
      const check = ResponsibleContactService.isQuietHours(defaultPolicy, 'Asia/Kolkata', nightDate);

      expect(check.inQuietHours).toBe(true);
      expect(check.timezone).toBe('Asia/Kolkata');

      const guardCheck = PolicyGuard.validate(baseContract, {
        retryCount: 0,
        amountAtRisk: 5000,
        merchantPolicy: defaultPolicy,
        customerTimezone: 'Asia/Kolkata',
        enforceQuietHours: true,
        now: nightDate,
      });

      expect(guardCheck.allowed).toBe(false);
      expect(guardCheck.violations.some(v => v.includes('QUIET_HOURS_ACTIVE'))).toBe(true);
    });

    it('suppresses outreach in the early morning before 8 AM (e.g. 05:00 IST)', () => {
      // 05:00 IST is 23:30 UTC of previous day
      const earlyMorning = new Date('2026-09-04T23:30:00.000Z');
      const check = ResponsibleContactService.isQuietHours(defaultPolicy, 'Asia/Kolkata', earlyMorning);

      expect(check.inQuietHours).toBe(true);
    });

    it('allows outreach during daytime business hours (e.g. 14:00 / 2 PM IST)', () => {
      // 14:00 IST is 08:30 UTC
      const daytime = new Date('2026-09-05T08:30:00.000Z');
      const check = ResponsibleContactService.isQuietHours(defaultPolicy, 'Asia/Kolkata', daytime);

      expect(check.inQuietHours).toBe(false);

      const guardCheck = PolicyGuard.validate(baseContract, {
        retryCount: 0,
        amountAtRisk: 5000,
        merchantPolicy: defaultPolicy,
        customerTimezone: 'Asia/Kolkata',
        enforceQuietHours: true,
        now: daytime,
      });

      expect(guardCheck.allowed).toBe(true);
      expect(guardCheck.violations).toHaveLength(0);
    });
  });

  describe('Customer Consent and Channel Permissions', () => {
    it('blocks outreach if channel is disallowed by merchant policy', () => {
      const strictPolicy = MerchantPolicyService.getPolicyForMerchant('strict_health_tenant');
      const result = ResponsibleContactService.validateChannel(strictPolicy, 'voice');

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('CHANNEL_NOT_PERMITTED');
    });

    it('blocks outreach if customer specifically opted out of that channel', () => {
      const result = ResponsibleContactService.validateChannel(defaultPolicy, 'sms', {
        optedOutChannels: ['sms'],
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('CUSTOMER_CHANNEL_OPT_OUT');
    });

    it('blocks outreach if customer has explicitly revoked consent', () => {
      const result = ResponsibleContactService.validateChannel(defaultPolicy, 'email', {
        hasConsent: false,
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('NO_CUSTOMER_CONSENT');
    });

    it('routes to customer preferred channel when permitted', () => {
      const result = ResponsibleContactService.validateChannel(defaultPolicy, 'email', {
        preferredChannel: 'whatsapp',
      });

      expect(result.allowed).toBe(true);
      expect(result.resolvedChannel).toBe('whatsapp');
    });
  });

  describe('Cross-Session Customer Opt-Out & Dispute Suppression', () => {
    it('PolicyGuard blocks outreach immediately when dispute or refund is active', () => {
      const result = PolicyGuard.validate(baseContract, {
        retryCount: 0,
        amountAtRisk: 5000,
        hasDispute: true,
      });

      expect(result.allowed).toBe(false);
      expect(result.violations.some(v => v.includes('DISPUTE_ACTIVE'))).toBe(true);
    });

    it('PolicyGuard blocks outreach immediately when customer is marked optedOut', () => {
      const result = PolicyGuard.validate(baseContract, {
        retryCount: 0,
        amountAtRisk: 5000,
        optedOut: true,
      });

      expect(result.allowed).toBe(false);
      expect(result.violations.some(v => v.includes('CUSTOMER_OPTED_OUT'))).toBe(true);
    });
  });
});
