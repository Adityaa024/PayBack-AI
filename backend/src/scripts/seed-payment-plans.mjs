import pg from 'pg';

const { Client } = pg;
const client = new Client({
  connectionString: 'postgresql://postgres:Adianu7890%40@db.jnbenaukuoohvkvnzjfw.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await client.connect();
  const tenantId = 'tenant_demo_001';

  console.log('Seeding payment plan requests for tenant:', tenantId);

  const plans = [
    {
      id: 'plan_req_001',
      invoiceId: 'rcv_b2b_007',
      installments: 3,
      amountPerMonth: '43333.33',
      reason: 'Cashflow constrained due to delayed enterprise client payout. Requesting 3 monthly installments to clear full balance.',
      status: 'pending'
    },
    {
      id: 'plan_req_002',
      invoiceId: 'rcv_pay_004',
      installments: 2,
      amountPerMonth: '3650.00',
      reason: 'Transitioning payment gateway provider. Will clear in 2 bi-weekly tranches.',
      status: 'pending'
    },
    {
      id: 'plan_req_003',
      invoiceId: 'rcv_pay_002',
      installments: 3,
      amountPerMonth: '1633.33',
      reason: 'Pre-approved installment plan under PolicyGuard grace terms.',
      status: 'approved'
    },
    {
      id: 'plan_req_004',
      invoiceId: 'rcv_pay_003',
      installments: 6,
      amountPerMonth: '1016.66',
      reason: 'Exceeds maximum allowed 90-day recovery window.',
      status: 'denied'
    }
  ];

  for (const p of plans) {
    await client.query(`
      INSERT INTO payment_plan_requests (
        id, tenant_id, invoice_id, installments, proposed_amount_per_month, reason, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (id) DO UPDATE SET
        status = EXCLUDED.status,
        reason = EXCLUDED.reason,
        proposed_amount_per_month = EXCLUDED.proposed_amount_per_month;
    `, [p.id, tenantId, p.invoiceId, p.installments, p.amountPerMonth, p.reason, p.status]);
  }

  await client.query(`UPDATE invoices SET has_active_payment_plan = true WHERE id = 'rcv_pay_002';`);

  console.log('Successfully seeded 4 payment plan proposals!');
  await client.end();
}

main().catch(console.error);
