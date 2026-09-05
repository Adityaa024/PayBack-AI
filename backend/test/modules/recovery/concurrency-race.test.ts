import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import crypto from 'crypto';
import { eq, inArray, asc } from 'drizzle-orm';
import { createDatabaseClient } from '../../../src/db/index.js';
import { config } from '../../../src/config/env.js';
import {
  tenants,
  invoices,
  recoverySessions,
  paymentRetryAttempts,
  recoveryAuditLog,
  paymentWebhookEvents,
  invoicePaymentLinks,
} from '../../../src/db/schema.js';
import { RecoveryRepository } from '../../../src/modules/recovery/recovery.repository.js';
import { RecoveryService } from '../../../src/modules/recovery/recovery.service.js';
import { PaymentRepository } from '../../../src/modules/payment/payment.repository.js';
import { PaymentService } from '../../../src/modules/payment/payment.service.js';
import { InvoiceRepository } from '../../../src/modules/invoice/invoice.repository.js';
import { EventRepository } from '../../../src/modules/event/event.repository.js';
import { EventService } from '../../../src/modules/event/event.service.js';
import { PaymentGatewayFactory } from '../../../src/modules/payment/gateway.factory.js';
import { RazorpayAdapter } from '../../../src/modules/payment/adapters/razorpay.adapter.js';

