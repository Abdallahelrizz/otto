import pg from 'pg';
import { db } from '../db/client.js';
import { assertSafeConnectionTarget } from '../utils/safe-fetch.js';

const { Pool } = pg;
const credentialPools = new Map();

// Allowing the Postgres node to run against Otto's OWN control-plane database is a
// cross-tenant data-exposure risk (arbitrary SQL over users / api_keys / credentials).
// It is therefore opt-in and only ever intended for single-tenant self-hosting.
const ALLOW_SYSTEM_DB = process.env.POSTGRES_NODE_ALLOW_SYSTEM_DB === 'true';

function getPool(credential) {
  const key = credential.data.connectionString;
  if (!credentialPools.has(key)) {
    credentialPools.set(key, new Pool({ connectionString: key, max: 3 }));
  }
  return credentialPools.get(key);
}

export async function postgresQuery({ config, credential }) {
  const { query, params: paramsRaw = '[]' } = config;
  if (!query) throw new Error('Postgres Query: query is required');

  // Require an explicit Postgres credential. Never silently fall back to Otto's
  // own database. (Set POSTGRES_NODE_ALLOW_SYSTEM_DB=true to opt into the legacy
  // shared-DB behaviour on a trusted single-tenant instance.)
  if (!credential?.data?.connectionString) {
    if (!ALLOW_SYSTEM_DB) {
      throw new Error('Postgres Query: select a Postgres credential on this node. Add one under Credentials.');
    }
  }

  let params;
  try {
    params = typeof paramsRaw === 'string' ? JSON.parse(paramsRaw) : paramsRaw;
    // CORRECTNESS: non-array params were silently replaced, producing misleading bind errors.
    if (!Array.isArray(params)) throw new Error('not an array');
  } catch {
    throw new Error('Postgres Query: params must be a valid JSON array');
  }

  // SSRF: block a user-supplied credential pointed at internal infra
  if (credential?.data?.connectionString) {
    await assertSafeConnectionTarget(credential.data.connectionString);
  }

  const pool = credential?.data?.connectionString ? getPool(credential) : db;

  // 30-second query timeout via statement_timeout
  const client = await pool.connect();
  try {
    await client.query('SET statement_timeout = 30000');
    const result = await client.query(query, params);
    return { rows: result.rows, rowCount: result.rowCount };
  } finally {
    client.release();
  }
}
