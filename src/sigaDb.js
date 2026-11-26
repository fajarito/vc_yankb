const { Pool } = require('pg');
const { attachPoolErrorHandler } = require('./poolError');

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

  attachPoolErrorHandler(pool, 'siga-db');
} else {
  console.warn(
    '[siga-db] pool not created; nama_pasangan will be "-"'
  );
}

function trimOrNull(value) {
  if (value == null) return null;
  const trimmed = String(value).trim();
  return trimmed || null;
}

/**
 * Enrichment from SIGA parent partition table for one NIK.
 * Never throws: returns nulls on missing pool / no row / query failure.
 *
 * - namaPasangan: latest non-empty NamaSuami (Tanggal desc, Created desc)
 * - status: `ok` | `fail` | `skip` (no pool / missing env)
 * - error: short reason when status is `fail`
 *
 * `tanggal_cabut_lepas` is computed from MV metode + tanggal_pemakaian
 * (not from SIGA TanggalJatuhTempo).
 *
 * @param {string} nik
 * @returns {Promise<{ namaPasangan: string|null, status: 'ok'|'fail'|'skip', error?: string }>}
 */
async function findSigaEnrichment(nik) {
  const empty = { namaPasangan: null, status: 'skip' };
  if (!pool) return empty;

  const sql = `
    SELECT "NamaSuami"
    FROM ${TABLE}
    WHERE "NIK" = $1
    ORDER BY "Tanggal" DESC, "Created" DESC NULLS LAST
    LIMIT 50
  `;

  try {
    const result = await pool.query(sql, [nik]);
    let namaPasangan = null;
    for (const row of result.rows) {
      const name = trimOrNull(row.NamaSuami);
      if (name) {
        namaPasangan = name;
        break;
      }
    }
    return { namaPasangan, status: 'ok' };
  } catch (err) {
    const message = err && err.message ? String(err.message) : 'unknown error';
    return {
      namaPasangan: null,
      status: 'fail',
      error: message,
    };
  }
}

/** @deprecated use findSigaEnrichment */
async function findNamaPasangan(nik) {
  const { namaPasangan } = await findSigaEnrichment(nik);
  return namaPasangan;
}

module.exports = { pool, findSigaEnrichment, findNamaPasangan };
