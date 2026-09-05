import { z } from 'zod';
import type { MerchantPolicyConfig } from '../policy/merchant-policy.service.js';
import { ResponsibleContactService } from '../policy/responsible-contact.service.js';

export type IncidentLane =
  | 'payment_degradation'
  | 'subscription_rescue'
  | 'checkout_dropoff'
  | 'b2b_receivables';

export type RecommendedAction =
  | 'send_payment_link'
  | 'wait_retry'
  | 'card_update_link'
  | 'mandate_retry'
  | 'promise_follow_up'
  | 'human_escalation'
  | 'no_action'
  | 'legal_stop';

export const RecoveryContractSchema = z.object({
  caseId: z.string(),
  incidentLane: z.enum([
    'payment_degradation',
    'subscription_rescue',
    'checkout_dropoff',
    'b2b_receivables',
  ]),
  customerId: z.string(),
  amountAtRisk: z.number(),
  currency: z.string().default('INR'),
  diagnosis: z.object({
    primary: z.string(),
    evidence: z.array(z.string()),
    confidence: z.number().min(0).max(1),
  }),
  recommendedAction: z.enum([
    'send_payment_link',
    'wait_retry',
    'card_update_link',
    'mandate_retry',
    'promise_follow_up',
    'human_escalation',
    'no_action',
    'legal_stop',
  ]),
  actionParameters: z.object({
    maxAmount: z.number(),
    expiresInHours: z.number().default(48),
    allowedMethods: z.array(z.string()).default(['upi', 'card', 'netbanking']),
  }),
  customerMessage: z.string(),
  voiceScriptHinglish: z.string().optional(),
  cooldownHours: z.number().default(48),
  maxAttempts: z.number().default(3),
  escalateAfter: z.string().default('no_payment_after_48h'),
  stopRules: z.array(z.string()).default([
    'payment_captured',
    'customer_opted_out',
    'refund_or_dispute_signal',
    'max_attempts_reached',
    'risk_score_above_threshold',
  ]),
  requiresHumanApproval: z.boolean().default(false),
  policyVersion: z.string().optional(),
  policyHash: z.string().optional(),
  selectedChannel: z.enum(['email', 'sms', 'whatsapp', 'voice']).optional(),
  economics: z.object({
    expectedIncrementalValue: z.number(),
    predictedProbability: z.number(),
    totalInterventionCost: z.number(),
    channelCost: z.number(),
    providerCost: z.number(),
    discountCost: z.number(),
    recommendation: z.enum(['proceed', 'human_review', 'abstain']),
    rationale: z.string(),
    modelVersion: z.string(),
    promptVersion: z.string(),
    chosenChannel: z.string(),
  }).optional(),
});

export type RecoveryContract = z.infer<typeof RecoveryContractSchema>;

export interface PolicyCheckResult {
  allowed: boolean;
  blockedReason?: string;
  violations: string[];
}

export interface PolicyContext {
  retryCount: number;
  lastContactedAt?: Date | string | null;
  optedOut?: boolean;
  hasDispute?: boolean;
  ptpBroken?: number;
  invoiceStatus?: string;
  daysOverdue?: number;
  amountAtRisk?: number;
  hasHumanApproval?: boolean;
  channel?: 'email' | 'sms' | 'whatsapp' | 'voice';
  customerTimezone?: string;
  merchantPolicy?: MerchantPolicyConfig;
  enforceQuietHours?: boolean;
  customerPreferences?: {
    preferredChannel?: string;
    optedOutChannels?: string[];
    hasConsent?: boolean;
  };
  economics?: {
    expectedIncrementalValue: number;
    recommendation: 'proceed' | 'human_review' | 'abstain';
  };
  now?: Date;
}

