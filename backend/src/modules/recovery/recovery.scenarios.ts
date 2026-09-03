import type { IncidentLane, RecoveryContract } from './recovery.contract.js';

export interface ScenarioFixture {
  id: string;
  invoiceNo: string;
  clientName: string;
  clientEmail: string;
  amountAtRisk: number;
  currency: string;
  incidentLane: IncidentLane;
  failureReason: string;
  daysOverdue: number;
  isHoldout: boolean;
  contract: RecoveryContract;
}

export class ScenarioCatalog {
  /**
   * Generates a realistic, deterministic batch of 50 test cases as prescribed
   * by the Razorpay hackathon winning blueprint:
   * - 20 Payment Failures
   * - 15 Subscription Failures (Halted/Pending)
   * - 10 B2B Receivables (Overdue/Partial/PTP)
   * - 5 Checkout Drop-offs
   * Stratified ~15% holdout group (8 holdout cases, 42 treatment cases).
   */
  static generate50Batch(tenantId: string): ScenarioFixture[] {
    const fixtures: ScenarioFixture[] = [];

    // 1. Payment Degradation (20 cases)
    const paymentFailureReasons = [
      { reason: 'insufficient_funds', primary: 'insufficient_funds', action: 'send_payment_link', msg: 'Your payment could not be processed due to insufficient funds. Please use this secure link to try another account or card.' },
      { reason: 'card_declined', primary: 'card_declined', action: 'send_payment_link', msg: 'Your card was declined by your issuing bank. Complete payment instantly via UPI or Netbanking.' },
      { reason: 'authentication_failed', primary: 'authentication_failed', action: 'send_payment_link', msg: 'OTP verification failed during your recent transaction. Use this refreshed link to retry.' },
      { reason: 'gateway_technical_error', primary: 'temporary_gateway_issue', action: 'wait_retry', msg: 'A temporary banking network error occurred. We will re-attempt your payment shortly.' },
    ];

    for (let i = 1; i <= 20; i++) {
      const pIndex = (i - 1) % paymentFailureReasons.length;
      const p = paymentFailureReasons[pIndex]!;
      const amount = 2500 + (i * 1200);
      const isHoldout = i % 7 === 0; // ~15% holdout
      const caseId = `rcv_pay_${String(i).padStart(3, '0')}`;

      fixtures.push({
        id: caseId,
        invoiceNo: `INV-2026-PAY-${String(i).padStart(3, '0')}`,
        clientName: `Merchant Partner ${i}`,
        clientEmail: `finance${i}@merchantpartner.in`,
        amountAtRisk: amount,
        currency: 'INR',
        incidentLane: 'payment_degradation',
        failureReason: p.reason,
        daysOverdue: Math.floor(i * 1.8),
        isHoldout,
        contract: {
          caseId,
          incidentLane: 'payment_degradation',
          customerId: `cust_pay_${i}`,
          amountAtRisk: amount,
          currency: 'INR',
          diagnosis: {
            primary: p.primary,
            evidence: [p.reason, 'Razorpay webhook: payment.failed', '1 attempt recorded'],
            confidence: 0.92,
          },
          recommendedAction: p.action as any,
          actionParameters: {
            maxAmount: amount,
            expiresInHours: 48,
            allowedMethods: ['upi', 'card', 'netbanking'],
          },
          customerMessage: p.msg,
          voiceScriptHinglish: `Namaste ji, aapka ₹${amount.toLocaleString('en-IN')} ka payment process nahi ho paaya. Aap UPI ya card se turant secure link par payment complete kar sakte hain. Agar aap abhi payment nahi karna chahte, 'STOP' reply karein.`,
          cooldownHours: 24,
          maxAttempts: 3,
          escalateAfter: 'no_payment_after_48h',
          stopRules: ['payment_captured', 'customer_opted_out', 'refund_or_dispute_signal', 'max_attempts_reached'],
          requiresHumanApproval: amount > 500000,
        },
      });
    }

    // 2. Subscription Rescue (15 cases)
    const subReasons = [
      { reason: 'subscription.halted', primary: 'retry_exhausted', action: 'card_update_link', msg: 'Your recurring subscription auto-charge was halted after 3 failed attempts. Please update your mandate card or pay the balance.' },
      { reason: 'mandate_card_expired', primary: 'card_expired', action: 'card_update_link', msg: 'The card on file for your subscription has expired. Update your card details to keep your subscription active.' },
      { reason: 'subscription.pending', primary: 'intermittent_decline', action: 'mandate_retry', msg: 'Your recurring charge is currently pending re-attempt. T+24h retry scheduled.' },
    ];

    for (let i = 1; i <= 15; i++) {
      const sIndex = (i - 1) % subReasons.length;
      const s = subReasons[sIndex]!;
      const amount = 4999 + (i * 2500);
      const isHoldout = i === 4 || i === 11;
      const caseId = `rcv_sub_${String(i).padStart(3, '0')}`;

      fixtures.push({
        id: caseId,
        invoiceNo: `SUB-2026-${String(i).padStart(3, '0')}`,
        clientName: `SaaS Subscriber ${i}`,
        clientEmail: `admin${i}@subscribercloud.com`,
        amountAtRisk: amount,
        currency: 'INR',
        incidentLane: 'subscription_rescue',
        failureReason: s.reason,
        daysOverdue: Math.floor(i * 2),
        isHoldout,
        contract: {
          caseId,
          incidentLane: 'subscription_rescue',
          customerId: `cust_sub_${i}`,
          amountAtRisk: amount,
          currency: 'INR',
          diagnosis: {
            primary: s.primary,
            evidence: [s.reason, '3 recurring retries exhausted', 'card_declined'],
            confidence: 0.95,
          },
          recommendedAction: s.action as any,
          actionParameters: {
            maxAmount: amount,
            expiresInHours: 48,
            allowedMethods: ['upi', 'card', 'netbanking'],
          },
          customerMessage: s.msg,
          voiceScriptHinglish: `Namaste Ankit ji, aapka ₹${amount.toLocaleString('en-IN')} ka subscription auto-debit complete nahi ho paaya hai. Service continuous rakhne ke liye aap new card add kar sakte hain ya UPI se pay karein. Help ke liye 'SUPPORT' reply karein ya opt-out ke liye 'STOP'.`,
          cooldownHours: 48,
          maxAttempts: 2,
          escalateAfter: 'no_payment_after_48h',
          stopRules: ['payment_captured', 'customer_opted_out', 'subscription_cancelled', 'max_attempts_reached'],
          requiresHumanApproval: false,
        },
      });
    }

    // 3. B2B Receivables (10 cases)
    for (let i = 1; i <= 10; i++) {
      const amount = 25000 + (i * 15000);
      const isHoldout = i === 3 || i === 8;
      const caseId = `rcv_b2b_${String(i).padStart(3, '0')}`;
      const isStopCase = i === 5; // Demo case for intelligent non-action

      fixtures.push({
        id: caseId,
        invoiceNo: `B2B-2026-INV-${String(i).padStart(3, '0')}`,
        clientName: `Enterprise Corp ${i}`,
        clientEmail: `ap-team${i}@enterprisecorp.com`,
        amountAtRisk: amount,
        currency: 'INR',
        incidentLane: 'b2b_receivables',
        failureReason: isStopCase ? 'customer_replied_stop' : 'invoice_overdue_45d',
        daysOverdue: isStopCase ? 48 : (30 + i * 4),
        isHoldout,
        contract: {
          caseId,
          incidentLane: 'b2b_receivables',
          customerId: `cust_b2b_${i}`,
          amountAtRisk: amount,
          currency: 'INR',
          diagnosis: {
            primary: isStopCase ? 'customer_opted_out' : 'delayed_b2b_approval',
            evidence: isStopCase
              ? ['Debtor replied "STOP"', 'Customer opt-out signal received']
              : ['Invoice past due date', 'Email delivery confirmed', 'No dispute raised'],
            confidence: 0.98,
          },
          recommendedAction: isStopCase ? 'no_action' : 'promise_follow_up',
          actionParameters: {
            maxAmount: amount,
            expiresInHours: 72,
            allowedMethods: ['netbanking', 'neft', 'rtgs', 'card'],
          },
          customerMessage: isStopCase
            ? 'Communication halted: Customer opted out via STOP keyword.'
            : `Gentle reminder regarding Invoice B2B-2026-INV-${String(i).padStart(3, '0')}. Please verify the settlement schedule or pay online via the attached link.`,
          voiceScriptHinglish: isStopCase
            ? undefined
            : `Namaste, Enterprise Accounts team se call kar rahe hain regarding invoice B2B-2026-INV-${String(i).padStart(3, '0')}. Kripya payment schedule confirm karein.`,
          cooldownHours: 72,
          maxAttempts: 2,
          escalateAfter: 'no_payment_after_72h',
          stopRules: ['payment_captured', 'customer_opted_out', 'refund_or_dispute_signal', 'max_attempts_reached'],
          requiresHumanApproval: amount > 500000,
        },
      });
    }

    // 4. Checkout Drop-offs (5 cases)
    for (let i = 1; i <= 5; i++) {
      const amount = 1499 + (i * 800);
      const isHoldout = i === 2;
      const caseId = `rcv_chk_${String(i).padStart(3, '0')}`;

      fixtures.push({
        id: caseId,
        invoiceNo: `CHK-PORTAL-${String(i).padStart(3, '0')}`,
        clientName: `Consumer User ${i}`,
        clientEmail: `shopper${i}@gmail.com`,
        amountAtRisk: amount,
        currency: 'INR',
        incidentLane: 'checkout_dropoff',
        failureReason: 'portal_viewed_without_payment_30m',
        daysOverdue: 2,
        isHoldout,
        contract: {
          caseId,
          incidentLane: 'checkout_dropoff',
          customerId: `cust_chk_${i}`,
          amountAtRisk: amount,
          currency: 'INR',
          diagnosis: {
            primary: 'high_intent_checkout_dropoff',
            evidence: ['Portal viewed 2 times', 'Session inactive for 35 minutes', 'Cart value eligible'],
            confidence: 0.88,
          },
          recommendedAction: 'send_payment_link',
          actionParameters: {
            maxAmount: amount,
            expiresInHours: 24,
            allowedMethods: ['upi', 'card'],
          },
          customerMessage: 'You left items in your cart! Complete your order within 24 hours with this fast checkout link.',
          voiceScriptHinglish: `Hello ji, aapka order complete hone se reh gaya tha. Aap is link se 1-click UPI se complete kar sakte hain.`,
          cooldownHours: 24,
          maxAttempts: 1,
          escalateAfter: 'expire_no_action',
          stopRules: ['payment_captured', 'customer_opted_out', 'link_expired'],
          requiresHumanApproval: false,
        },
      });
    }

    return fixtures;
  }

