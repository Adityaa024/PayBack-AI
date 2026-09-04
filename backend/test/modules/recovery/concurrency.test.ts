import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import crypto from 'crypto';
import { eq, inArray } from 'drizzle-orm';
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

describe('Adversarial Concurrency & Idempotency Guarantees', () => {
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
  const WEBHOOK_SECRET = 'test_webhook_secret_key_12345';

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
        reasoning: 'Testing concurrency',
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
      name: `Tenant ${testTenantId.slice(0, 8)}`,
      slug: `tenant-${testTenantId.slice(0, 8)}`,
    });

    // Seed invoice for ₹500.00 (expected amount = 50000 paise)
    await db.insert(invoices).values({
      id: testInvoiceId,
      tenantId: testTenantId,
      invoiceNo: `INV-${testInvoiceId.slice(0, 8)}`,
      clientName: 'Adversarial Test Customer',
      invoiceAmount: '500.00',
      currency: 'INR',
      dueDate: new Date().toISOString().split('T')[0],
      contactEmail: 'concurrency@example.com',
      paymentStatus: 'Pending',
    });
  });

  describe('Adversarial Scenario 1: Concurrent Duplicate Webhooks (At-Most-Once Confirmation)', () => {
    it('fires 10 identical webhook deliveries concurrently via Promise.all — physically rejects 9 and executes recovery exactly once', async () => {
      // 1. Setup active recovery session
      const [session] = await db.insert(recoverySessions).values({
        tenantId: testTenantId,
        invoiceId: testInvoiceId,
        status: 'active',
        strategy: 'payment_link_refresh',
        incidentLane: 'payment_degradation',
        amountAtRisk: '500.00',
        amountRecovered: '0',
        currency: 'INR',
        retryCount: 0,
      }).returning();
      createdSessionIds.push(session.id);

      // 2. Prepare Razorpay webhook payload
      const eventId = `evt_concurrency_${crypto.randomUUID().slice(0, 8)}`;
      const paymentId = `pay_concurrency_${crypto.randomUUID().slice(0, 8)}`;
      const payload = {
        entity: 'event',
        account_id: 'acc_test123',
        event: 'payment.captured',
        event_id: eventId,
        contains: ['payment'],
        payload: {
          payment: {
            entity: {
              id: paymentId,
              amount: 50000, // 500.00 INR in paise
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

      // 3. Fire 10 identical webhook deliveries simultaneously
      const results = await Promise.all(
        Array.from({ length: 10 }).map(() =>
          paymentService.processPaymentCaptured(testTenantId, 'razorpay', payload as any, rawBody, signature)
        )
      );

      // 4. Concurrency assertions
      const processedCount = results.filter((r) => r.status === 'processed').length;
      const ignoredCount = results.filter((r) => r.status === 'ignored').length;

      expect(processedCount).toBe(1);
      expect(ignoredCount).toBe(9);

      // 5. Database state verification
      const [updatedInvoice] = await db
        .select()
        .from(invoices)
        .where(eq(invoices.id, testInvoiceId));
      expect(updatedInvoice.paymentStatus).toBe('Paid');

      const [updatedSession] = await db
        .select()
        .from(recoverySessions)
        .where(eq(recoverySessions.id, session.id));
      expect(updatedSession.status).toBe('recovered');
      expect(Number(updatedSession.amountRecovered)).toBe(500);

      // 6. Audit log idempotency verification: exactly ONE audit log entry for recovery
      const auditLogs = await db
        .select()
        .from(recoveryAuditLog)
        .where(eq(recoveryAuditLog.sessionId, session.id));

      const recoveredLogs = auditLogs.filter((l: any) => l.action === 'invoice_paid_recovered');
      expect(recoveredLogs.length).toBe(1);
      expect(recoveredLogs[0].result).toBe('succeeded');
    });
  });

  describe('Adversarial Scenario 2: Duplicate Dispatch on Retry (DB Unique Constraint Protection)', () => {
    it('physically rejects duplicate retry dispatch at attemptNumber via DB constraint (23505)', async () => {
      const [session] = await db.insert(recoverySessions).values({
        tenantId: testTenantId,
        invoiceId: testInvoiceId,
        status: 'active',
        strategy: 'payment_link_refresh',
        amountAtRisk: '500.00',
        currency: 'INR',
        retryCount: 0,
      }).returning();
      createdSessionIds.push(session.id);

      // First dispatch succeeds
      await recoveryRepo.createRetryAttempt({
        sessionId: session.id,
        tenantId: testTenantId,
        invoiceId: testInvoiceId,
        attemptNumber: 1,
        razorpayPaymentLinkId: 'plink_first_attempt',
        status: 'pending',
      });

      // Second identical dispatch for attemptNumber 1 MUST be rejected by DB unique index
      let errorThrown: any = null;
      try {
        await recoveryRepo.createRetryAttempt({
          sessionId: session.id,
          tenantId: testTenantId,
          invoiceId: testInvoiceId,
          attemptNumber: 1,
          razorpayPaymentLinkId: 'plink_second_attempt_race',
          status: 'pending',
        });
      } catch (err: any) {
        errorThrown = err;
      }

      expect(errorThrown).not.toBeNull();
      expect(errorThrown.code).toBe('23505'); // Postgres unique constraint violation

      // Exactly 1 attempt is in the database
      const count = await recoveryRepo.countRetryAttempts(session.id);
      expect(count).toBe(1);
    });
  });

  describe('Adversarial Scenario 3: Stale In-Flight Lock Recovery (Sweeper Resilience)', () => {
    it('detects a crashed worker holding an in-flight lock, unlocks it, and safely transitions session to escalated', async () => {
      // Simulate a crashed worker that acquired a lock 30 minutes ago and never finished
      const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);

      const [session] = await db.insert(recoverySessions).values({
        tenantId: testTenantId,
        invoiceId: testInvoiceId,
        status: 'active',
        strategy: 'payment_link_refresh',
        amountAtRisk: '500.00',
        currency: 'INR',
        retryCount: 1,
        lockedAt: thirtyMinutesAgo,
      }).returning();
      createdSessionIds.push(session.id);

      // Run sweeper with 15 minute threshold
      const { swept } = await recoveryService.sweepStaleLocks(15);
      expect(swept).toBeGreaterThanOrEqual(1);

      // Verify the session is now escalated and unlocked
      const [sweptSession] = await db
        .select()
        .from(recoverySessions)
        .where(eq(recoverySessions.id, session.id));

      expect(sweptSession.status).toBe('escalated');
      expect(sweptSession.stopReason).toBe('stale_lock_timeout');
      expect(sweptSession.lockedAt).toBeNull();

      // Verify audit log
      const logs = await db
        .select()
        .from(recoveryAuditLog)
        .where(eq(recoveryAuditLog.sessionId, session.id));

      const staleLockLog = logs.find((l: any) => l.action === 'escalated_stale_lock');
      expect(staleLockLog).toBeDefined();
      expect(staleLockLog.result).toBe('escalated');
    });
  });
});
