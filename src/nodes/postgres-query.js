import pg from 'pg';
import { db } from '../db/client.js';
import { assertSafeConnectionTarget } from '../utils/safe-fetch.js';

const { Pool } = pg;
const credentialPools = new Map();

function getPool(credential) {
  if (!credential?.data?.connectionString) return db;
  const key = credential.data.connectionString;
  if (!credentialPools.has(key)) {
    credentialPools.set(key, new Pool({ connectionString: key, max: 3 }));
  }
  return credentialPools.get(key);
}

export async function postgresQuery({ config, credential }) {
  const { query, params: paramsRaw = '[]' } = config;
  if (!query) throw new Error('Postgres Query: query is required');

  let params;
  try {
    params = typeof paramsRaw === 'string' ? JSON.parse(paramsRaw) : (Array.isArray(paramsRaw) ? paramsRaw : []);
  } catch {
    throw new Error('Postgres Query: params must be a valid JSON array');
  }

  // SSRF: block a user-supplied credential pointed at internal infra
  if (credential?.data?.connectionString) {
    await assertSafeConnectionTarget(credential.data.connectionString);
  }

  const pool = getPool(credential);

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