  /**
   * Pre-configured scenarios matching the 5 Acts of the judge-facing demo script.
   */
  static getDemoPreset(actNumber: 1 | 2 | 3 | 4 | 5, tenantId: string) {
    const batch = this.generate50Batch(tenantId);

    switch (actNumber) {
      case 1:
        // Act 1: Seed 50-case batch
        return {
          act: 1,
          title: 'Act 1: Seed Batch',
          description: 'Display 50 at-risk cases across 4 lanes with 15% holdout split and zero policy violations.',
          batch,
        };
      case 2:
        // Act 2: Show agent reasoning on halted subscription
        const haltedSub = batch.find((c) => c.id === 'rcv_sub_001')!;
        return {
          act: 2,
          title: 'Act 2: Agent Reasoning & Recovery Contract',
          description: 'Inspect the exact Recovery Contract: "Razorpay indicates retry exhaustion; no opt-out or dispute; payment-method change recommended over same-card retry."',
          targetCase: haltedSub,
        };
      case 3:
        // Act 3: Execute real test-mode recovery
        const testCase = batch.find((c) => c.id === 'rcv_pay_001')!;
        return {
          act: 3,
          title: 'Act 3: Real Test-Mode Recovery',
          description: 'Create bounded 48h payment link via Razorpay Test API, simulate payment, receive webhook, update incremental ledger.',
          targetCase: testCase,
        };
      case 4:
        // Act 4: Demonstrate intelligent non-action
        const stopCase = batch.find((c) => c.failureReason === 'customer_replied_stop')!;
        return {
          act: 4,
          title: 'Act 4: Intelligent Non-Action',
          description: 'Customer replied STOP. PolicyGuard blocks outreach with "customer_opted_out". Proves stopping is a first-class outcome.',
          targetCase: stopCase,
        };
      case 5:
        // Act 5: Prove impact
        return {
          act: 5,
          title: 'Act 5: Incremental Recovery Proof',
          description: 'Show Treatment vs Holdout lift, Net recovered money, contact efficiency, and 0 policy violations.',
        };
    }
  }
}
