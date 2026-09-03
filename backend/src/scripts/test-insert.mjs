import pg from 'pg';

const { Client } = pg;
const client = new Client({
  connectionString: 'postgresql://postgres:Adianu7890%40@db.jnbenaukuoohvkvnzjfw.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await client.connect();
  console.log('Connected to Supabase');

  try {
    const res = await client.query(`
      INSERT INTO invoices (
        id, tenant_id, invoice_no, client_name, contact_email,
        invoice_amount, currency, due_date, payment_status
      ) VALUES (
        'rcv_pay_001', 'tenant_demo_001', 'INV-001', 'Client 1',
        'c1@ex.com', '5000', 'INR', '2026-09-01', 'Overdue'
      ) ON CONFLICT (id) DO UPDATE SET updated_at = NOW()
      RETURNING id
    `);
    console.log('Invoice inserted successfully:', res.rows[0]);
  } catch (err) {
    console.error('Invoice insert error:', err);
  }

  try {
    const res = await client.query(`
      INSERT INTO recovery_sessions (
        id, tenant_id, invoice_id, amount_at_risk, strategy, incident_lane
      ) VALUES (
        'sess_rcv_pay_001', 'tenant_demo_001', 'rcv_pay_001', '5000', 'payment_link_refresh', 'payment_degradation'
      ) ON CONFLICT (id) DO UPDATE SET updated_at = NOW()
      RETURNING id
    `);
    console.log('Recovery session inserted successfully:', res.rows[0]);
  } catch (err) {
    console.error('Recovery session insert error:', err);
  }

  await client.end();
}

main();