describe('Adversarial Concurrency Race & Atomic Ledger Verification', () => {
  let db: any;
  let recoveryRepo: RecoveryRepository;
  let paymentRepo: PaymentRepository;
  let invoiceRepo: InvoiceRepository;
  let eventRepo: EventRepository;
  let eventService: EventService;
  let paymentService: PaymentService;
  let recoveryService: RecoveryService;

  let testTenantId: string;
  let testInvoiceId: string;
  const createdTenantIds: string[] = [];
  const createdInvoiceIds: string[] = [];
  const createdSessionIds: string[] = [];
  const WEBHOOK_SECRET = 'adversarial_webhook_secret_key_98765';

  beforeAll(async () => {
    db = createDatabaseClient({ connectionString: config.DATABASE_URL });
    recoveryRepo = new RecoveryRepository(db);
    paymentRepo = new PaymentRepository(db);
    eventRepo = new EventRepository(db);
    eventService = new EventService(eventRepo);
    invoiceRepo = new InvoiceRepository(db, eventService);

    const gatewayFactory = new PaymentGatewayFactory();
    gatewayFactory.register(new RazorpayAdapter());

    const mockIntegrationService: any = {
      getDecryptedRazorpayConfig: vi.fn().mockResolvedValue({
        keyId: 'rzp_test_key_id',
        keySecret: 'rzp_test_key_secret',
        webhookSecret: WEBHOOK_SECRET,
      }),
    };

    const mockSettingsRepo: any = {
      findByTenant: vi.fn().mockResolvedValue({}),
    };

    const mockAiClient: any = {
      callRecoveryAgent: vi.fn().mockResolvedValue({
        strategy: 'payment_link_refresh',
        confidence: 0.95,
        reasoning: 'Testing adversarial concurrency race',
      }),
    };

    const mockCommService: any = {
      sendEmail: vi.fn().mockResolvedValue(undefined),
    };

    paymentService = new PaymentService(
      paymentRepo,
      invoiceRepo,
      mockIntegrationService,
      gatewayFactory,
      mockSettingsRepo,
      eventRepo
    );

    recoveryService = new RecoveryService(
      recoveryRepo,
      mockAiClient,
      invoiceRepo,
      paymentService,
      mockCommService,
      eventService
    );

    paymentService.setRecoveryService(recoveryService);
  });

  afterAll(async () => {
    try {
      if (createdSessionIds.length > 0) {
        await db.delete(paymentRetryAttempts).where(inArray(paymentRetryAttempts.sessionId, createdSessionIds));
        await db.delete(recoveryAuditLog).where(inArray(recoveryAuditLog.sessionId, createdSessionIds));
        await db.delete(recoverySessions).where(inArray(recoverySessions.id, createdSessionIds));
      }
      if (createdInvoiceIds.length > 0) {
        await db.delete(invoicePaymentLinks).where(inArray(invoicePaymentLinks.invoiceId, createdInvoiceIds));
        await db.delete(paymentWebhookEvents).where(inArray(paymentWebhookEvents.invoiceId, createdInvoiceIds));
        await db.delete(invoices).where(inArray(invoices.id, createdInvoiceIds));
      }
      if (createdTenantIds.length > 0) {
        await db.delete(tenants).where(inArray(tenants.id, createdTenantIds));
      }
    } catch {
      // Best-effort cleanup
    }

    if (db?.$pool) {
      await db.$pool.end();
    }
  });

  beforeEach(async () => {
    testTenantId = crypto.randomUUID();
    testInvoiceId = crypto.randomUUID();
    createdTenantIds.push(testTenantId);
    createdInvoiceIds.push(testInvoiceId);

    // Seed tenant
    await db.insert(tenants).values({
      id: testTenantId,
      name: `Race Tenant ${testTenantId.slice(0, 8)}`,
      slug: `race-tenant-${testTenantId.slice(0, 8)}`,
    });

    // Seed invoice for ₹750.00
    await db.insert(invoices).values({
      id: testInvoiceId,
      tenantId: testTenantId,
      invoiceNo: `INV-RACE-${testInvoiceId.slice(0, 8)}`,
      clientName: 'Race Condition Customer',
      invoiceAmount: '750.00',
      currency: 'INR',
      dueDate: new Date().toISOString().split('T')[0],
      contactEmail: 'race@example.com',
      paymentStatus: 'Pending',
    });
  });

  // ─── Test 1: Duplicate Identical Webhooks (10 Concurrent Calls) ────────────
  describe('Adversarial Concurrency 1: Duplicate Identical Webhooks (10 simultaneous dispatches)', () => {
    it('fires 10 identical webhook deliveries concurrently via Promise.all — exactly 1 succeeds and 9 are rejected/ignored', async () => {
      const [session] = await db.insert(recoverySessions).values({
        tenantId: testTenantId,
        invoiceId: testInvoiceId,
        status: 'active',
        strategy: 'payment_link_refresh',
        incidentLane: 'payment_degradation',
        amountAtRisk: '750.00',
        amountRecovered: '0',
        currency: 'INR',
        retryCount: 0,
      }).returning();
      createdSessionIds.push(session.id);

      const eventId = `evt_race_${crypto.randomUUID().slice(0, 8)}`;
      const paymentId = `pay_race_${crypto.randomUUID().slice(0, 8)}`;
      const payload = {
        entity: 'event',
        account_id: 'acc_race123',
        event: 'payment.captured',
        event_id: eventId,
        contains: ['payment'],
        payload: {
          payment: {
            entity: {
              id: paymentId,
              amount: 75000, // 750.00 INR in paise
              currency: 'INR',
              status: 'captured',
              notes: {
                invoice_id: testInvoiceId,
              },
            },
          },
        },
        created_at: Math.floor(Date.now() / 1000),
      };

      const rawBody = Buffer.from(JSON.stringify(payload));
      const signature = crypto.createHmac('sha256', WEBHOOK_SECRET).update(rawBody).digest('hex');

      // 10 identical webhooks fired simultaneously
      const results = await Promise.all(
        Array.from({ length: 10 }).map(() =>
          paymentService.processPaymentCaptured(testTenantId, 'razorpay', payload as any, rawBody, signature)
        )
      );

      const processedCount = results.filter((r) => r.status === 'processed').length;
      const ignoredCount = results.filter((r) => r.status === 'ignored').length;

      expect(processedCount).toBe(1);
      expect(ignoredCount).toBe(9);

      // Verify DB state
      const [updatedInvoice] = await db.select().from(invoices).where(eq(invoices.id, testInvoiceId));
      expect(updatedInvoice.paymentStatus).toBe('Paid');

      const [updatedSession] = await db.select().from(recoverySessions).where(eq(recoverySessions.id, session.id));
      expect(updatedSession.status).toBe('recovered');
      expect(Number(updatedSession.amountRecovered)).toBe(750);

      // Exactly 1 recovery audit log
      const auditLogs = await db.select().from(recoveryAuditLog).where(eq(recoveryAuditLog.sessionId, session.id));
      const recoveryAuditEntries = auditLogs.filter((l: any) => l.action === 'invoice_paid_recovered');
      expect(recoveryAuditEntries.length).toBe(1);
      expect(recoveryAuditEntries[0].result).toBe('succeeded');
    });
  });

  // ─── Test 2: Atomic Audit-Log Append (Cryptographic Hash Chain) ────────────
  describe('Adversarial Concurrency 2: Concurrent Audit-Log Appends (Hash-Chain Linearity)', () => {
    it('fires multiple concurrent appendAuditLog calls via Promise.all and proves the chain is 100% unbroken', async () => {
      const [session] = await db.insert(recoverySessions).values({
        tenantId: testTenantId,
        invoiceId: testInvoiceId,
        status: 'active',
        strategy: 'soft_reminder',
        amountAtRisk: '750.00',
        currency: 'INR',
        retryCount: 0,
      }).returning();
      createdSessionIds.push(session.id);

      // Fire 5 concurrent appendAuditLog writes simultaneously for the same tenant
      const actions = [
        'recovery_triggered',
        'policy_validated',
        'outreach_dispatched',
        'ptp_detected',
        'settlement_verified',
      ];

      await Promise.all(
        actions.map((act) =>
          recoveryRepo.appendAuditLog({
            sessionId: session.id,
            tenantId: testTenantId,
            invoiceId: testInvoiceId,
            action: act,
            actor: 'concurrent_worker',
            result: 'success',
            amountAtRisk: '750.00',
          })
        )
      );

      // Fetch all logs for this tenant
      const rawLogs = await db
        .select()
        .from(recoveryAuditLog)
        .where(eq(recoveryAuditLog.tenantId, testTenantId));

      expect(rawLogs.length).toBe(5);

      // Verify no two concurrent transactions claimed the same previousHash (no chain forks)
      const byPrevHash = new Map<string, (typeof rawLogs)[0]>();
      const duplicatePrevHashes: string[] = [];

      for (const log of rawLogs) {
        const prev = log.previousHash || 'GENESIS';
        if (byPrevHash.has(prev)) {
          duplicatePrevHashes.push(prev);
        }
        byPrevHash.set(prev, log);
      }

      expect(duplicatePrevHashes).toEqual([]); // Proves atomic serialization: zero concurrent race forks

      // Reconstruct strictly linear chain from GENESIS
      const chainLogs: typeof rawLogs = [];
      let currentPrev = 'GENESIS';
      while (byPrevHash.has(currentPrev)) {
        const nextNode = byPrevHash.get(currentPrev)!;
        chainLogs.push(nextNode);
        currentPrev = nextNode.hash!;
      }

      expect(chainLogs.length).toBe(5); // All 5 logs connected in a single linear unbroken chain

      // Verify the entire cryptographic hash chain from genesis to head
      let runningHash = 'GENESIS';
      let validCount = 0;
      let brokenCount = 0;

      for (const log of chainLogs) {
        const payloadString = JSON.stringify({
          sessionId: log.sessionId,
          tenantId: log.tenantId,
          invoiceId: log.invoiceId,
          action: log.action,
          actor: log.actor || 'system',
          result: log.result || 'success',
          amountAtRisk: log.amountAtRisk,
        });

        const expectedPrevious = runningHash;
        const hashData = expectedPrevious + '|' + payloadString;
        const computedHash = crypto.createHash('sha256').update(hashData).digest('hex');

        expect(log.hash).toBe(computedHash);

        if (expectedPrevious !== 'GENESIS') {
          expect(log.previousHash).toBe(expectedPrevious);
        }

        if (log.hash === computedHash && (expectedPrevious === 'GENESIS' || log.previousHash === expectedPrevious)) {
          validCount++;
        } else {
          brokenCount++;
        }

        runningHash = computedHash;
      }

      expect(validCount).toBe(5);
      expect(brokenCount).toBe(0);
    });
  });

  // ─── Test 3: Stale In-Flight Lock Sweeper ──────────────────────────────────
  describe('Adversarial Concurrency 3: Stale In-Flight Lock Recovery (Sweeper Resolution)', () => {
    it('safely sweeps an in-flight session stuck past threshold and transitions it to escalated with an audit log', async () => {
      // Simulate crashed worker: acquired lock 45 minutes ago
      const fortyFiveMinutesAgo = new Date(Date.now() - 45 * 60 * 1000);

      const [session] = await db.insert(recoverySessions).values({
        tenantId: testTenantId,
        invoiceId: testInvoiceId,
        status: 'active',
        strategy: 'mandate_retry',
        amountAtRisk: '750.00',
        currency: 'INR',
        retryCount: 1,
        lockedAt: fortyFiveMinutesAgo,
      }).returning();
      createdSessionIds.push(session.id);

      // Run sweeper with 15 minute threshold
      const { swept } = await recoveryService.sweepStaleLocks(15);
      expect(swept).toBeGreaterThanOrEqual(1);

      // Verify the session has been unlocked and escalated
      const [sweptSession] = await db
        .select()
        .from(recoverySessions)
        .where(eq(recoverySessions.id, session.id));

      expect(sweptSession.status).toBe('escalated');
      expect(sweptSession.stopReason).toBe('stale_lock_timeout');
      expect(sweptSession.lockedAt).toBeNull();

      // Verify audit log entry
      const logs = await db
        .select()
        .from(recoveryAuditLog)
        .where(eq(recoveryAuditLog.sessionId, session.id));

      const staleLog = logs.find((l: any) => l.action === 'escalated_stale_lock');
      expect(staleLog).toBeDefined();
      expect(staleLog.result).toBe('escalated');
    });
  });
});
