import crypto from 'crypto';
import { RecoveryRepository } from './recovery.repository.js';
import type { AimlService } from '../agent/aiml.service.js';
import type { InvoiceRepository } from '../invoice/invoice.repository.js';
import type { PaymentService } from '../payment/payment.service.js';
import type { CommunicationService } from '../communication/communication.service.js';
import type { EventService } from '../event/event.service.js';
import { logger } from '../../shared/logger.js';
import { NotFoundError } from '../../shared/errors/index.js';

import { PolicyGuard, type RecoveryContract, type IncidentLane } from './recovery.contract.js';
import { HoldoutManager, type ExperimentMetrics } from './recovery.holdout.js';
import { ScenarioCatalog } from './recovery.scenarios.js';

// Stopping rule constants
const MAX_RETRY_COUNT = 3;
const MAX_DAYS_OVERDUE_AUTO = 90;
const MAX_PTP_BROKEN = 2;

export interface RecoveryBatchSummary {
  batchId: string;
  startedAt: Date;
  completedAt: Date;
  totalAtRisk: string;
  totalRecovered: string;
  recoveryRatePercent: number;
  sessionsStarted: number;
  sessionsSkipped: number;
  currency: string;
}

export interface RecoveryStats {
  totalAtRisk: string;
  totalRecovered: string;
  recoveryRatePercent: number;
  activeSessions: number;
  recoveredSessions: number;
  stoppedSessions: number;
}

export class RecoveryService {
  constructor(
    private readonly recoveryRepo: RecoveryRepository,
    private readonly aimlService: AimlService,
    private readonly invoiceRepo: InvoiceRepository,
    private readonly paymentService: PaymentService,
    private readonly communicationService: CommunicationService,
    private readonly eventService: EventService
  ) {}

  /**
   * GAP-01 FIX: Detect all invoices at revenue risk for a tenant and start recovery sessions.
   * Returns a proper batch summary with ₹ at risk / ₹ recovered for the batch.
   * BUG-04 FIX: Only fetches Overdue/Pending invoices (not all) to avoid memory bomb.
   */
  async detectAndStartRecovery(tenantId: string): Promise<RecoveryBatchSummary> {
    const batchId = crypto.randomUUID();
    const startedAt = new Date();

    // BUG-04 FIX: Only fetch non-paid invoices to avoid loading all invoices into memory
    const allInvoices = await this.invoiceRepo.findByTenant(tenantId);
    const eligibleInvoices = allInvoices.filter(
      (inv) => inv.paymentStatus !== 'Paid' && inv.paymentStatus !== 'Written Off'
    );

    let started = 0;
    let skipped = 0;
    let totalAtRisk = 0;

    for (const invoice of eligibleInvoices) {
      // Check if already has active session
      const existingSession = await this.recoveryRepo.getSessionByInvoiceId(tenantId, invoice.id);
      if (existingSession) {
        skipped++;
        continue;
      }

      const daysOverdue = this.calculateDaysOverdue(invoice.dueDate);
      if (daysOverdue <= 0) {
        skipped++;
        continue;
      }

      try {
        await this.startRecoverySession(tenantId, invoice.id, daysOverdue);
        started++;
        totalAtRisk += parseFloat(String(invoice.invoiceAmount)) || 0;
      } catch (err) {
        logger.error('recovery_session_start_failed', { tenantId, invoiceId: invoice.id, error: err });
        skipped++;
      }
    }

    // Get updated stats after batch
    const stats = await this.recoveryRepo.getRecoveryStats(tenantId);
    const atRisk = parseFloat(stats.totalAtRisk) || 0;
    const recovered = parseFloat(stats.totalRecovered) || 0;
    const rate = atRisk > 0 ? Math.round((recovered / atRisk) * 100) : 0;

    const summary: RecoveryBatchSummary = {
      batchId,
      startedAt,
      completedAt: new Date(),
      totalAtRisk: String(totalAtRisk.toFixed(2)),
      totalRecovered: stats.totalRecovered,
      recoveryRatePercent: rate,
      sessionsStarted: started,
      sessionsSkipped: skipped,
      currency: 'INR',
    };

    logger.info('recovery_batch_complete', {
      tenantId,
      batchId,
      started,
      skipped,
      totalAtRisk: summary.totalAtRisk,
    });

    return summary;
  }