export class PolicyGuard {
  /**
   * Evaluates the recovery contract against hard guardrails, merchant policy, and compliance rules.
   * "The model recommends; policy code decides."
   */
  static validate(
    contract: RecoveryContract,
    context: PolicyContext
  ): { allowed: boolean; blockedReason?: string; violations: string[] } {
    const violations: string[] = [];
    const policy = context.merchantPolicy;

    // 1. Payment Already Captured / Settled
    if (context.invoiceStatus === 'Paid' || context.invoiceStatus === 'Written Off') {
      violations.push('INVOICE_SETTLED: Invoice is already settled or paid.');
    }

    // 2. Customer Opt-Out (STOP reply)
    if (context.optedOut) {
      violations.push('CUSTOMER_OPTED_OUT: Customer has opted out of communication (received STOP reply).');
    }

    // 3. Active Dispute / Refund Signal
    if (context.hasDispute) {
      violations.push('DISPUTE_ACTIVE: Active dispute or refund inquiry pending; routed to human review.');
    }

    // 3b. Promise-to-Pay Broken Twice
    if (context.ptpBroken !== undefined && context.ptpBroken >= 2) {
      violations.push('PTP_BROKEN_TWICE: Debtor broke two or more consecutive payment commitments; escalated to human review.');
    }

    // 4. Maximum Attempt Ceiling
    const maxAttempts = policy?.retrySchedule.maxAttempts ?? contract.maxAttempts;
    if (context.retryCount >= maxAttempts) {
      violations.push(`MAX_ATTEMPTS_EXCEEDED: Max retry attempts reached (${context.retryCount}/${maxAttempts}).`);
    }

    // 5. Cooldown Window Violation
    const cooldownHours = policy?.retrySchedule.cooldownHours ?? contract.cooldownHours;
    if (context.lastContactedAt && cooldownHours > 0) {
      const lastMs = typeof context.lastContactedAt === 'string'
        ? new Date(context.lastContactedAt).getTime()
        : context.lastContactedAt instanceof Date
          ? context.lastContactedAt.getTime()
          : new Date(String(context.lastContactedAt)).getTime();
      const elapsedHours = (Date.now() - lastMs) / (1000 * 60 * 60);
      if (elapsedHours < cooldownHours) {
        violations.push(
          `COOLDOWN_ACTIVE: Cooldown period active: ${elapsedHours.toFixed(1)}h elapsed out of ${cooldownHours}h required.`
        );
      }
    }

    // 6. 90-Day Overdue Hard Cap (Legal Stop)
    if (context.daysOverdue !== undefined && context.daysOverdue > 90) {
      violations.push(`LEGAL_STOP: Overdue duration (${context.daysOverdue} days) exceeds 90-day automated recovery cap.`);
    }

    // 7. High-Value B2B Guard (> threshold requires human approval)
    const amount = context.amountAtRisk !== undefined ? context.amountAtRisk : contract.amountAtRisk;
    const approvalThreshold = policy?.compliance.requireHumanApprovalAbove ?? 500000.0;
    if (amount > approvalThreshold && (contract.requiresHumanApproval || !context.hasHumanApproval)) {
      if (!context.hasHumanApproval) {
        violations.push(
          `HUMAN_APPROVAL_REQUIRED: High-value threshold (> ₹${approvalThreshold.toLocaleString('en-IN')}) requires explicit human approval before execution.`
        );
      }
    }

    // 8. Economic Floor Check
    const minFloor = policy?.amountFloor ?? 100.0;
    if (amount !== undefined && amount < minFloor) {
      violations.push(`ECONOMIC_FLOOR_VIOLATION: Amount (₹${amount}) is below the ₹${minFloor} economic floor for automated recovery.`);
    }

    // 9. Responsible Contact: Quiet Hours
    if (policy && (context.enforceQuietHours || context.now !== undefined)) {
      const quietCheck = ResponsibleContactService.isQuietHours(
        policy,
        context.customerTimezone,
        context.now || new Date()
      );
      if (quietCheck.inQuietHours) {
        violations.push(
          `QUIET_HOURS_ACTIVE: Outreach suppressed during quiet hours (${quietCheck.quietHoursWindow}) in timezone ${quietCheck.timezone}. Current local time: ${quietCheck.currentLocalTime}.`
        );
      }
    }

    // 10. Responsible Contact: Channel Permissions & Customer Consent
    if (policy && context.channel) {
      const channelCheck = ResponsibleContactService.validateChannel(
        policy,
        context.channel,
        context.customerPreferences
      );
      if (!channelCheck.allowed) {
        violations.push(channelCheck.reason || `CHANNEL_BLOCKED: Channel ${context.channel} is disallowed.`);
      }
    }

    // 11. Economically Grounded Routing: Abstain on Non-Positive EIV
    if (context.economics) {
      if (context.economics.recommendation === 'abstain' || context.economics.expectedIncrementalValue <= 0) {
        violations.push(
          `ECONOMIC_ABSTAIN: Expected incremental value (₹${context.economics.expectedIncrementalValue}) is non-positive; intervention withheld.`
        );
      }
    }

    if (violations.length > 0) {
      return {
        allowed: false,
        blockedReason: violations.join('; '),
        violations,
      };
    }

    return {
      allowed: true,
      violations: [],
    };
  }
}
