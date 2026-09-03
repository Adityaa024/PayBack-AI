import pg from 'pg';
import { ScenarioCatalog } from '../modules/recovery/recovery.scenarios.js';

const { Client } = pg;
const client = new Client({
  connectionString: 'postgresql://postgres:Adianu7890%40@db.jnbenaukuoohvkvnzjfw.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false }
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
  await client.connect();
  console.log('Connected to Supabase. Seeding 50 benchmark cases...');

  const tenantId = 'tenant_demo_001';
  const fixtures = ScenarioCatalog.generate50Batch();

  let insertedCount = 0;

  for (const f of fixtures) {
    const isStopCase = f.failureReason === 'customer_replied_stop';
    const strategy = strategyMap[f.contract.recommendedAction] || 'payment_link_refresh';
    const dueDate = new Date(Date.now() - f.daysOverdue * 24 * 3600 * 1000).toISOString().slice(0, 10);

    // 1. Insert Invoice
    await client.query(`
      INSERT INTO invoices (
        id, tenant_id, invoice_no, client_name, contact_email,
        invoice_amount, currency, due_date, payment_status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (id) DO UPDATE SET updated_at = NOW()
    `, [
      f.id,
      tenantId,
      f.invoiceNo,
      f.clientName,
      f.clientEmail,
      String(f.amountAtRisk),
      f.currency,
      dueDate,
      'Overdue',
    ]);

    // 2. Insert Recovery Session
    await client.query(`
      INSERT INTO recovery_sessions (
        id, tenant_id, invoice_id, status, strategy, incident_lane,
        is_holdout, recovery_contract, voice_script_hinglish, opted_out,
        amount_at_risk, amount_recovered, currency, ai_confidence, ai_reasoning,
        stop_reason, retry_count
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      ON CONFLICT (id) DO UPDATE SET
        status = EXCLUDED.status,
        recovery_contract = EXCLUDED.recovery_contract,
        updated_at = NOW()
    `, [
      `sess_${f.id}`,
      tenantId,
      f.id,
      isStopCase ? 'stopped' : 'active',
      strategy,
      f.incidentLane,
      f.isHoldout,
      JSON.stringify(f.contract),
      f.contract.voiceScriptHinglish,
      isStopCase,
      String(f.amountAtRisk),
      '0',
      f.currency,
      String(f.contract.diagnosis.confidence),
      f.contract.diagnosis.primary,
      isStopCase ? 'manual_override' : null,
      isStopCase ? 1 : 0,
    ]);

    // 3. Insert Audit Log
    await client.query(`
      INSERT INTO recovery_audit_log (
        id, session_id, tenant_id, invoice_id, action, actor,
        ai_decision, amount_at_risk, result
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (id) DO NOTHING
    `, [
      `audit_${f.id}`,
      `sess_${f.id}`,
      tenantId,
      f.id,
      isStopCase ? 'policy_guard_stop_opt_out' : 'session_started',
      'recovery_agent',
      JSON.stringify(f.contract),
      String(f.amountAtRisk),
      'success',
    ]);

    insertedCount++;
  }

  console.log(`✓ Successfully seeded ${insertedCount} cases directly into Supabase!`);
  await client.end();
}

main().catch(err => {
  console.error('Batch seed error:', err);
  process.exit(1);
});
