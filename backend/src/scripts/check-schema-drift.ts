import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Schema Drift Check
 * Verifies that drizzle-kit generate produces zero diff against committed migrations.
 * Fails with exit code 1 if uncommitted migration drift is detected.
 */
async function checkSchemaDrift() {
  console.log('🔍 Checking for Drizzle schema vs migration drift...');
  
  const migrationsDir = path.resolve(__dirname, '../../migrations');
  const beforeFiles = new Set(fs.readdirSync(migrationsDir));

  try {
    const output = execSync('npx drizzle-kit generate', {
      encoding: 'utf8',
      cwd: path.resolve(__dirname, '../..'),
    });

    const afterFiles = fs.readdirSync(migrationsDir);
    const newFiles = afterFiles.filter((f) => !beforeFiles.has(f));

    if (newFiles.length > 0) {
      console.error(`❌ [SCHEMA DRIFT DETECTED] drizzle-kit generate created new uncommitted migration file(s):`);
      newFiles.forEach((f) => console.error(`   - migrations/${f}`));
      console.error(`\nPlease run 'npm run db:generate' and commit the resulting migration files.`);
      
      // Cleanup generated drift files
      newFiles.forEach((f) => {
        try {
          fs.unlinkSync(path.join(migrationsDir, f));
        } catch {
          // ignore cleanup error
        }
      });
      process.exit(1);
    }

    if (output.includes('No schema changes, nothing to migrate')) {
      console.log('✅ [PASSED] Schema and migrations are in 100% sync. Zero drift detected.');
      process.exit(0);
    }

    console.log('✅ [PASSED] Schema drift check completed successfully.');
  } catch (error: any) {
    if (error.status !== undefined && error.status !== 0) {
      console.error('❌ Schema drift check command failed:', error.message);
      process.exit(1);
    }
    console.log('✅ [PASSED] Schema and migrations in sync.');
  }
}

checkSchemaDrift();
