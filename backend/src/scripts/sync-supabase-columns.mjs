import pg from 'pg';

const { Client } = pg;
const client = new Client({
  connectionString: 'postgresql://postgres:Adianu7890%40@db.jnbenaukuoohvkvnzjfw.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await client.connect();
  console.log('Syncing RecoverIQ schema with Supabase...');

  await client.query(`
    -- recovery_sessions columns
    ALTER TABLE recovery_sessions ADD COLUMN IF NOT EXISTS incident_lane VARCHAR(50) DEFAULT 'payment_degradation';
    ALTER TABLE recovery_sessions ADD COLUMN IF NOT EXISTS is_holdout BOOLEAN DEFAULT false;
    ALTER TABLE recovery_sessions ADD COLUMN IF NOT EXISTS recovery_contract JSONB;
    ALTER TABLE recovery_sessions ADD COLUMN IF NOT EXISTS voice_script_hinglish TEXT;
    ALTER TABLE recovery_sessions ADD COLUMN IF NOT EXISTS opted_out BOOLEAN DEFAULT false;
    ALTER TABLE recovery_sessions ADD COLUMN IF NOT EXISTS ai_confidence NUMERIC(5, 4);
    ALTER TABLE recovery_sessions ADD COLUMN IF NOT EXISTS ai_reasoning TEXT;

    -- recovery_audit_log columns
    ALTER TABLE recovery_audit_log ADD COLUMN IF NOT EXISTS actor VARCHAR(50) DEFAULT 'system';
    ALTER TABLE recovery_audit_log ADD COLUMN IF NOT EXISTS ai_decision JSONB;
    ALTER TABLE recovery_audit_log ADD COLUMN IF NOT EXISTS razorpay_ref VARCHAR(255);
    ALTER TABLE recovery_audit_log ADD COLUMN IF NOT EXISTS amount_at_risk NUMERIC(14, 2);
    ALTER TABLE recovery_audit_log ADD COLUMN IF NOT EXISTS result VARCHAR(50) DEFAULT 'success';
    ALTER TABLE recovery_audit_log ADD COLUMN IF NOT EXISTS previous_hash VARCHAR(64);
    ALTER TABLE recovery_audit_log ADD COLUMN IF NOT EXISTS hash VARCHAR(64);

    -- promise_to_pay columns
    ALTER TABLE promise_to_pay ADD COLUMN IF NOT EXISTS session_id VARCHAR(36);
    ALTER TABLE promise_to_pay ADD COLUMN IF NOT EXISTS detected_from_communication_id VARCHAR(36);
    ALTER TABLE promise_to_pay ADD COLUMN IF NOT EXISTS ai_extracted_text TEXT;
    ALTER TABLE promise_to_pay ADD COLUMN IF NOT EXISTS ai_confidence NUMERIC(5, 4);
    ALTER TABLE promise_to_pay ADD COLUMN IF NOT EXISTS checked_at TIMESTAMP;

    -- checkout_abandonment_signals columns
    ALTER TABLE checkout_abandonment_signals ADD COLUMN IF NOT EXISTS recovery_triggered_at TIMESTAMP;
    ALTER TABLE checkout_abandonment_signals ADD COLUMN IF NOT EXISTS session_id VARCHAR(36);
  `);

  console.log('✓ Supabase columns synchronized successfully!');
  await client.end();
}

main().catch(err => {
  console.error('Schema sync error:', err);
  process.exit(1);
});
