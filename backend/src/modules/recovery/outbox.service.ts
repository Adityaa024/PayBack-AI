import { eq, and, sql, desc } from 'drizzle-orm';
import type { DatabaseClient, DatabaseOrTransaction } from '../../db/client.js';
import {
  recoveryOutboxIntents,
  type RecoveryOutboxIntent,
  type NewRecoveryOutboxIntent,
} from '../../db/schema.js';
import { logger } from '../../shared/logger.js';
import crypto from 'crypto';

export class OutboxService {
  constructor(private readonly db: DatabaseClient) {}

  /**
   * Persists an immutable action intent and idempotency key before calling an external provider.
   * If an intent with the same idempotency key already exists, returns the existing intent.
   */
  async createIntent(
    data: Omit<NewRecoveryOutboxIntent, 'id' | 'createdAt' | 'updatedAt' | 'status' | 'retryCount'>,
    dbClient?: DatabaseOrTransaction
  ): Promise<RecoveryOutboxIntent> {
    const client = dbClient || this.db;
    const id = crypto.randomUUID();

    try {
      const [row] = await client
        .insert(recoveryOutboxIntents)
        .values({
          ...data,
          id,
          status: 'queued',
          retryCount: 0,
        })
        .returning();
      if (row) return row;
    } catch (err: unknown) {
      const code = (err as any)?.code || (err as any)?.cause?.code;
      if (code === '23505') {
        logger.info('Duplicate outbox intent detected by idempotencyKey', { idempotencyKey: data.idempotencyKey });
        const existing = await this.getByIdempotencyKey(data.idempotencyKey, client);
        if (existing) return existing;
      }
      logger.error('Failed to insert outbox intent', { error: err, idempotencyKey: data.idempotencyKey });
      throw err;
    }

    const fetched = await this.getByIdempotencyKey(data.idempotencyKey, client);
    if (!fetched) throw new Error('Failed to create or retrieve outbox intent');
    return fetched;
  }

  async getByIdempotencyKey(
    idempotencyKey: string,
    dbClient?: DatabaseOrTransaction
  ): Promise<RecoveryOutboxIntent | null> {
    const client = dbClient || this.db;
    const [row] = await client
      .select()
      .from(recoveryOutboxIntents)
      .where(eq(recoveryOutboxIntents.idempotencyKey, idempotencyKey))
      .limit(1);
    return row || null;
  }

  async getById(
    id: string,
    dbClient?: DatabaseOrTransaction
  ): Promise<RecoveryOutboxIntent | null> {
    const client = dbClient || this.db;
    const [row] = await client
      .select()
      .from(recoveryOutboxIntents)
      .where(eq(recoveryOutboxIntents.id, id))
      .limit(1);
    return row || null;
  }

  /**
   * Atomically claims a queued intent using PostgreSQL FOR UPDATE SKIP LOCKED.
   * Concurrent workers will never claim the same intent.
   */
  async claimNextIntent(tenantId?: string): Promise<RecoveryOutboxIntent | null> {
    try {
      const tenantFilter = tenantId ? sql`AND tenant_id = ${tenantId}` : sql``;
      const result = await this.db.execute(sql`
        UPDATE recovery_outbox_intents
        SET status = 'claimed', locked_at = NOW(), updated_at = NOW()
        WHERE id = (
          SELECT id FROM recovery_outbox_intents
          WHERE status = 'queued'
          ${tenantFilter}
          ORDER BY created_at ASC
          LIMIT 1
          FOR UPDATE SKIP LOCKED
        )
        RETURNING *;
      `);

      const row = (result as any)?.rows?.[0] as RecoveryOutboxIntent | undefined;
      return row || null;
    } catch (err) {
      logger.error('Failed to claim next outbox intent', { error: err });
      return null;
    }
  }

  /**
   * Marks an intent as successfully completed with the provider's reference ID.
   */
  async completeIntent(
    id: string,
    providerRef: string,
    dbClient?: DatabaseOrTransaction
  ): Promise<void> {
    const client = dbClient || this.db;
    await client
      .update(recoveryOutboxIntents)
      .set({
        status: 'completed',
        providerRef,
        lockedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(recoveryOutboxIntents.id, id));
  }

  /**
   * Marks an intent as failed. If retries < 3, resets to queued for retry.
   */
  async failIntent(
    id: string,
    error: string,
    retryable = true,
    dbClient?: DatabaseOrTransaction
  ): Promise<void> {
    const client = dbClient || this.db;
    const existing = await this.getById(id, client);
    if (!existing) return;

    const newRetryCount = (existing.retryCount || 0) + 1;
    const shouldFailPermanently = !retryable || newRetryCount >= 3;

    await client
      .update(recoveryOutboxIntents)
      .set({
        status: shouldFailPermanently ? 'failed' : 'queued',
        retryCount: newRetryCount,
        lastError: error,
        lockedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(recoveryOutboxIntents.id, id));
  }

  /**
   * Reclaims intents held by crashed workers whose lock has timed out.
   */
  async sweepStaleClaims(timeoutMinutes = 5): Promise<number> {
    try {
      const result = await this.db.execute(sql`
        UPDATE recovery_outbox_intents
        SET status = 'queued', locked_at = null, updated_at = NOW()
        WHERE status = 'claimed'
          AND locked_at < NOW() - (${timeoutMinutes} * INTERVAL '1 minute')
        RETURNING id;
      `);
      return (result as any)?.rows?.length || 0;
    } catch (err) {
      logger.error('Failed to sweep stale outbox claims', { error: err });
      return 0;
    }
  }
}
