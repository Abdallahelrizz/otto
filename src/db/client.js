import pg from 'pg';

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
});

export const db = {
  query: (text, params) => pool.query(text, params),
  pool,
};
