import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createDatabaseClient } from '../../../src/db/client.js';
import { config } from '../../../src/config/env.js';
import { RecoveryRepository } from '../../../src/modules/recovery/recovery.repository.js';
import { recoverySessions, tenants, invoices, recoveryAuditLog } from '../../../src/db/schema.js';
import { eq, asc, sql } from 'drizzle-orm';
import crypto from 'crypto';

describe('P1 — Immutable Audit Ledger: Serialization & Tamper Detection', () => {
  const db = createDatabaseClient({ connectionString: config.DATABASE_URL });
  const recoveryRepo = new RecoveryRepository(db);

  const testTenantId = crypto.randomUUID();
  const testInvoiceId = crypto.randomUUID();
  const testSessionId = crypto.randomUUID();

  beforeAll(async () => {
    await db.insert(tenants).values({
      id: testTenantId,
      name: 'Ledger Tamper Test Tenant',
      slug: `ledger-${crypto.randomUUID()}`,
    });

    await db.insert(invoices).values({
      id: testInvoiceId,
      tenantId: testTenantId,
      invoiceNo: `INV-LEDGER-${Date.now()}`,
      clientName: 'Ledger Test Corp',
      invoiceAmount: '8000.00',
      currency: 'INR',
      dueDate: '2026-08-01',
      contactEmail: 'ledger@test.com',
      paymentStatus: 'Pending',
    });

    await db.insert(recoverySessions).values({
      id: testSessionId,
      tenantId: testTenantId,
      invoiceId: testInvoiceId,
      amountAtRisk: '8000.00',
      status: 'active',
    });
  });

  afterAll(async () => {
    await db.delete(recoveryAuditLog).where(eq(recoveryAuditLog.tenantId, testTenantId));
    await db.delete(recoverySessions).where(eq(recoverySessions.id, testSessionId));
    await db.delete(invoices).where(eq(invoices.id, testInvoiceId));
    await db.delete(tenants).where(eq(tenants.id, testTenantId));
  });

  async function verifyLedgerChain(tenantId: string): Promise<{ valid: boolean; invalidCount: number; logsCount: number }> {
    const logs = await db
      .select()
      .from(recoveryAuditLog)
      .where(eq(recoveryAuditLog.tenantId, tenantId));

    const byPrevHash = new Map<string, typeof logs[0]>();
    for (const log of logs) {
      byPrevHash.set(log.previousHash || 'GENESIS', log);
    }

    let runningHash = 'GENESIS';
    let invalidCount = 0;
    let chainedCount = 0;

    while (byPrevHash.has(runningHash)) {
      const log = byPrevHash.get(runningHash)!;
      chainedCount++;

      const payloadString = JSON.stringify({
        sessionId: log.sessionId,
        tenantId: log.tenantId,
        invoiceId: log.invoiceId,
        action: log.action,
        actor: log.actor || 'system',
        result: log.result || 'success',
        amountAtRisk: log.amountAtRisk,
      });

      const hashData = runningHash + '|' + payloadString;
      const computedHash = crypto.createHash('sha256').update(hashData).digest('hex');

      if (log.hash !== computedHash) {
        invalidCount++;
      }

      runningHash = log.hash || computedHash;
    }

    if (chainedCount !== logs.length) {
      invalidCount += (logs.length - chainedCount);
    }

    return {
      valid: invalidCount === 0 && logs.length > 0,
      invalidCount,
      logsCount: logs.length,
    };
  }

  it('proves serialized hash-chain integrity across 10 concurrent appends (zero fork/chain divergence)', async () => {
    // 10 concurrent appendAuditLog calls for the same tenant at the exact same instant
    const appendPromises = Array.from({ length: 10 }, (_, i) =>
      recoveryRepo.appendAuditLog({
        sessionId: testSessionId,
        tenantId: testTenantId,
        invoiceId: testInvoiceId,
        action: `concurrent_action_${i + 1}`,
        actor: 'recovery_agent',
        amountAtRisk: '8000.00',
        result: 'succeeded',
        metadata: { index: i + 1 },
      })
    );

    const results = await Promise.all(appendPromises);
    expect(results).toHaveLength(10);

    // Cryptographically verify the entire chain
    const verification = await verifyLedgerChain(testTenantId);
    expect(verification.logsCount).toBe(10);
    expect(verification.invalidCount).toBe(0);
    expect(verification.valid).toBe(true);
  });

  it('detects tampering when an adversary modifies a historical ledger row', async () => {
    // Fetch an audit row from the database
    const [rowToTamper] = await db
      .select()
      .from(recoveryAuditLog)
      .where(eq(recoveryAuditLog.tenantId, testTenantId))
      .limit(1);

    expect(rowToTamper).toBeDefined();

    // Adversary tampers with the row's amountAtRisk directly in the database
    await db.execute(sql`
      UPDATE recovery_audit_log
      SET amount_at_risk = '999999.00'
      WHERE id = ${rowToTamper.id};
    `);

    // Cryptographic verification must fail and detect the tampered row!
    const verification = await verifyLedgerChain(testTenantId);
    expect(verification.valid).toBe(false);
    expect(verification.invalidCount).toBeGreaterThan(0);
  });

  it('enforces append-only immutability in the repository: update and delete are rejected', async () => {
    await expect(recoveryRepo.updateAuditLog()).rejects.toThrow('LEDGER_TAMPER_PROTECTION');
    await expect(recoveryRepo.deleteAuditLog()).rejects.toThrow('LEDGER_TAMPER_PROTECTION');
  });
});