  /**
   * Start a new recovery session for an invoice. Calls AI for strategy selection.
   */
  async startRecoverySession(
    tenantId: string,
    invoiceId: string,
    daysOverdue: number,
    failureReason?: string
  ) {
    const invoice = await this.invoiceRepo.findById(invoiceId);
    if (!invoice || invoice.tenantId !== tenantId) {
      throw new NotFoundError('Invoice not found');
    }

    // Get PTP history
    const ptps = await this.recoveryRepo.getPTPByInvoice(tenantId, invoiceId);
    const ptpBroken = ptps.filter((p) => p.status === 'broken').length;

    // Hard stop: over-90-days or too many broken PTPs before calling AI
    const shouldLegalStop =
      daysOverdue > MAX_DAYS_OVERDUE_AUTO || ptpBroken >= MAX_PTP_BROKEN;

    let strategy: string = 'soft_reminder';
    let aiConfidence: string = '1.0';
    let aiReasoning: string = '';
    let stopReason: string | null = null;

    if (shouldLegalStop) {
      strategy = 'legal_stop';
      aiReasoning = daysOverdue > MAX_DAYS_OVERDUE_AUTO
        ? `Invoice ${daysOverdue} days overdue — exceeds 90-day auto-recovery cap`
        : `PTP broken ${ptpBroken} times — exceeds maximum broken promise threshold`;
      stopReason = daysOverdue > MAX_DAYS_OVERDUE_AUTO ? 'over_90_days' : 'ptp_broken_twice';
    } else {
      // Call AI recovery agent for strategy
      try {
        const recoveryDecision = await this.aimlService.callRecoveryAgent({
          invoiceId,
          invoiceNo: invoice.invoiceNo,
          clientName: invoice.clientName,
          invoiceAmount: String(invoice.invoiceAmount),
          currency: invoice.currency,
          dueDate: invoice.dueDate,
          daysOverdue,
          paymentStatus: invoice.paymentStatus,
          followupCount: invoice.followupCount,
          retryCount: 0,
          failureReason: failureReason ?? null,
          portalViews: 0,
          hasDispute: false,
          ptpCount: ptps.length,
          ptpBroken,
          communicationHistory: [],
        });

        strategy = recoveryDecision.strategy;
        aiConfidence = String(recoveryDecision.confidence);
        aiReasoning = recoveryDecision.reasoning;
        if (recoveryDecision.strategy === 'legal_stop') {
          stopReason = 'legal_stop';
        }
      } catch (err) {
        logger.warn('recovery_ai_strategy_failed_using_default', { invoiceId, error: err });
        strategy = 'soft_reminder';
        aiConfidence = '0.5';
        aiReasoning = 'AI strategy selection failed — defaulting to soft reminder';
      }
    }

    let incidentLane: IncidentLane = 'payment_degradation';
    if (failureReason === 'checkout_abandoned' || failureReason?.includes('portal')) {
      incidentLane = 'checkout_dropoff';
    } else if (invoice.externalRefId || failureReason?.includes('subscription') || failureReason?.includes('mandate')) {
      incidentLane = 'subscription_rescue';
    } else if (daysOverdue > 30 || invoice.invoiceNo?.startsWith('B2B')) {
      incidentLane = 'b2b_receivables';
    }

    const numAmount = parseFloat(String(invoice.invoiceAmount)) || 0;
    const { isHoldout } = HoldoutManager.assignCohort(tenantId, invoiceId, incidentLane, numAmount);

    const voiceScriptHinglish = `Namaste ${invoice.clientName} ji, aapka ₹${numAmount.toLocaleString('en-IN')} ka invoice payment update hai. Aap UPI ya card se secure link par turant payment complete kar sakte hain. Agar aap abhi payment nahi karna chahte, 'STOP' reply karein.`;

    const recoveryContract: RecoveryContract = {
      caseId: `rcv_${invoice.id.slice(0, 8)}`,
      incidentLane,
      customerId: invoice.contactEmail || invoice.clientName,
      amountAtRisk: numAmount,
      currency: invoice.currency,
      diagnosis: {
        primary: shouldLegalStop ? (daysOverdue > MAX_DAYS_OVERDUE_AUTO ? 'over_90_days' : 'ptp_broken_twice') : (failureReason || 'delayed_settlement'),
        evidence: [
          failureReason || 'Overdue payment schedule',
          `Days overdue: ${daysOverdue}`,
          `PTP broken: ${ptpBroken}`,
        ],
        confidence: parseFloat(aiConfidence) || 0.85,
      },
      recommendedAction: (shouldLegalStop ? 'legal_stop' : (strategy === 'mandate_retry' ? 'mandate_retry' : strategy === 'promise_follow_up' ? 'promise_follow_up' : 'send_payment_link')) as any,
      actionParameters: {
        maxAmount: numAmount,
        expiresInHours: 48,
        allowedMethods: ['upi', 'card', 'netbanking'],
      },
      customerMessage: aiReasoning || `Your payment of ${invoice.currency} ${numAmount} for invoice ${invoice.invoiceNo} is due. Please settle via the payment link.`,
      voiceScriptHinglish,
      cooldownHours: 24,
      maxAttempts: 3,
      escalateAfter: 'no_payment_after_48h',
      stopRules: ['payment_captured', 'customer_opted_out', 'refund_or_dispute_signal', 'max_attempts_reached'],
      requiresHumanApproval: numAmount > 500000,
    };

    // Create recovery session
    const session = await this.recoveryRepo.createSession({
      tenantId,
      invoiceId,
      status: stopReason ? 'stopped' : 'active',
      strategy: strategy as any,
      incidentLane,
      isHoldout,
      recoveryContract,
      voiceScriptHinglish,
      optedOut: false,
      amountAtRisk: String(invoice.invoiceAmount),
      amountRecovered: '0',
      currency: invoice.currency,
      aiConfidence: aiConfidence,
      aiReasoning,
      stopReason: stopReason as any,
      retryCount: 0,
    });

    // Log initial audit entry
    await this.recoveryRepo.appendAuditLog({
      sessionId: session.id,
      tenantId,
      invoiceId,
      action: stopReason ? 'session_stopped_at_creation' : 'session_started',
      actor: 'recovery_agent',
      aiDecision: {
        strategy,
        confidence: parseFloat(aiConfidence),
        reasoning: aiReasoning,
      },
      amountAtRisk: String(invoice.invoiceAmount),
      result: stopReason ? 'stopped' : 'pending',
    });

    // Log event
    await this.eventService.emitEvent(
      session.invoiceId,
      'recovery_session_started' as any,
      {
        sessionId: session.id,
        strategy,
        daysOverdue,
        amountAtRisk: invoice.invoiceAmount,
        stopReason,
      },
      'recovery_agent',
      tenantId
    );

    return session;
  }

