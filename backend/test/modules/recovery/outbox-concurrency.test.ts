import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createDatabaseClient } from '../../../src/db/client.js';
import { config } from '../../../src/config/env.js';
import { OutboxService } from '../../../src/modules/recovery/outbox.service.js';
import { recoverySessions, tenants, invoices, recoveryOutboxIntents } from '../../../src/db/schema.js';
import { eq, sql } from 'drizzle-orm';
import crypto from 'crypto';

describe('P1 — Transactional Outbox Concurrency & Crash-Window Safety', () => {
  const db = createDatabaseClient({ connectionString: config.DATABASE_URL });
  const outboxService = new OutboxService(db);

  const testTenantId = crypto.randomUUID();
  const testInvoiceId = crypto.randomUUID();
  const testSessionId = crypto.randomUUID();

  beforeAll(async () => {
    // Seed prerequisite tenant, invoice, session
    await db.insert(tenants).values({
      id: testTenantId,
      name: 'Outbox Test Tenant',
      slug: `outbox-${crypto.randomUUID()}`,
    });

    await db.insert(invoices).values({
      id: testInvoiceId,
      tenantId: testTenantId,
      invoiceNo: `INV-OUTBOX-${Date.now()}`,
      clientName: 'Outbox Test Corp',
      invoiceAmount: '12000.00',
      currency: 'INR',
      dueDate: '2026-08-01',
      contactEmail: 'outbox@test.com',
      paymentStatus: 'Pending',
    });

    await db.insert(recoverySessions).values({
      id: testSessionId,
      tenantId: testTenantId,
      invoiceId: testInvoiceId,
      amountAtRisk: '12000.00',
      status: 'active',
    });
  });

  beforeEach(async () => {
    await db.delete(recoveryOutboxIntents).where(eq(recoveryOutboxIntents.tenantId, testTenantId));
  });

  afterAll(async () => {
    // Clean up test data
    await db.delete(recoveryOutboxIntents).where(eq(recoveryOutboxIntents.tenantId, testTenantId));
    await db.delete(recoverySessions).where(eq(recoverySessions.id, testSessionId));
    await db.delete(invoices).where(eq(invoices.id, testInvoiceId));
    await db.delete(tenants).where(eq(tenants.id, testTenantId));
  });

  it('proves exactly-once intent claiming across 5 concurrent workers (FOR UPDATE SKIP LOCKED)', async () => {
    // Create 5 queued intents
    const intentIds: string[] = [];
    for (let i = 1; i <= 5; i++) {
      const intent = await outboxService.createIntent({
        tenantId: testTenantId,
        sessionId: testSessionId,
        invoiceId: testInvoiceId,
        actionType: 'payment_link_refresh',
        idempotencyKey: `idemp_${testSessionId}_attempt_${i}`,
        payload: { attemptNumber: i },
      });
      intentIds.push(intent.id);
    }

    expect(intentIds).toHaveLength(5);

    // Concurrently launch 5 workers trying to claim intents at the exact same millisecond
    const claimedResults = await Promise.all([
      outboxService.claimNextIntent(testTenantId),
      outboxService.claimNextIntent(testTenantId),
      outboxService.claimNextIntent(testTenantId),
      outboxService.claimNextIntent(testTenantId),
      outboxService.claimNextIntent(testTenantId),
    ]);

    // Filter non-null claims
    const validClaims = claimedResults.filter((r): r is NonNullable<typeof r> => r !== null);
    expect(validClaims).toHaveLength(5);

    // Crucial proof: every worker claimed a DISTINCT intent ID (zero duplicates)
    const claimedIds = validClaims.map((c) => c.id);
    const uniqueClaimedIds = new Set(claimedIds);
    expect(uniqueClaimedIds.size).toBe(5);

    // A 6th worker attempting to claim should receive null (no queued intents left)
    const sixthWorkerClaim = await outboxService.claimNextIntent(testTenantId);
    expect(sixthWorkerClaim).toBeNull();

    for (const claim of validClaims) {
      await outboxService.completeIntent(claim.id, 'provider_ref_test');
    }
  });

  it('rejects duplicate action intent creation on the same idempotency key', async () => {
    const duplicateKey = `idemp_duplicate_test_${crypto.randomUUID()}`;

    const intent1 = await outboxService.createIntent({
      tenantId: testTenantId,
      sessionId: testSessionId,
      invoiceId: testInvoiceId,
      actionType: 'payment_link_refresh',
      idempotencyKey: duplicateKey,
      payload: { attempt: 1 },
    });

    const intent2 = await outboxService.createIntent({
      tenantId: testTenantId,
      sessionId: testSessionId,
      invoiceId: testInvoiceId,
      actionType: 'payment_link_refresh',
      idempotencyKey: duplicateKey,
      payload: { attempt: 1, duplicateAttempt: true },
    });

    // Both return the exact same intent ID without throwing
    expect(intent1.id).toBe(intent2.id);
  });

  it('crash-window safety: sweeps stale locked claims back to queued without creating duplicate work', async () => {
    const crashKey = `idemp_crash_window_${crypto.randomUUID()}`;

    // 1. Create intent
    const intent = await outboxService.createIntent({
      tenantId: testTenantId,
      sessionId: testSessionId,
      invoiceId: testInvoiceId,
      actionType: 'payment_link_refresh',
      idempotencyKey: crashKey,
    });

    // 2. Worker claims intent
    const claimed = await outboxService.claimNextIntent(testTenantId);
    expect(claimed?.id).toBe(intent.id);
    expect(claimed?.status).toBe('claimed');

    // 3. Worker "crashes" before completing. Simulate lock timeout by artificially setting locked_at to 10 minutes ago
    await db.execute(sql`
      UPDATE recovery_outbox_intents
      SET locked_at = NOW() - INTERVAL '10 minutes'
      WHERE id = ${intent.id};
    `);

    // 4. Stale claim sweeper runs
    const sweptCount = await outboxService.sweepStaleClaims(5);
    expect(sweptCount).toBeGreaterThanOrEqual(1);

    // 5. Check intent status: safely returned to 'queued' so a healthy worker can retry
    const recoveredIntent = await outboxService.getById(intent.id);
    expect(recoveredIntent?.status).toBe('queued');
    expect(recoveredIntent?.lockedAt).toBeNull();

    // 6. Healthy worker claims and successfully completes it
    const healthyClaim = await outboxService.claimNextIntent(testTenantId);
    expect(healthyClaim?.id).toBe(intent.id);

    await outboxService.completeIntent(healthyClaim!.id, 'plink_recovered_123');

    const completed = await outboxService.getById(intent.id);
    expect(completed?.status).toBe('completed');
    expect(completed?.providerRef).toBe('plink_recovered_123');
  });
});
