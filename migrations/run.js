/**
 * Otto migration runner.
 * Applies any SQL files in this directory that haven't been applied yet.
 * Tracks applied migrations in a `_migrations` table.
 *
 * Two ways to use it:
 *   1. CLI:     DATABASE_URL=... node migrations/run.js
 *   2. On boot: import { runMigrations } from '../migrations/run.js'
 *               await runMigrations({ pool: db.pool, log })      // see src/server.js
 *
 * Concurrency-safe: a Postgres advisory lock serializes runs, so if several
 * replicas (or a separate worker) boot at once, the first applies and the rest
 * skip — no DDL races.
 */
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { config } from 'dotenv';
import pg from 'pg';

const { Pool } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));

// Fixed key so every Otto instance contends on the same advisory lock.
const MIGRATION_LOCK_KEY = 8675309;

/**
 * Apply all pending migrations. Idempotent and concurrency-safe.
 *
 * @param {object}              [opts]
 * @param {import('pg').Pool}   [opts.pool] reuse an existing pool; one is created (and closed) if omitted
 * @param {(msg: string) => void} [opts.log] log sink (default: console.log)
 * @returns {Promise<{ applied: number, skipped: number }>}
 */
export async function runMigrations({ pool, log = console.log } = {}) {
  const ownPool = !pool;
  pool = pool ?? new Pool({ connectionString: process.env.DATABASE_URL });

  const client = await pool.connect();
  let applied = 0;
  let skipped = 0;
  try {
    // Serialize across replicas/processes so two instances don't race the DDL.
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_KEY]);

    // Ensure migration tracking table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        name       TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const { rows } = await client.query('SELECT name FROM _migrations');
    const appliedSet = new Set(rows.map((r) => r.name));

    const files = readdirSync(__dirname)
      .filter((f) => f.endsWith('.sql'))
      .sort(); // alphabetical = chronological with numbered prefixes

    for (const file of files) {
      if (appliedSet.has(file)) {
        skipped++;
        continue;
      }

      const sql = readFileSync(join(__dirname, file), 'utf8');
      log(`  apply ${file} ...`);
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO _migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        applied++;
        log(`  done  ${file}`);
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw new Error(`migration ${file} failed: ${err.message}`);
      }
    }

    return { applied, skipped };
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY]).catch(() => {});
    client.release();
    if (ownPool) await pool.end();
  }
}

// ── CLI entrypoint: `node migrations/run.js` ─────────────────────────────────
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  config(); // load .env for standalone CLI use (the server already loads dotenv)
  runMigrations()
    .then(({ applied, skipped }) => {
      console.log(`Migrations complete. applied=${applied}, skipped=${skipped}`);
      process.exit(0);
    })
    .catch((err) => {
      console.error(`Migration FAILED: ${err.message}`);
      process.exit(1);
    });
}