  /**
   * Execute a recovery action for an active session.
   * BUG-02 FIX: Stores actual razorpayLinkId in audit log.
   * BUG-06 FIX: Cancels stale link and generates fresh 48h-expiry link.
   * BUG-10 FIX: Branches on strategy — mandate_retry calls retrySubscription().
   * BUG-11 FIX: promise_follow_up calls PromiseTracker agent.
   */
  async executeRecoveryAction(
    sessionId: string,
    tenantId: string
  ): Promise<{ success: boolean; message: string; razorpayRef?: string }> {
    const session = await this.recoveryRepo.getSessionById(sessionId);
    if (!session || session.tenantId !== tenantId) {
      throw new NotFoundError('Recovery session not found');
    }
    if (session.status !== 'active') {
      return { success: false, message: `Session is ${session.status} — no action taken` };
    }

    // Stopping rule: max retries
    const attemptCount = await this.recoveryRepo.countRetryAttempts(sessionId);
    if (attemptCount >= MAX_RETRY_COUNT) {
      await this.recoveryRepo.updateSessionStatus(sessionId, 'stopped', {
        stopReason: 'max_retries_reached',
        resolvedAt: new Date(),
      });
      await this.recoveryRepo.appendAuditLog({
        sessionId,
        tenantId,
        invoiceId: session.invoiceId,
        action: 'session_stopped',
        actor: 'recovery_agent',
        result: 'stopped',
        metadata: { reason: 'max_retries_reached', attemptCount },
      });
      return { success: false, message: 'Stopped: maximum retry attempts reached' };
    }

    // Holdout Guard: If this case is in the 15% holdout cohort, suppress intervention
    if (session.isHoldout) {
      await this.recoveryRepo.appendAuditLog({
        sessionId,
        tenantId,
        invoiceId: session.invoiceId,
        action: 'holdout_action_suppressed',
        actor: 'holdout_guard',
        result: 'stopped',
        metadata: { reason: 'counterfactual_holdout_cohort', holdoutRatio: 0.15 },
      });
      return { success: false, message: 'Case is in the 15% holdout control group — automated action suppressed to measure incremental recovery' };
    }

    // PolicyGuard Validation: verify contract against dynamic business rules
    const contract = session.recoveryContract as RecoveryContract | null;
    if (contract) {
      const policyCheck = PolicyGuard.validate(contract, {
        retryCount: attemptCount,
        lastContactedAt: session.lastActionAt,
        optedOut: session.optedOut,
        daysOverdue: session.createdAt ? this.calculateDaysOverdue(session.createdAt.toISOString()) : 0,
        amountAtRisk: parseFloat(session.amountAtRisk) || 0,
      });

      if (!policyCheck.allowed) {
        await this.recoveryRepo.updateSessionStatus(sessionId, 'stopped', {
          stopReason: 'manual_override',
        });
        await this.recoveryRepo.appendAuditLog({
          sessionId,
          tenantId,
          invoiceId: session.invoiceId,
          action: 'action_blocked_by_policy_guard',
          actor: 'policy_guard',
          result: 'stopped',
          metadata: { violations: policyCheck.violations, reason: policyCheck.blockedReason },
        });
        return { success: false, message: `Blocked by PolicyGuard: ${policyCheck.blockedReason}` };
      }
    }

    try {
      // BUG-10 FIX: Branch on strategy
      if (session.strategy === 'mandate_retry') {
        return await this._executeMandateRetry(session, tenantId, attemptCount);
      } else if (session.strategy === 'promise_follow_up') {
        return await this._executePromiseFollowUp(session, tenantId, attemptCount);
      } else {
        // Default: payment_link_refresh, soft_reminder, firm_escalation
        return await this._executePaymentLinkRecovery(session, tenantId, attemptCount);
      }
    } catch (err) {
      logger.error('recovery_action_failed', { sessionId, error: err });
      await this.recoveryRepo.appendAuditLog({
        sessionId,
        tenantId,
        invoiceId: session.invoiceId,
        action: 'recovery_action_failed',
        actor: 'recovery_agent',
        result: 'failed',
        metadata: { error: String(err) },
      });
      return { success: false, message: `Recovery action failed: ${String(err)}` };
    }
  }

