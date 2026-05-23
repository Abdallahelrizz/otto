/**
 * Otto migration runner.
 * Applies any SQL files in this directory that haven't been applied yet.
 * Tracks applied migrations in a `_migrations` table.
 *
 * Usage:
 *   DATABASE_URL=... node migrations/run.js
 */
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const { Pool } = pg;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  // Ensure migration tracking table exists
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name       TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const { rows: applied } = await pool.query('SELECT name FROM _migrations');
  const appliedSet = new Set(applied.map(r => r.name));

  const files = readdirSync(__dirname)
    .filter(f => f.endsWith('.sql'))
    .sort(); // alphabetical = chronological with numbered prefixes

  for (const file of files) {
    if (appliedSet.has(file)) {
      console.log(`  skip  ${file}`);
      continue;
    }

    const sql = readFileSync(join(__dirname, file), 'utf8');
    console.log(`  apply ${file} ...`);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO _migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`  done  ${file}`);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`  FAIL  ${file}: ${err.message}`);
      process.exit(1);
    } finally {
      client.release();
    }
  }

  console.log('Migrations complete.');
  await pool.end();
}

run();
