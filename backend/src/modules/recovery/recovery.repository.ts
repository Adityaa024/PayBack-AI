import type { DatabaseClient } from '../../db/index.js';
import {
  recoverySessions,
  paymentRetryAttempts,
  promiseToPay,
  checkoutAbandonmentSignals,
  recoveryAuditLog,
  type NewRecoverySession,
  type NewPaymentRetryAttempt,
  type NewPromiseToPay,
  type NewCheckoutAbandonmentSignal,
  type NewRecoveryAuditLog,
  type RecoverySession,
  type PromiseToPay,
  type RecoveryAuditLog,
  type CheckoutAbandonmentSignal,
} from '../../db/schema.js';
import { eq, and, desc, sql, isNull, isNotNull, lt, lte, or, ne } from 'drizzle-orm';
import { logger } from '../../shared/logger.js';
import crypto from 'crypto';

export class RecoveryRepository {
  private memSessions = new Map<string, RecoverySession>();
  private memAudit: RecoveryAuditLog[] = [];
  private memPTPs = new Map<string, PromiseToPay>();
  private memSignals: CheckoutAbandonmentSignal[] = [];

  constructor(private readonly db: DatabaseClient) {}

  // ─── Recovery Sessions ────────────────────────────────────────────────────

  async createSession(data: NewRecoverySession): Promise<RecoverySession> {
    try {
      const [row] = await this.db
        .insert(recoverySessions)
        .values(data)
        .returning();
      if (row) {
        this.memSessions.set(row.id, row);
        return row;
      }
    } catch (err) {
      logger.warn('recovery_repo_db_offline_fallback', { action: 'createSession' });
    }

    const fallbackSession: RecoverySession = {
      id: data.id || `sess_${crypto.randomUUID()}`,
      tenantId: data.tenantId,
      invoiceId: data.invoiceId,
      status: data.status || 'active',
      strategy: data.strategy || 'payment_link_refresh',
      incidentLane: data.incidentLane || 'payment_degradation',
      isHoldout: data.isHoldout || false,
      recoveryContract: data.recoveryContract || null,
      voiceScriptHinglish: data.voiceScriptHinglish || null,
      optedOut: data.optedOut || false,
      amountAtRisk: data.amountAtRisk,
      amountRecovered: data.amountRecovered || '0',
      currency: data.currency || 'INR',
      aiConfidence: data.aiConfidence || '0.85',
      aiReasoning: data.aiReasoning || null,
      stopReason: data.stopReason || null,
      retryCount: data.retryCount || 0,
      lastActionAt: null,
      lockedAt: null,
      resolvedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.memSessions.set(fallbackSession.id, fallbackSession);
    return fallbackSession;
  }

  async getSessionByInvoiceId(tenantId: string, invoiceId: string): Promise<RecoverySession | null> {
    try {
      const rows = await this.db
        .select()
        .from(recoverySessions)
        .where(
          and(
            eq(recoverySessions.tenantId, tenantId),
            eq(recoverySessions.invoiceId, invoiceId),
            eq(recoverySessions.status, 'active')
          )
        )
        .limit(1);
      if (rows[0]) return rows[0];
    } catch {
      // fallback
    }

    const mem = Array.from(this.memSessions.values()).find(
      (s) => s.tenantId === tenantId && s.invoiceId === invoiceId && s.status === 'active'
    );
    return mem ?? null;
  }

  async getSessionById(sessionId: string): Promise<RecoverySession | null> {
    try {
      const rows = await this.db
        .select()
        .from(recoverySessions)
        .where(eq(recoverySessions.id, sessionId))
        .limit(1);
      if (rows[0]) return rows[0];
    } catch {
      // fallback
    }
    return this.memSessions.get(sessionId) ?? null;
  }

  async getActiveSessions(tenantId: string): Promise<RecoverySession[]> {
    try {
      const rows = await this.db
        .select()
        .from(recoverySessions)
        .where(
          and(
            eq(recoverySessions.tenantId, tenantId),
            eq(recoverySessions.status, 'active')
          )
        )
        .orderBy(desc(recoverySessions.createdAt));
      if (rows.length > 0) return rows;
    } catch {
      // fallback
    }

    return Array.from(this.memSessions.values())
      .filter((s) => s.tenantId === tenantId && s.status === 'active')
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async getAllSessions(tenantId: string, limit = 50): Promise<RecoverySession[]> {
    try {
      const rows = await this.db
        .select()
        .from(recoverySessions)
        .where(eq(recoverySessions.tenantId, tenantId))
        .orderBy(desc(recoverySessions.createdAt))
        .limit(limit);
      if (rows.length > 0) return rows;
    } catch {
      // fallback
    }

    return Array.from(this.memSessions.values())
      .filter((s) => s.tenantId === tenantId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }

  async updateSessionStatus(
    sessionId: string,
    status: 'active' | 'recovered' | 'stopped' | 'escalated',
    extra?: {
      amountRecovered?: string;
      stopReason?: string | null;
      resolvedAt?: Date;
    }
  ): Promise<void> {
    try {
      await this.db
        .update(recoverySessions)
        .set({
          status,
          ...(extra?.amountRecovered !== undefined ? { amountRecovered: extra.amountRecovered } : {}),
          ...(extra?.stopReason !== undefined ? { stopReason: extra.stopReason as any } : {}),
          ...(extra?.resolvedAt ? { resolvedAt: extra.resolvedAt } : {}),
          updatedAt: new Date(),
        })
        .where(eq(recoverySessions.id, sessionId));
    } catch (err) {
      logger.error('updateSessionStatus failed', { sessionId, error: err });
    }

    const mem = this.memSessions.get(sessionId);
    if (mem) {
      mem.status = status;
      if (extra?.amountRecovered !== undefined) mem.amountRecovered = extra.amountRecovered;
      if (extra?.stopReason !== undefined) mem.stopReason = extra.stopReason as any;
      if (extra?.resolvedAt) mem.resolvedAt = extra.resolvedAt;
      mem.updatedAt = new Date();
    }
  }

  async markSessionRecoveredAtomic(tenantId: string, invoiceId: string, amount: string): Promise<RecoverySession | null> {
    try {
      const [row] = await this.db
        .update(recoverySessions)
        .set({
          status: 'recovered',
          amountRecovered: amount,
          resolvedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(recoverySessions.tenantId, tenantId),
            eq(recoverySessions.invoiceId, invoiceId),
            ne(recoverySessions.status, 'recovered')
          )
        )
        .returning();
      if (row) {
        this.memSessions.set(row.id, row);
        return row;
      }
    } catch (err) {
      logger.error('markSessionRecoveredAtomic failed', { tenantId, invoiceId, error: err });
    }
    return null;
  }

  async acquireSessionLock(sessionId: string, timeoutMinutes = 15): Promise<boolean> {
    const threshold = new Date(Date.now() - timeoutMinutes * 60 * 1000);
    try {
      const rows = await this.db
        .update(recoverySessions)
        .set({ lockedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(recoverySessions.id, sessionId),
            eq(recoverySessions.status, 'active'),
            or(isNull(recoverySessions.lockedAt), lte(recoverySessions.lockedAt, threshold))
          )
        )
        .returning({ id: recoverySessions.id });
      return rows.length > 0;
    } catch {
      return false;
    }
  }

  async releaseSessionLock(sessionId: string): Promise<void> {
    try {
      await this.db
        .update(recoverySessions)
        .set({ lockedAt: null, updatedAt: new Date() })
        .where(eq(recoverySessions.id, sessionId));
    } catch {
      // fallback
    }
  }

  async getStaleLockedSessions(staleMinutes = 15): Promise<RecoverySession[]> {
    const threshold = new Date(Date.now() - staleMinutes * 60 * 1000);
    try {
      return await this.db
        .select()
        .from(recoverySessions)
        .where(
          and(
            eq(recoverySessions.status, 'active'),
            isNotNull(recoverySessions.lockedAt),
            lte(recoverySessions.lockedAt, threshold)
          )
        );
    } catch {
      return [];
    }
  }

  async incrementRetryCount(sessionId: string): Promise<void> {
    try {
      await this.db
        .update(recoverySessions)
        .set({
          retryCount: sql`${recoverySessions.retryCount} + 1`,
          lastActionAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(recoverySessions.id, sessionId));
    } catch {
      // fallback
    }

    const mem = this.memSessions.get(sessionId);
    if (mem) {
      mem.retryCount = (mem.retryCount || 0) + 1;
      mem.lastActionAt = new Date();
      mem.updatedAt = new Date();
    }
  }

  /** Returns aggregate recovery stats for a tenant */
  async getRecoveryStats(tenantId: string): Promise<{
    totalAtRisk: string;
    totalRecovered: string;
    activeSessions: number;
    recoveredSessions: number;
    stoppedSessions: number;
  }> {
    try {
      const result = await this.db.execute(sql`
        SELECT
          COALESCE(SUM(amount_at_risk), 0)::text AS total_at_risk,
          COALESCE(SUM(amount_recovered), 0)::text AS total_recovered,
          COUNT(*) FILTER (WHERE status = 'active') AS active_sessions,
          COUNT(*) FILTER (WHERE status = 'recovered') AS recovered_sessions,
          COUNT(*) FILTER (WHERE status = 'stopped' OR status = 'escalated') AS stopped_sessions
        FROM recovery_sessions
        WHERE tenant_id = ${tenantId}
      `);
      const resultAny = result as any;
      const row = resultAny?.rows?.[0] ?? (Array.isArray(resultAny) ? resultAny[0] : {}) ?? {};
      if (row.total_at_risk !== undefined && row.total_at_risk !== null) {
        return {
          totalAtRisk: String(row.total_at_risk ?? '0'),
          totalRecovered: String(row.total_recovered ?? '0'),
          activeSessions: Number(row.active_sessions ?? 0),
          recoveredSessions: Number(row.recovered_sessions ?? 0),
          stoppedSessions: Number(row.stopped_sessions ?? 0),
        };
      }
    } catch {
      // fallback
    }

    const sessions = Array.from(this.memSessions.values()).filter((s) => s.tenantId === tenantId);
    const totalAtRisk = sessions.reduce((acc, s) => acc + (parseFloat(s.amountAtRisk) || 0), 0);
    const totalRecovered = sessions.reduce((acc, s) => acc + (parseFloat(s.amountRecovered) || 0), 0);
    const activeSessions = sessions.filter((s) => s.status === 'active').length;
    const recoveredSessions = sessions.filter((s) => s.status === 'recovered').length;
    const stoppedSessions = sessions.filter((s) => s.status === 'stopped' || s.status === 'escalated').length;

    return {
      totalAtRisk: String(totalAtRisk),
      totalRecovered: String(totalRecovered),
      activeSessions,
      recoveredSessions,
      stoppedSessions,
    };
  }

  async getExperimentData(tenantId: string) {
    try {
      const result = await this.db.execute(sql`
        SELECT
          COALESCE(SUM(amount_at_risk) FILTER (WHERE is_holdout = false), 0)::text AS treatment_eligible,
          COALESCE(SUM(amount_recovered) FILTER (WHERE is_holdout = false), 0)::text AS treatment_recovered,
          COUNT(*) FILTER (WHERE is_holdout = false) AS treatment_cases,
          COALESCE(SUM(amount_at_risk) FILTER (WHERE is_holdout = true), 0)::text AS holdout_eligible,
          COALESCE(SUM(amount_recovered) FILTER (WHERE is_holdout = true), 0)::text AS holdout_recovered,
          COUNT(*) FILTER (WHERE is_holdout = true) AS holdout_cases,
          COALESCE(SUM(retry_count), 0) AS outbound_contacts,
          COUNT(*) FILTER (WHERE opted_out = true) AS opt_outs
        FROM recovery_sessions
        WHERE tenant_id = ${tenantId}
      `);
      const resultAny = result as any;
      const row = resultAny?.rows?.[0] ?? (Array.isArray(resultAny) ? resultAny[0] : {}) ?? {};
      if (row.treatment_cases !== undefined) {
        return {
          treatmentEligible: parseFloat(row.treatment_eligible ?? 0),
          treatmentRecovered: parseFloat(row.treatment_recovered ?? 0),
          treatmentCases: Number(row.treatment_cases ?? 0),
          holdoutEligible: parseFloat(row.holdout_eligible ?? 0),
          holdoutRecovered: parseFloat(row.holdout_recovered ?? 0),
          holdoutCases: Number(row.holdout_cases ?? 0),
          outboundContacts: Number(row.outbound_contacts ?? 0),
          optOuts: Number(row.opt_outs ?? 0),
        };
      }
    } catch {
      // fallback
    }

    const sessions = Array.from(this.memSessions.values()).filter((s) => s.tenantId === tenantId);
    const treatments = sessions.filter((s) => !s.isHoldout);
    const holdouts = sessions.filter((s) => s.isHoldout);

    const treatmentEligible = treatments.reduce((acc, s) => acc + (parseFloat(s.amountAtRisk) || 0), 0);
    const treatmentRecovered = treatments.reduce((acc, s) => acc + (parseFloat(s.amountRecovered) || 0), 0);
    const holdoutEligible = holdouts.reduce((acc, s) => acc + (parseFloat(s.amountAtRisk) || 0), 0);
    const holdoutRecovered = holdouts.reduce((acc, s) => acc + (parseFloat(s.amountRecovered) || 0), 0);
    const outboundContacts = sessions.reduce((acc, s) => acc + (s.retryCount || 0), 0);
    const optOuts = sessions.filter((s) => s.optedOut).length;

    return {
      treatmentEligible,
      treatmentRecovered,
      treatmentCases: treatments.length,
      holdoutEligible,
      holdoutRecovered,
      holdoutCases: holdouts.length,
      outboundContacts,
      optOuts,
    };
  }

  async updateSessionContract(sessionId: string, contract: any, voiceScriptHinglish?: string): Promise<void> {
    try {
      await this.db
        .update(recoverySessions)
        .set({
          recoveryContract: contract,
          ...(voiceScriptHinglish ? { voiceScriptHinglish } : {}),
          updatedAt: new Date(),
        })
        .where(eq(recoverySessions.id, sessionId));
    } catch {
      // fallback
    }

    const mem = this.memSessions.get(sessionId);
    if (mem) {
      mem.recoveryContract = contract;
      if (voiceScriptHinglish) mem.voiceScriptHinglish = voiceScriptHinglish;
      mem.updatedAt = new Date();
    }
  }

  async updateSessionOptOut(sessionId: string, optedOut: boolean): Promise<void> {
    try {
      await this.db
        .update(recoverySessions)
        .set({
          optedOut,
          status: 'stopped',
          stopReason: 'manual_override',
          updatedAt: new Date(),
        })
        .where(eq(recoverySessions.id, sessionId));
    } catch {
      // fallback
    }

    const mem = this.memSessions.get(sessionId);
    if (mem) {
      mem.optedOut = optedOut;
      mem.status = 'stopped';
      mem.stopReason = 'manual_override';
      mem.updatedAt = new Date();
    }
  }

  // ─── Payment Retry Attempts ───────────────────────────────────────────────

  async recordRetryAttempt(data: NewPaymentRetryAttempt): Promise<void> {
    try {
      await this.db.insert(paymentRetryAttempts).values(data);
    } catch (err: any) {
      const code = err?.code || err?.cause?.code;
      if (code === '23505') {
        const error = new Error('Duplicate payment retry attempt rejected by database unique constraint');
        (error as any).code = '23505';
        (error as any).cause = err;
        throw error;
      }
      logger.warn('record_retry_attempt_failed', { error: err });
    }
  }

  async createRetryAttempt(data: NewPaymentRetryAttempt): Promise<void> {
    return this.recordRetryAttempt(data);
  }

  async countRetryAttempts(sessionId: string): Promise<number> {
    try {
      const rows = await this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(paymentRetryAttempts)
        .where(eq(paymentRetryAttempts.sessionId, sessionId));
      if (rows[0]) return rows[0].count;
    } catch {
      // fallback
    }

    const session = this.memSessions.get(sessionId);
    return session?.retryCount || 0;
  }

  // ─── Audit Log ────────────────────────────────────────────────────────────

  async appendAuditLog(data: NewRecoveryAuditLog): Promise<RecoveryAuditLog> {
    let previousHash: string | null = null;
    try {
      const [latest] = await this.db
        .select({ hash: recoveryAuditLog.hash })
        .from(recoveryAuditLog)
        .where(eq(recoveryAuditLog.tenantId, data.tenantId))
        .orderBy(desc(recoveryAuditLog.createdAt))
        .limit(1);
      if (latest && latest.hash) {
        previousHash = latest.hash;
      }
    } catch {
      const latestMem = this.memAudit.filter(a => a.tenantId === data.tenantId)[0];
      if (latestMem?.hash) {
        previousHash = latestMem.hash;
      }
    }

    const payloadString = JSON.stringify({
      sessionId: data.sessionId,
      tenantId: data.tenantId,
      invoiceId: data.invoiceId,
      action: data.action,
      actor: data.actor || 'system',
      result: data.result || 'success',
      amountAtRisk: data.amountAtRisk,
    });
    
    const hashData = (previousHash || 'GENESIS') + '|' + payloadString;
    const currentHash = crypto.createHash('sha256').update(hashData).digest('hex');

    const entry: RecoveryAuditLog = {
      id: data.id || crypto.randomUUID(),
      sessionId: data.sessionId,
      tenantId: data.tenantId,
      invoiceId: data.invoiceId,
      action: data.action || 'policy_validation',
      actor: data.actor || 'system',
      aiDecision: data.aiDecision ?? null,
      razorpayRef: data.razorpayRef ?? null,
      amountAtRisk: data.amountAtRisk ?? null,
      result: data.result || 'success',
      previousHash: previousHash,
      hash: currentHash,
      metadata: data.metadata ?? null,
      idempotencyKey: (data as any).idempotencyKey ?? null,
      createdAt: new Date(),
    };

    try {
      const [row] = await this.db
        .insert(recoveryAuditLog)
        .values({
            ...data,
            id: entry.id,
            previousHash,
            hash: currentHash,
            idempotencyKey: (data as any).idempotencyKey ?? null
        })
        .returning();
      if (row) {
        this.memAudit.unshift(row);
        return row;
      }
    } catch (err: unknown) {
      // Catch unique constraint violation and return gracefully
      if (err && typeof err === 'object' && 'code' in err && (err as any).code === '23505') {
        logger.info('Duplicate audit log suppressed by unique constraint', { idempotencyKey: (data as any).idempotencyKey });
        return entry; // Return entry silently (already processed)
      }
      logger.error('Failed to append audit log to DB', { error: err });
    }

    this.memAudit.unshift(entry);
    return entry;
  }

  async getAuditLog(sessionId: string): Promise<RecoveryAuditLog[]> {
    try {
      const rows = await this.db
        .select()
        .from(recoveryAuditLog)
        .where(eq(recoveryAuditLog.sessionId, sessionId))
        .orderBy(desc(recoveryAuditLog.createdAt));
      if (rows.length > 0) return rows;
    } catch {
      // fallback
    }

    return this.memAudit.filter((a) => a.sessionId === sessionId);
  }

  async getRecentAuditLog(tenantId: string, limit = 20): Promise<RecoveryAuditLog[]> {
    try {
      const rows = await this.db
        .select()
        .from(recoveryAuditLog)
        .where(eq(recoveryAuditLog.tenantId, tenantId))
        .orderBy(desc(recoveryAuditLog.createdAt))
        .limit(limit);
      if (rows.length > 0) return rows;
    } catch {
      // fallback
    }

    return this.memAudit.filter((a) => a.tenantId === tenantId).slice(0, limit);
  }

  // ─── Promise to Pay ───────────────────────────────────────────────────────

  async createPTP(data: NewPromiseToPay): Promise<PromiseToPay> {
    try {
      const [row] = await this.db
        .insert(promiseToPay)
        .values(data)
        .returning();
      if (row) {
        this.memPTPs.set(row.id, row);
        return row;
      }
    } catch {
      // fallback
    }

    const fallback: PromiseToPay = {
      id: data.id || `ptp_${crypto.randomUUID()}`,
      tenantId: data.tenantId,
      invoiceId: data.invoiceId,
      sessionId: data.sessionId ?? null,
      detectedFromCommunicationId: data.detectedFromCommunicationId ?? null,
      promisedAmount: data.promisedAmount ?? null,
      promisedDate: data.promisedDate ?? null,
      currency: data.currency || 'INR',
      status: data.status || 'pending',
      brokenCount: data.brokenCount || 0,
      aiExtractedText: data.aiExtractedText ?? null,
      aiConfidence: data.aiConfidence ?? null,
      checkedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.memPTPs.set(fallback.id, fallback);
    return fallback;
  }

  async getPTPByInvoice(tenantId: string, invoiceId: string): Promise<PromiseToPay[]> {
    try {
      const rows = await this.db
        .select()
        .from(promiseToPay)
        .where(
          and(
            eq(promiseToPay.tenantId, tenantId),
            eq(promiseToPay.invoiceId, invoiceId)
          )
        );
      if (rows.length > 0) return rows;
    } catch {
      // fallback
    }

    return Array.from(this.memPTPs.values()).filter(
      (p) => p.tenantId === tenantId && p.invoiceId === invoiceId
    );
  }

  async getAllPTPs(tenantId: string): Promise<PromiseToPay[]> {
    try {
      const rows = await this.db
        .select()
        .from(promiseToPay)
        .where(eq(promiseToPay.tenantId, tenantId))
        .orderBy(desc(promiseToPay.createdAt));
      if (rows.length > 0) return rows;
    } catch {
      // fallback
    }

    return Array.from(this.memPTPs.values()).filter((p) => p.tenantId === tenantId);
  }

  async getOverduePendingPTPs(): Promise<PromiseToPay[]> {
    try {
      return await this.db
        .select()
        .from(promiseToPay)
        .where(
          and(
            eq(promiseToPay.status, 'pending'),
            lt(promiseToPay.promisedDate, new Date().toISOString().slice(0, 10))
          )
        );
    } catch {
      return [];
    }
  }

  async getOverduePTPs(): Promise<PromiseToPay[]> {
    return this.getOverduePendingPTPs();
  }

  async updatePTPStatus(
    ptpId: string,
    status: 'pending' | 'kept' | 'broken' | 'escalated',
    extra?: { brokenCount?: number } | Date
  ): Promise<void> {
    const brokenCount = typeof extra === 'object' && extra && 'brokenCount' in extra ? extra.brokenCount : undefined;
    const checkedAt = extra instanceof Date ? extra : new Date();

    try {
      await this.db
        .update(promiseToPay)
        .set({
          status,
          ...(brokenCount !== undefined ? { brokenCount } : {}),
          checkedAt,
        })
        .where(eq(promiseToPay.id, ptpId));
    } catch {
      // fallback
    }

    const mem = this.memPTPs.get(ptpId);
    if (mem) {
      mem.status = status;
      if (brokenCount !== undefined) mem.brokenCount = brokenCount;
      mem.checkedAt = checkedAt;
    }
  }

  // ─── Checkout Abandonment Signals ─────────────────────────────────────────

  async createAbandonmentSignal(data: NewCheckoutAbandonmentSignal): Promise<CheckoutAbandonmentSignal> {
    try {
      const [row] = await this.db
        .insert(checkoutAbandonmentSignals)
        .values(data)
        .returning();
      if (row) {
        this.memSignals.push(row);
        return row;
      }
    } catch {
      // fallback
    }

    const fallback: CheckoutAbandonmentSignal = {
      id: data.id || `sig_${crypto.randomUUID()}`,
      tenantId: data.tenantId,
      invoiceId: data.invoiceId,
      portalViewedAt: new Date(),
      recoveryTriggered: false,
      recoveryTriggeredAt: null,
      sessionId: null,
      createdAt: new Date(),
    };
    this.memSignals.push(fallback);
    return fallback;
  }

  async getUntriggeredAbandonmentSignals(
    tenantId: string,
    olderThanMinutes = 30
  ): Promise<CheckoutAbandonmentSignal[]> {
    try {
      const threshold = new Date(Date.now() - olderThanMinutes * 60 * 1000);
      return await this.db
        .select()
        .from(checkoutAbandonmentSignals)
        .where(
          and(
            eq(checkoutAbandonmentSignals.tenantId, tenantId),
            eq(checkoutAbandonmentSignals.recoveryTriggered, false),
            lte(checkoutAbandonmentSignals.portalViewedAt, threshold)
          )
        );
    } catch {
      return [];
    }
  }

  async getAllUntriggeredAbandonments(
    olderThanMinutes = 30
  ): Promise<CheckoutAbandonmentSignal[]> {
    try {
      const threshold = new Date(Date.now() - olderThanMinutes * 60 * 1000);
      return await this.db
        .select()
        .from(checkoutAbandonmentSignals)
        .where(
          and(
            eq(checkoutAbandonmentSignals.recoveryTriggered, false),
            lte(checkoutAbandonmentSignals.portalViewedAt, threshold)
          )
        );
    } catch {
      return [];
    }
  }

  async markAbandonmentTriggered(signalId: string, sessionId: string): Promise<void> {
    try {
      await this.db
        .update(checkoutAbandonmentSignals)
        .set({
          recoveryTriggered: true,
          recoveryTriggeredAt: new Date(),
          sessionId,
        })
        .where(eq(checkoutAbandonmentSignals.id, signalId));
    } catch {
      // fallback
    }

    const sig = this.memSignals.find((s) => s.id === signalId);
    if (sig) {
      sig.recoveryTriggered = true;
      sig.recoveryTriggeredAt = new Date();
      sig.sessionId = sessionId;
    }
  }

  // ─── Hackathon Demo Reset ─────────────────────────────────────────────────

  async resetDemo(tenantId: string): Promise<void> {
    try {
      await this.db.delete(recoveryAuditLog).where(eq(recoveryAuditLog.tenantId, tenantId));
      await this.db.delete(paymentRetryAttempts).where(
        sql`session_id IN (SELECT id FROM recovery_sessions WHERE tenant_id = ${tenantId})`
      );
      await this.db.delete(promiseToPay).where(eq(promiseToPay.tenantId, tenantId));
      await this.db.delete(recoverySessions).where(eq(recoverySessions.tenantId, tenantId));
      await this.db.delete(checkoutAbandonmentSignals).where(eq(checkoutAbandonmentSignals.tenantId, tenantId));
    } catch {
      // fallback
    }

    // Clear memory
    for (const [id, s] of this.memSessions.entries()) {
      if (s.tenantId === tenantId) this.memSessions.delete(id);
    }
    this.memAudit = this.memAudit.filter((a) => a.tenantId !== tenantId);
    for (const [id, p] of this.memPTPs.entries()) {
      if (p.tenantId === tenantId) this.memPTPs.delete(id);
    }
    this.memSignals = this.memSignals.filter((s) => s.tenantId !== tenantId);
  }
}