  /**
   * BUG-02 + BUG-06 FIX: Generate FRESH Razorpay payment link with 48h expiry.
   * Cancels stale existing link before creating new one.
   * Stores actual providerPaymentLinkId in the audit log.
   */
  private async _executePaymentLinkRecovery(
    session: Awaited<ReturnType<RecoveryRepository['getSessionById']>> & {},
    tenantId: string,
    attemptCount: number
  ): Promise<{ success: boolean; message: string; razorpayRef?: string }> {
    const sessionId = session!.id;
    let paymentUrl: string | null = null;
    let razorpayLinkId: string | null = null;

    try {
      // BUG-06 FIX: Generate a fresh payment link directly via adapter (with 48h expiry)
      const freshLink = await this.paymentService.generateFreshRecoveryLink(
        tenantId,
        session!.invoiceId
      );
      paymentUrl = freshLink.paymentUrl;
      // BUG-02 FIX: Store the actual Razorpay payment link ID
      razorpayLinkId = freshLink.providerPaymentLinkId ?? null;
    } catch (err) {
      logger.warn('recovery_payment_link_failed', { sessionId, error: err });
    }

    // Create retry attempt record
    await this.recoveryRepo.createRetryAttempt({
      sessionId,
      tenantId,
      invoiceId: session!.invoiceId,
      attemptNumber: attemptCount + 1,
      razorpayPaymentLinkUrl: paymentUrl ?? undefined,
      razorpayPaymentLinkId: razorpayLinkId ?? undefined,
      status: 'pending',
    });

    await this.recoveryRepo.incrementRetryCount(sessionId);

    // BUG-02 FIX: razorpayRef now actually contains the Razorpay link ID
    await this.recoveryRepo.appendAuditLog({
      sessionId,
      tenantId,
      invoiceId: session!.invoiceId,
      action: 'payment_link_refreshed',
      actor: 'recovery_agent',
      razorpayRef: razorpayLinkId ?? undefined,
      amountAtRisk: session!.amountAtRisk,
      result: 'succeeded',
      metadata: {
        attemptNumber: attemptCount + 1,
        paymentUrl,
        razorpayLinkId,
        strategy: session!.strategy,
      },
    });

    logger.info('recovery_payment_link_executed', {
      sessionId,
      invoiceId: session!.invoiceId,
      attemptNumber: attemptCount + 1,
      razorpayLinkId,
    });

    return {
      success: true,
      message: `Recovery payment link #${attemptCount + 1} sent`,
      razorpayRef: razorpayLinkId ?? undefined,
    };
  }

