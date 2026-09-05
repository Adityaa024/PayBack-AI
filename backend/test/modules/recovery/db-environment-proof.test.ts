import { describe, it, expect, beforeAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { createDatabaseClient } from '../../../src/db/index.js';
import { config } from '../../../src/config/env.js';

describe('Real PostgreSQL Environment Proof & Infrastructure Boundary Audit', () => {
  let db: any;

  beforeAll(() => {
    // Assert fail-closed production flag
    expect(config.ALLOW_IN_MEMORY_FALLBACK).toBe(false);
    db = createDatabaseClient({ connectionString: config.DATABASE_URL });
  });

  it('proves physical connection to a genuine PostgreSQL database engine (rejecting fallbacks/mocks)', async () => {
    // Execute low-level PostgreSQL engine metadata query
    const result = await db.execute(
      sql`SELECT version() as version, current_database() as database, current_user as user, pg_backend_pid() as pid;`
    );

    const row = result.rows[0];
    expect(row).toBeDefined();
    expect(typeof row.version).toBe('string');
    expect(row.version.toLowerCase()).toContain('postgresql');
    expect(typeof row.database).toBe('string');
    expect(Number(row.pid)).toBeGreaterThan(0);

    // Verify it is not SQLite, MySQL, or an in-memory stub
    expect(row.version.toLowerCase()).not.toContain('sqlite');
    expect(row.version.toLowerCase()).not.toContain('mock');

    console.log('\n================================================================');
    console.log('🏛️  REAL POSTGRESQL ENVIRONMENT AUDIT PROOF');
    console.log('================================================================');
    console.log(`  Engine Version:     ${row.version.split(' on ')[0]}`);
    console.log(`  Active Database:    ${row.database}`);
    console.log(`  Database User:      ${row.user}`);
    console.log(`  Server Backend PID: ${row.pid}`);
    console.log(`  In-Memory Fallback: ${config.ALLOW_IN_MEMORY_FALLBACK} (Strictly Prohibited)`);
    console.log('================================================================\n');
  });

  it('proves native support for PostgreSQL transaction advisory locking (pg_advisory_xact_lock)', async () => {
    // Advisory locks are a distinct PostgreSQL-native primitive unavailable in stubs/sqlite
    let lockAcquired = false;
    await db.transaction(async (tx: any) => {
      const lockRes = await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext('proof_lock_verification'));`
      );
      expect(lockRes).toBeDefined();
      lockAcquired = true;
    });

    expect(lockAcquired).toBe(true);
  });

  it('proves existence of core recovery tables and relations in PostgreSQL schema', async () => {
    const tableRes = await db.execute(
      sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('recovery_sessions', 'recovery_outbox_intents', 'recovery_audit_log');`
    );

    const tablesFound = tableRes.rows.map((r: any) => r.table_name);
    expect(tablesFound).toContain('recovery_sessions');
    expect(tablesFound).toContain('recovery_outbox_intents');
    expect(tablesFound).toContain('recovery_audit_log');
  });

  it('proves fail-closed behavior: unavailable database rejects fallback and throws connection error', async () => {
    // Attempting to connect to an invalid port with ALLOW_IN_MEMORY_FALLBACK=false MUST fail loudly
    const invalidClient = createDatabaseClient({ connectionString: 'postgresql://postgres:postgres@127.0.0.1:59999/nonexistent' });
    let threw = false;
    try {
      await invalidClient.execute(sql`SELECT 1;`);
    } catch (err: any) {
      threw = true;
      expect(err).toBeDefined();
    }
    expect(threw, 'System must fail closed when PostgreSQL is unavailable, with zero silent in-memory fallback').toBe(true);
  });
});
