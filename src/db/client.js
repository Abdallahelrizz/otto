import pg from 'pg';

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  // Without timeouts, a dead connection or hung statement could occupy each of the ten
  // pool slots forever and turn one dependency failure into a permanent server-wide DoS.
  connectionTimeoutMillis: 10_000,
  query_timeout: 30_000,
  statement_timeout: 30_000,
  idle_in_transaction_session_timeout: 30_000,
});

export const db = {
  query: (text, params) => pool.query(text, params),
  pool,
};