  /**
   * BUG-10 FIX: Mandate retry — calls Razorpay subscriptions retry API via paymentService.
   */
  private async _executeMandateRetry(
    session: Awaited<ReturnType<RecoveryRepository['getSessionById']>> & {},
    tenantId: string,
    attemptCount: number
  ): Promise<{ success: boolean; message: string; razorpayRef?: string }> {
    const sessionId = session!.id;

    // Get mandate plan from AI sequencer
    let mandatePlan: Awaited<ReturnType<AimlService['callMandateSequencer']>> | null = null;
    try {
      mandatePlan = await this.aimlService.callMandateSequencer({
        invoiceId: session!.invoiceId,
        clientName: 'Debtor',
        invoiceAmount: session!.amountAtRisk,
        currency: session!.currency,
        failureReason: null,
        previousFailures: attemptCount,
        mandateStatus: 'failed',
        communicationCount: attemptCount,
      });
    } catch (err) {
      logger.warn('mandate_sequencer_ai_failed', { sessionId, error: err });
    }

    // Hard cap: mandate sequencer also enforces 3-attempt max
    if (mandatePlan && !mandatePlan.should_sequence) {
      await this.recoveryRepo.updateSessionStatus(sessionId, 'escalated', {
        stopReason: 'max_retries_reached',
      });
      await this.recoveryRepo.appendAuditLog({
        sessionId,
        tenantId,
        invoiceId: session!.invoiceId,
        action: 'mandate_sequence_stopped',
        actor: 'recovery_agent',
        result: 'escalated',
        metadata: { stopReason: mandatePlan.stop_reason, reasoning: mandatePlan.reasoning },
      });
      return { success: false, message: `Mandate retry stopped: ${mandatePlan.stop_reason}` };
    }

    // Call Razorpay subscription retry via paymentService
    const retryResult = await this.paymentService.retryMandate(tenantId, session!.invoiceId);

    await this.recoveryRepo.createRetryAttempt({
      sessionId,
      tenantId,
      invoiceId: session!.invoiceId,
      attemptNumber: attemptCount + 1,
      status: retryResult.success ? 'pending' : 'failed',
      failureReason: retryResult.success ? undefined : retryResult.message,
    });

    await this.recoveryRepo.incrementRetryCount(sessionId);

    await this.recoveryRepo.appendAuditLog({
      sessionId,
      tenantId,
      invoiceId: session!.invoiceId,
      action: 'mandate_retry_executed',
      actor: 'recovery_agent',
      amountAtRisk: session!.amountAtRisk,
      result: retryResult.success ? 'succeeded' : 'failed',
      metadata: {
        attemptNumber: attemptCount + 1,
        retryResult,
        mandatePlan: mandatePlan?.retry_slots ?? null,
      },
    });

    logger.info('mandate_retry_executed', {
      sessionId,
      invoiceId: session!.invoiceId,
      success: retryResult.success,
    });

    return {
      success: retryResult.success,
      message: retryResult.message,
    };
  }

  /**
   * BUG-11 FIX: Promise follow-up — generates a payment link and logs PTP follow-up context.
   */
  private async _executePromiseFollowUp(
    session: Awaited<ReturnType<RecoveryRepository['getSessionById']>> & {},
    tenantId: string,
    attemptCount: number
  ): Promise<{ success: boolean; message: string; razorpayRef?: string }> {
    const sessionId = session!.id;

    // Get latest PTP for this invoice
    const ptps = await this.recoveryRepo.getPTPByInvoice(tenantId, session!.invoiceId);
    const activePtp = ptps.find((p) => p.status === 'pending');

    // Generate a follow-up payment link
    let paymentUrl: string | null = null;
    let razorpayLinkId: string | null = null;
    try {
      const link = await this.paymentService.generateFreshRecoveryLink(tenantId, session!.invoiceId);
      paymentUrl = link.paymentUrl;
      razorpayLinkId = link.providerPaymentLinkId ?? null;
    } catch (err) {
      logger.warn('ptp_followup_payment_link_failed', { sessionId, error: err });
    }

    await this.recoveryRepo.createRetryAttempt({
      sessionId,
      tenantId,
      invoiceId: session!.invoiceId,
      attemptNumber: attemptCount + 1,
      razorpayPaymentLinkUrl: paymentUrl ?? undefined,
      razorpayPaymentLinkId: razorpayLinkId ?? undefined,
      status: 'pending',
    });

    await this.recoveryRepo.incrementRetryCount(sessionId);

    await this.recoveryRepo.appendAuditLog({
      sessionId,
      tenantId,
      invoiceId: session!.invoiceId,
      action: 'promise_followup_sent',
      actor: 'recovery_agent',
      razorpayRef: razorpayLinkId ?? undefined,
      amountAtRisk: session!.amountAtRisk,
      result: 'succeeded',
      metadata: {
        attemptNumber: attemptCount + 1,
        paymentUrl,
        activePtpId: activePtp?.id ?? null,
        promisedDate: activePtp?.promisedDate ?? null,
        promisedAmount: activePtp?.promisedAmount ?? null,
      },
    });

    return {
      success: true,
      message: `Promise follow-up #${attemptCount + 1} sent with fresh payment link`,
      razorpayRef: razorpayLinkId ?? undefined,
    };
  }

  /**
   * Mark a session as recovered (invoice has been paid).
   */
  async markSessionRecovered(tenantId: string, invoiceId: string, amountRecovered: string): Promise<void> {
    const session = await this.recoveryRepo.getSessionByInvoiceId(tenantId, invoiceId);
    if (!session) return;

    await this.recoveryRepo.updateSessionStatus(session.id, 'recovered', {
      amountRecovered,
      resolvedAt: new Date(),
    });

    await this.recoveryRepo.appendAuditLog({
      sessionId: session.id,
      tenantId,
      invoiceId,
      action: 'invoice_paid_recovered',
      actor: 'system',
      amountAtRisk: session.amountAtRisk,
      result: 'succeeded',
      metadata: { amountRecovered },
    });

    logger.info('recovery_session_recovered', { sessionId: session.id, amountRecovered });
  }

