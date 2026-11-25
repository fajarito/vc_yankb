const { Pool } = require('pg');

const required = ['DB_HOST', 'DB_USER', 'DB_PASSWORD'];
for (const key of required) {
  if (!process.env[key]) {
    console.warn(`[db] missing env ${key}`);
  }
}

const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5435),
  database: process.env.DB_NAME || 'BKKBN',
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

pool.on('error', (err) => {
  console.error('[db] unexpected pool error', err.message);
});

async function query(text, params) {
  return pool.query(text, params);
}

async function healthCheck() {
  await pool.query('SELECT 1');
}

module.exports = { pool, query, healthCheck };
