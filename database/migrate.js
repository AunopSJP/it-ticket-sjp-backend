const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');
require('dotenv').config({ path: process.env.ENV_FILE || path.join(__dirname, '..', '.env') });

const client = new Client({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

async function migrate() {
  await client.connect();
  await client.query('SELECT pg_advisory_lock($1)', [73402026]);
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      migration_name varchar PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    const { rows: [{ exists }] } = await client.query(
      "SELECT to_regclass('public.admin_tb') IS NOT NULL AS exists",
    );
    if (!exists) {
      await client.query('BEGIN');
      try {
        await client.query(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
        await client.query("INSERT INTO schema_migrations(migration_name) VALUES ('000_schema_baseline') ON CONFLICT DO NOTHING");
        await client.query('COMMIT');
        console.log('Applied fresh schema baseline');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
    const migrationDir = path.join(__dirname, 'migrations');
    for (const file of fs.readdirSync(migrationDir).filter((name) => name.endsWith('.sql')).sort()) {
      const applied = await client.query('SELECT 1 FROM schema_migrations WHERE migration_name = $1', [file]);
      if (applied.rowCount) continue;
      await client.query('BEGIN');
      try {
        await client.query(fs.readFileSync(path.join(migrationDir, file), 'utf8'));
        await client.query('INSERT INTO schema_migrations(migration_name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        console.log(`Applied ${file}`);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [73402026]).catch(() => undefined);
    await client.end();
  }
}

migrate().catch((error) => {
  console.error(`Migration failed: ${error.message}`);
  process.exitCode = 1;
});