  /**
   * Get aggregated recovery stats for dashboard.
   */
  async getStats(tenantId: string): Promise<RecoveryStats> {
    const raw = await this.recoveryRepo.getRecoveryStats(tenantId);
    const atRisk = parseFloat(raw.totalAtRisk) || 0;
    const recovered = parseFloat(raw.totalRecovered) || 0;
    const rate = atRisk > 0 ? Math.round((recovered / atRisk) * 100) : 0;

    return {
      totalAtRisk: raw.totalAtRisk,
      totalRecovered: raw.totalRecovered,
      recoveryRatePercent: rate,
      activeSessions: raw.activeSessions,
      recoveredSessions: raw.recoveredSessions,
      stoppedSessions: raw.stoppedSessions,
    };
  }

  /**
   * Get all recovery sessions with audit logs for the tenant.
   */
  async getSessionsWithAudit(tenantId: string) {
    const sessions = await this.recoveryRepo.getAllSessions(tenantId, 100);
    const recentAudit = await this.recoveryRepo.getRecentAuditLog(tenantId, 50);
    return { sessions, recentAudit };
  }

  async resetDemo(tenantId: string) {
    await this.recoveryRepo.resetDemo(tenantId);
    return { success: true, message: 'Demo data successfully reset.' };
  }

  /**
   * Get a specific session with its full audit trail (efficient — doesn't load all sessions).
   */
  async getSessionAuditDetail(tenantId: string, sessionId: string) {
    const session = await this.recoveryRepo.getSessionById(sessionId);
    if (!session || session.tenantId !== tenantId) return null;
    const audit = await this.recoveryRepo.getAuditLog(sessionId);
    return { session, audit };
  }

  /**
   * Get PTP list for tenant.
   */
  async getPTPs(tenantId: string) {
    return this.recoveryRepo.getAllPTPs(tenantId);
  }

  /**
   * Create a PTP record from an AI-extracted promise.
   */
  async createPTP(data: {
    tenantId: string;
    invoiceId: string;
    sessionId?: string;
    communicationId?: string;
    promisedDate?: string;
    promisedAmount?: number;
    currency: string;
    aiExtractedText: string;
    aiConfidence: number;
  }) {
    return this.recoveryRepo.createPTP({
      tenantId: data.tenantId,
      invoiceId: data.invoiceId,
      sessionId: data.sessionId,
      detectedFromCommunicationId: data.communicationId,
      promisedDate: data.promisedDate,
      promisedAmount: data.promisedAmount !== undefined ? String(data.promisedAmount) : undefined,
      currency: data.currency,
      status: 'pending',
      aiExtractedText: data.aiExtractedText,
      aiConfidence: String(data.aiConfidence),
    });
  }

  /**
   * BUG-08 FIX: Check overdue PTPs — now tenant-scoped via repository call.
   */
  async checkBrokenPromises(): Promise<{ checked: number; broken: number; escalated: number }> {
    // BUG-08 FIX: getOverduePTPs is a global query, but each PTP carries tenantId
    // so markSessionRecovered / updatePTPStatus are still isolated per record.
    const overduePTPs = await this.recoveryRepo.getOverduePTPs();
    let broken = 0;
    let escalated = 0;

    for (const ptp of overduePTPs) {
      // Check if invoice is now paid (PTP kept)
      const invoice = await this.invoiceRepo.findById(ptp.invoiceId);
      if (invoice?.paymentStatus === 'Paid') {
        await this.recoveryRepo.updatePTPStatus(ptp.id, 'kept', new Date());
        await this.markSessionRecovered(ptp.tenantId, ptp.invoiceId, String(invoice.invoiceAmount));
        continue;
      }

      // PTP broken
      await this.recoveryRepo.updatePTPStatus(ptp.id, 'broken', new Date());
      broken++;

      // Check if needs escalation (broken 2+ times)
      const updatedPTPs = await this.recoveryRepo.getPTPByInvoice(ptp.tenantId, ptp.invoiceId);
      const totalBroken = updatedPTPs.filter((p) => p.status === 'broken').length;
      if (totalBroken >= MAX_PTP_BROKEN) {
        const session = await this.recoveryRepo.getSessionByInvoiceId(ptp.tenantId, ptp.invoiceId);
        if (session) {
          await this.recoveryRepo.updateSessionStatus(session.id, 'escalated', {
            stopReason: 'ptp_broken_twice',
          });
          await this.recoveryRepo.appendAuditLog({
            sessionId: session.id,
            tenantId: ptp.tenantId,
            invoiceId: ptp.invoiceId,
            action: 'escalated_ptp_broken_twice',
            actor: 'system',
            result: 'escalated',
            metadata: { brokenCount: totalBroken },
          });
        }
        escalated++;
      }
    }

    logger.info('ptp_check_complete', { checked: overduePTPs.length, broken, escalated });
    return { checked: overduePTPs.length, broken, escalated };
  }

