import { z } from 'zod';

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
  invoiceStatus?: string;
  daysOverdue?: number;
  amountAtRisk?: number;
  hasHumanApproval?: boolean;
}

export class PolicyGuard {
  /**
   * Evaluates the recovery contract against hard guardrails and regulatory compliance rules.
   * "The model recommends; policy code decides."
   */
  static validate(
    contract: RecoveryContract,
    context: PolicyContext
  ): { allowed: boolean; blockedReason?: string; violations: string[] } {
    const violations: string[] = [];

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

    // 4. Maximum Attempt Ceiling
    if (context.retryCount >= contract.maxAttempts) {
      violations.push(`MAX_ATTEMPTS_EXCEEDED: Max retry attempts reached (${context.retryCount}/${contract.maxAttempts}).`);
    }

    // 5. Cooldown Window Violation
    if (context.lastContactedAt && contract.cooldownHours > 0) {
      const lastMs = typeof context.lastContactedAt === 'string'
        ? new Date(context.lastContactedAt).getTime()
        : context.lastContactedAt instanceof Date
          ? context.lastContactedAt.getTime()
          : new Date(String(context.lastContactedAt)).getTime();
      const elapsedHours = (Date.now() - lastMs) / (1000 * 60 * 60);
      if (elapsedHours < contract.cooldownHours) {
        violations.push(
          `COOLDOWN_ACTIVE: Cooldown period active: ${elapsedHours.toFixed(1)}h elapsed out of ${contract.cooldownHours}h required.`
        );
      }
    }

    // 6. 90-Day Overdue Hard Cap (Legal Stop)
    if (context.daysOverdue && context.daysOverdue > 90) {
      violations.push(`LEGAL_STOP: Overdue duration (${context.daysOverdue} days) exceeds 90-day automated recovery cap.`);
    }

    // 7. High-Value B2B Guard (> ₹5,00,000 requires human approval)
    if (contract.amountAtRisk > 500000 && contract.requiresHumanApproval && !context.hasHumanApproval) {
      violations.push('HUMAN_APPROVAL_REQUIRED: High-value threshold (> ₹5,00,000) requires explicit human approval before execution.');
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
