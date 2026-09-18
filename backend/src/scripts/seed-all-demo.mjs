import 'dotenv/config';
import pg from 'pg';
import { ScenarioCatalog } from '../../dist/modules/recovery/recovery.scenarios.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL environment variable is required.');
  process.exit(1);
}

const { Pool } = pg;
const pool = new Pool({
  connectionString,
  ssl: connectionString.includes('localhost') ? false : { rejectUnauthorized: false }
});

const strategyMap = {
  send_payment_link: 'payment_link_refresh',
  wait_retry: 'mandate_retry',
  offer_payment_plan: 'soft_reminder',
  escalate_to_human: 'firm_escalation',
  wait_for_ptp: 'promise_follow_up',
  stop_all_action: 'legal_stop',
};

async function main() {
  console.log('Connecting to Supabase...');
  
  // 1. Tenant
  await pool.query(`
    INSERT INTO tenants (id, name, slug)
    VALUES ('tenant_demo_001', 'Razorpay Demo Corp', 'razorpay-demo')
    ON CONFLICT (id) DO NOTHING
  `);
  console.log('✓ Tenant seeded');

  // 2. User
  await pool.query(`
    INSERT INTO users (id, tenant_id, name, email, password_hash, role, email_verified)
    VALUES ('demo_admin', 'tenant_demo_001', 'Razorpay Judge / Demo', 'judge@razorpay.com', 'dummy_hash', 'admin', true)
    ON CONFLICT (id) DO NOTHING
  `);
  console.log('✓ User seeded');

  // 3. Settings
  await pool.query(`
    INSERT INTO tenant_settings (tenant_id, company_name, dlq_threshold)
    VALUES ('tenant_demo_001', 'Razorpay Demo Corp', 3)
    ON CONFLICT (tenant_id) DO NOTHING
  `);
  console.log('✓ Tenant settings seeded');

  // 4. Batch 50 Invoices & Recovery Sessions
  const tenantId = 'tenant_demo_001';
  const fixtures = ScenarioCatalog.generate50Batch();
  let count = 0;

  for (const f of fixtures) {
    const isStopCase = f.failureReason === 'customer_replied_stop';
    const strategy = strategyMap[f.contract?.recommendedAction] || 'payment_link_refresh';
    const dueDate = new Date(Date.now() - (f.daysOverdue || 5) * 24 * 3600 * 1000).toISOString().slice(0, 10);

    await pool.query(`
      INSERT INTO invoices (
        id, tenant_id, invoice_no, client_name, contact_email,
        invoice_amount, currency, due_date, payment_status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (id) DO NOTHING
    `, [
      f.id,
      tenantId,
      f.invoiceNo,
      f.clientName,
      f.clientEmail,
      String(f.amountAtRisk),
      f.currency || 'INR',
      dueDate,
      'Overdue',
    ]);

    await pool.query(`
      INSERT INTO recovery_sessions (
        id, tenant_id, invoice_id, status, strategy, incident_lane,
        is_holdout, recovery_contract, voice_script_hinglish, opted_out,
        amount_at_risk, amount_recovered, currency, ai_confidence, ai_reasoning,
        stop_reason, retry_count
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      ON CONFLICT (id) DO NOTHING
    `, [
      `rec_${f.id}`,
      tenantId,
      f.id,
      isStopCase ? 'stopped' : 'active',
      strategy,
      f.incidentLane,
      false,
      JSON.stringify(f.contract),
      f.voiceScriptHinglish,
      isStopCase,
      String(f.amountAtRisk),
      '0',
      f.currency || 'INR',
      f.aiConfidence,
      f.aiReasoning,
      isStopCase ? 'legal_stop' : null,
      f.retryCount ?? 0,
    ]);

    count++;
  }
  console.log(`✓ Seeded ${count} benchmark invoices and recovery sessions`);

  await pool.end();
}

main().catch(err => {
  console.error('Seed error:', err);
  process.exit(1);
});