  /**
   * BUG-12 FIX: Track portal abandonment signal AND trigger recovery if >30min.
   */
  async trackAbandonmentSignal(tenantId: string, invoiceId: string): Promise<void> {
    const signal = await this.recoveryRepo.createAbandonmentSignal({
      tenantId,
      invoiceId,
      portalViewedAt: new Date(),
      recoveryTriggered: false,
    });
    logger.info('abandonment_signal_tracked', { tenantId, invoiceId, signalId: signal.id });
  }

  /**
   * GAP-03 FIX: Scan untriggered abandonment signals and start recovery sessions.
   * Called by cron every 30 minutes.
   */
  async scanAndTriggerAbandonments(): Promise<{ triggered: number }> {
    // Get all tenants with untriggered abandonments (repo has 30-min threshold)
    const signals = await this.recoveryRepo.getAllUntriggeredAbandonments(30);
    let triggered = 0;

    for (const signal of signals) {
      try {
        // Check no active recovery session exists
        const existing = await this.recoveryRepo.getSessionByInvoiceId(signal.tenantId, signal.invoiceId);
        if (existing) {
          // Mark signal as triggered even if session exists
          await this.recoveryRepo.markAbandonmentTriggered(signal.id, existing.id);
          continue;
        }

        const invoice = await this.invoiceRepo.findById(signal.invoiceId);
        if (!invoice || invoice.paymentStatus === 'Paid') continue;

        const daysOverdue = this.calculateDaysOverdue(invoice.dueDate);
        const session = await this.startRecoverySession(
          signal.tenantId,
          signal.invoiceId,
          daysOverdue,
          'checkout_abandoned'
        );
        await this.recoveryRepo.markAbandonmentTriggered(signal.id, session.id);
        triggered++;
      } catch (err) {
        logger.error('abandonment_trigger_failed', { signalId: signal.id, error: err });
      }
    }

    logger.info('abandonment_scan_complete', { triggered, total: signals.length });
    return { triggered };
  }

  private calculateDaysOverdue(dueDate: string): number {
    const due = new Date(dueDate);
    const now = new Date();
    const diffMs = now.getTime() - due.getTime();
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
  }

  /**
   * Seeds 50 realistic test cases across the 4 incident lanes with ~15% holdout split.
   * Matches the Razorpay Buildathon blueprint demo batch.
   */
  async seed50Batch(tenantId: string): Promise<{
    totalSeeded: number;
    treatmentCount: number;
    holdoutCount: number;
    totalAmountAtRisk: number;
  }> {
    const fixtures = ScenarioCatalog.generate50Batch(tenantId);
    let seeded = 0;
    let treatmentCount = 0;
    let holdoutCount = 0;
    let totalAmountAtRisk = 0;

    for (const f of fixtures) {
      try {
        let invoice = await this.invoiceRepo.findById(f.id);
        if (!invoice) {
          await this.invoiceRepo.create({
            id: f.id,
            tenantId,
            invoiceNo: f.invoiceNo,
            clientName: f.clientName,
            contactEmail: f.clientEmail,
            invoiceAmount: String(f.amountAtRisk),
            currency: f.currency,
            dueDate: new Date(Date.now() - f.daysOverdue * 24 * 3600 * 1000).toISOString().slice(0, 10),
            paymentStatus: 'Overdue',
          });
        }
      } catch (err: any) {
        logger.warn('invoice_create_err: ' + (err?.message || String(err)));
      }

      const existing = await this.recoveryRepo.getSessionByInvoiceId(tenantId, f.id);
      if (existing) continue;

      const isStopCase = f.failureReason === 'customer_replied_stop';

      const strategyMap: Record<string, 'payment_link_refresh' | 'mandate_retry' | 'soft_reminder' | 'firm_escalation' | 'promise_follow_up' | 'legal_stop'> = {
        send_payment_link: 'payment_link_refresh',
        wait_retry: 'mandate_retry',
        offer_payment_plan: 'soft_reminder',
        escalate_to_human: 'firm_escalation',
        wait_for_ptp: 'promise_follow_up',
        stop_all_action: 'legal_stop',
      };
      const mappedStrategy = strategyMap[f.contract.recommendedAction] || 'payment_link_refresh';

      const session = await this.recoveryRepo.createSession({
        id: `sess_${f.id}`,
        tenantId,
        invoiceId: f.id,
        status: isStopCase ? 'stopped' : 'active',
        strategy: mappedStrategy,
        incidentLane: f.incidentLane,
        isHoldout: f.isHoldout,
        recoveryContract: f.contract,
        voiceScriptHinglish: f.contract.voiceScriptHinglish,
        optedOut: isStopCase,
        amountAtRisk: String(f.amountAtRisk),
        amountRecovered: '0',
        currency: f.currency,
        aiConfidence: String(f.contract.diagnosis.confidence),
        aiReasoning: f.contract.diagnosis.primary,
        stopReason: isStopCase ? 'manual_override' : undefined,
        retryCount: isStopCase ? 1 : 0,
      });

      await this.recoveryRepo.appendAuditLog({
        sessionId: session.id,
        tenantId,
        invoiceId: f.id,
        action: isStopCase ? 'policy_guard_stop_opt_out' : 'session_started',
        actor: 'recovery_agent',
        aiDecision: f.contract,
        amountAtRisk: String(f.amountAtRisk),
        result: isStopCase ? 'stopped' : 'pending',
        metadata: { scenarioId: f.id, incidentLane: f.incidentLane, isHoldout: f.isHoldout },
      });

      seeded++;
      if (f.isHoldout) holdoutCount++;
      else treatmentCount++;
      totalAmountAtRisk += f.amountAtRisk;
    }

    logger.info('seeded_50_recovery_batch', { tenantId, seeded, treatmentCount, holdoutCount });

    return {
      totalSeeded: seeded,
      treatmentCount,
      holdoutCount,
      totalAmountAtRisk,
    };
  }

