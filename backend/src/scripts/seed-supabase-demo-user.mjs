import pg from 'pg';

const { Client } = pg;
const client = new Client({
  connectionString: 'postgresql://postgres:Adianu7890%40@db.jnbenaukuoohvkvnzjfw.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await client.connect();
  console.log('Connected to Supabase');
  
  await client.query(`
    INSERT INTO tenants (id, name, slug)
    VALUES ('tenant_demo_001', 'Razorpay Demo Corp', 'razorpay-demo')
    ON CONFLICT (id) DO NOTHING
  `);
  
  await client.query(`
    INSERT INTO users (id, tenant_id, name, email, password_hash, role, email_verified)
    VALUES ('demo_admin', 'tenant_demo_001', 'Razorpay Judge / Demo', 'judge@razorpay.com', 'dummy_hash', 'admin', true)
    ON CONFLICT (id) DO NOTHING
  `);
  
  console.log('Demo tenant and user successfully synced in Supabase!');
  await client.end();
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
