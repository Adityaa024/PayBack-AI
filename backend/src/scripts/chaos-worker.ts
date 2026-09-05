import { createDatabaseClient } from '../db/index.js';
import { config } from '../config/env.js';
import { recoverySessions, recoveryAuditLog, invoicePaymentLinks } from '../db/schema.js';
import crypto from 'crypto';

const [sessionId, tenantId, invoiceId, idempotencyKey] = process.argv.slice(2);

if (!sessionId || !tenantId || !invoiceId || !idempotencyKey) {
  console.error('Usage: tsx src/scripts/chaos-worker.ts <sessionId> <tenantId> <invoiceId> <idempotencyKey>');
  process.exit(2);
}

async function run() {
  const db = createDatabaseClient({ connectionString: config.DATABASE_URL });
  const now = new Date();

  // 1. Insert session in active state with worker lock acquired just now
  await db.insert(recoverySessions).values({
    id: sessionId,
    tenantId,
    invoiceId,
    status: 'active',
    amountAtRisk: '4500.00',
    amountRecovered: '0.00',
    strategy: 'payment_link_refresh',
    retryCount: 0,
    lockedAt: now,
    createdAt: now,
    updatedAt: now,
  });

  // 2. Insert action intent with unique idempotency key
  await db.insert(recoveryAuditLog).values({
    id: crypto.randomUUID(),
    sessionId,
    tenantId,
    invoiceId,
    action: 'action_intent_created',
    actor: 'chaos_worker',
    amountAtRisk: '4500.00',
    result: 'pending',
    idempotencyKey,
    previousHash: 'GENESIS',
    hash: crypto.randomBytes(32).toString('hex'),
    createdAt: now,
  });

  // 3. Insert mock payment link dispatched by external provider
  await db.insert(invoicePaymentLinks).values({
    id: 'link_chaos_' + crypto.randomUUID().slice(0, 8),
    tenantId,
    invoiceId,
    provider: 'razorpay',
    providerPaymentLinkId: 'plink_chaos_mock_001',
    paymentUrl: 'https://rzp.io/i/chaos_crash_test',
    status: 'active',
    amount: '4500.00',
    currency: 'INR',
    createdAt: now,
    updatedAt: now,
    expiresAt: new Date(Date.now() + 48 * 3600 * 1000),
  });

  // 4. Force-kill process mid-flight between action creation and outcome recording!
  // Simulates hard crash / SIGKILL without graceful DB commit of completion or lock release.
  process.exit(1);
}

run().catch((err) => {
  console.error('Chaos worker runtime error:', err);
  process.exit(2);
});