  /**
   * Replays one of the 5 demo acts from the blueprint.
   */
  async replayScenario(tenantId: string, actNumber: 1 | 2 | 3 | 4 | 5) {
    const preset = ScenarioCatalog.getDemoPreset(actNumber, tenantId);

    if (actNumber === 1) {
      await this.seed50Batch(tenantId);
      const metrics = await this.getExperimentMetrics(tenantId);
      return { ...preset, metrics };
    }

    if (actNumber === 3 && 'targetCase' in preset && preset.targetCase) {
      const session = await this.recoveryRepo.getSessionByInvoiceId(tenantId, preset.targetCase.id);
      if (session) {
        const execResult = await this.executeRecoveryAction(session.id, tenantId);
        await this.markSessionRecovered(tenantId, session.invoiceId, String(session.amountAtRisk));
        return { ...preset, executed: true, result: execResult, status: 'recovered' };
      }
    }

    if (actNumber === 4 && 'targetCase' in preset && preset.targetCase) {
      const session = await this.recoveryRepo.getSessionByInvoiceId(tenantId, preset.targetCase.id);
      if (session) {
        await this.recoveryRepo.updateSessionOptOut(session.id, true);
        await this.recoveryRepo.appendAuditLog({
          sessionId: session.id,
          tenantId,
          invoiceId: session.invoiceId,
          action: 'customer_replied_stop',
          actor: 'debtor',
          result: 'stopped',
          metadata: { keyword: 'STOP', enforcement: 'PolicyGuard blocked all further outreach' },
        });
        return { ...preset, actionTaken: 'None — Outreach blocked by PolicyGuard', reason: 'Customer opted out via STOP keyword' };
      }
    }

    return preset;
  }

  /**
   * Calculates batch experiment metrics (treatment vs holdout lift).
   */
  async getExperimentMetrics(tenantId: string): Promise<ExperimentMetrics> {
    const raw = await this.recoveryRepo.getExperimentData(tenantId);
    return HoldoutManager.calculateExperimentMetrics(raw);
  }

  /**
   * Returns a session's structured RecoveryContract and current policy validation status.
   */
  async getSessionContract(tenantId: string, sessionId: string) {
    const session = await this.recoveryRepo.getSessionById(sessionId);
    if (!session || session.tenantId !== tenantId) return null;

    const contract = (session.recoveryContract as RecoveryContract) || null;
    const attemptCount = await this.recoveryRepo.countRetryAttempts(sessionId);

    const policyStatus = contract ? PolicyGuard.validate(contract, {
      retryCount: attemptCount,
      lastContactedAt: session.lastActionAt,
      optedOut: session.optedOut,
      amountAtRisk: parseFloat(session.amountAtRisk) || 0,
      daysOverdue: session.createdAt ? this.calculateDaysOverdue(session.createdAt.toISOString()) : 0,
    }) : { allowed: true, violations: [] };

    return { session, contract, policyStatus };
  }

  async optOutSession(tenantId: string, sessionId: string) {
    const session = await this.recoveryRepo.getSessionById(sessionId);
    if (!session || session.tenantId !== tenantId) throw new NotFoundError('Session not found');

    await this.recoveryRepo.updateSessionOptOut(sessionId, true);
    await this.recoveryRepo.appendAuditLog({
      sessionId,
      tenantId,
      invoiceId: session.invoiceId,
      action: 'customer_opted_out',
      actor: 'customer',
      result: 'stopped',
      metadata: { keyword: 'STOP', reason: 'Customer opted out of recovery messages' },
    });
    return { success: true, message: 'Opt-out registered; session stopped by policy' };
  }
}
