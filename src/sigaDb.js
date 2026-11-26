const { Pool } = require('pg');

const TABLE = 'sigabaru."dat_PelayananKBDetil"';

const required = ['SIGA_DB_HOST', 'SIGA_DB_USER', 'SIGA_DB_PASSWORD'];
let missing = false;
for (const key of required) {
  if (!process.env[key]) {
    console.warn(`[siga-db] missing env ${key}`);
    missing = true;
  }
}

/** @type {import('pg').Pool | null} */
let pool = null;

if (!missing) {
  pool = new Pool({
    host: process.env.SIGA_DB_HOST,
    port: Number(process.env.SIGA_DB_PORT || 5435),
    database: process.env.SIGA_DB_NAME || 'BKKBN_SIGA',
    user: process.env.SIGA_DB_USER,
    password: process.env.SIGA_DB_PASSWORD,
    ssl: process.env.SIGA_DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });

  pool.on('error', (err) => {
    console.error('[siga-db] unexpected pool error', err.message);
  });
} else {
  console.warn(
    '[siga-db] pool not created; pribadi.namaPasangan will be "-"'
  );
}

/**
 * Latest non-empty NamaSuami for NIK from parent partition table.
 * Never throws: returns null on missing pool, no row, or query failure.
 * @param {string} nik
 * @returns {Promise<string|null>}
 */
async function findNamaPasangan(nik) {
  if (!pool) return null;

  const sql = `
    SELECT "NamaSuami"
    FROM ${TABLE}
    WHERE "NIK" = $1
      AND "NamaSuami" IS NOT NULL
      AND BTRIM("NamaSuami") <> ''
    ORDER BY "Tanggal" DESC, "Created" DESC NULLS LAST
    LIMIT 1
  `;

  try {
    const result = await pool.query(sql, [nik]);
    if (!result.rows.length) return null;
    const value = result.rows[0].NamaSuami;
    if (value == null) return null;
    const trimmed = String(value).trim();
    return trimmed || null;
  } catch (err) {
    console.error('[siga-db] namaPasangan query failed', err.message);
    return null;
  }
}

module.exports = { pool, findNamaPasangan };
