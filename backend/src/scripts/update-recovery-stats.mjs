import pg from 'pg';

const { Pool } = pg;
const pool = new Pool({
  connectionString: 'postgresql://postgres.jnbenaukuoohvkvnzjfw:Adianu7890%40@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  console.log('Connecting to Supabase to update recovery stats...');

  // 1. Mark ~27 cases as recovered (total ~12.11L)
  const res = await pool.query(`
    WITH to_recover AS (
      SELECT id, invoice_id, amount_at_risk
      FROM recovery_sessions
      WHERE tenant_id = 'tenant_demo_001' AND status != 'stopped'
      ORDER BY id ASC
      LIMIT 27
    )
    UPDATE recovery_sessions rs
    SET status = 'recovered',
        amount_recovered = tr.amount_at_risk,
        resolved_at = NOW()
    FROM to_recover tr
    WHERE rs.id = tr.id;
  `);
  console.log('Updated recovery sessions to recovered:', res.rowCount);

  // 2. Mark corresponding invoices to Paid
  const invRes = await pool.query(`
    UPDATE invoices
    SET payment_status = 'Paid'
    WHERE id IN (
      SELECT invoice_id FROM recovery_sessions WHERE tenant_id = 'tenant_demo_001' AND status = 'recovered'
    );
  `);
  console.log('Updated invoices to Paid:', invRes.rowCount);

  // 3. Mark 8 cases as holdout (counterfactual control)
  await pool.query(`
    WITH to_holdout AS (
      SELECT id FROM recovery_sessions
      WHERE tenant_id = 'tenant_demo_001' AND status = 'active'
      LIMIT 8
    )
    UPDATE recovery_sessions rs
    SET is_holdout = true
    FROM to_holdout th
    WHERE rs.id = th.id;
  `);
  console.log('Updated holdout cases');

  // 4. Verify aggregated stats
  const statsRes = await pool.query(`
    SELECT 
      COUNT(*) as total_cases,
      COUNT(*) FILTER (WHERE status = 'recovered') as recovered_cases,
      COUNT(*) FILTER (WHERE status = 'active') as active_cases,
      COUNT(*) FILTER (WHERE status = 'stopped') as stopped_cases,
      COUNT(*) FILTER (WHERE is_holdout = true) as holdout_cases,
      COALESCE(SUM(amount_at_risk::numeric), 0) as total_at_risk,
      COALESCE(SUM(amount_recovered::numeric), 0) as total_recovered
    FROM recovery_sessions
    WHERE tenant_id = 'tenant_demo_001';
  `);
  console.log('New stats:', statsRes.rows[0]);

  await pool.end();
}

run().catch(err => {
  console.error('Update error:', err);
  process.exit(1);
});
