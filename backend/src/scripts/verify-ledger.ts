import { createDatabaseClient } from '../db/index.js';
import { config } from '../config/env.js';
import { recoveryAuditLog } from '../db/schema.js';
import { eq, asc } from 'drizzle-orm';
import crypto from 'crypto';

const db = createDatabaseClient({ connectionString: config.DATABASE_URL });

async function verifyLedger() {
  const tenantId = process.argv[2];
  if (!tenantId) {
    console.error('Usage: npx tsx src/scripts/verify-ledger.ts <tenantId>');
    process.exit(1);
  }

  console.log(`Verifying Audit Ledger for tenant: ${tenantId}`);
  
  const logs = await db
    .select()
    .from(recoveryAuditLog)
    .where(eq(recoveryAuditLog.tenantId, tenantId))
    .orderBy(asc(recoveryAuditLog.createdAt));

  if (logs.length === 0) {
    console.log('No audit logs found for tenant.');
    return;
  }

  let runningHash = 'GENESIS';
  let validCount = 0;
  let invalidCount = 0;

  for (const log of logs) {
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

    if (!log.hash || log.hash !== computedHash) {
      console.error(`[TAMPERED] Log ${log.id} has invalid hash!`);
      console.error(`  Expected: ${computedHash}`);
      console.error(`  Found:    ${log.hash}`);
      invalidCount++;
    } else if (log.previousHash !== expectedPrevious && expectedPrevious !== 'GENESIS') {
      console.error(`[BROKEN CHAIN] Log ${log.id} breaks the chain!`);
      console.error(`  Expected Prev: ${expectedPrevious}`);
      console.error(`  Found Prev:    ${log.previousHash}`);
      invalidCount++;
    } else {
      validCount++;
    }

    runningHash = computedHash;
  }

  console.log('----------------------------------------------------');
  console.log(`Total Logs Checked: ${logs.length}`);
  console.log(`Valid:              ${validCount}`);
  console.log(`Invalid/Tampered:   ${invalidCount}`);
  
  if (invalidCount > 0) {
    console.error('❌ LEDGER INTEGRITY COMPROMISED!');
    process.exit(1);
  } else {
    console.log('✅ LEDGER VERIFIED (100% Cryptographically Sound)');
    process.exit(0);
  }
}

verifyLedger().catch((err) => {
  console.error('Failed to verify ledger:', err);
  process.exit(1);
});
