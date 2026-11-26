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
    '[siga-db] pool not created; nama_pasangan will be "-", tanggal_cabut_lepas will be "0000-00-00"'
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
 * - tanggalCabutLepas: latest non-null TanggalJatuhTempo (same order)
 *
 * @param {string} nik
 * @returns {Promise<{ namaPasangan: string|null, tanggalCabutLepas: * }>}
 */
async function findSigaEnrichment(nik) {
  const empty = { namaPasangan: null, tanggalCabutLepas: null };
  if (!pool) return empty;

  const sql = `
    SELECT "NamaSuami", "TanggalJatuhTempo"
    FROM ${TABLE}
    WHERE "NIK" = $1
    ORDER BY "Tanggal" DESC, "Created" DESC NULLS LAST
    LIMIT 50
  `;

  try {
    const result = await pool.query(sql, [nik]);
    let namaPasangan = null;
    let tanggalCabutLepas = null;
    for (const row of result.rows) {
      if (namaPasangan == null) {
        const name = trimOrNull(row.NamaSuami);
        if (name) namaPasangan = name;
      }
      if (tanggalCabutLepas == null && row.TanggalJatuhTempo != null) {
        tanggalCabutLepas = row.TanggalJatuhTempo;
      }
      if (namaPasangan != null && tanggalCabutLepas != null) break;
    }
    return { namaPasangan, tanggalCabutLepas };
  } catch (err) {
    console.error('[siga-db] enrichment query failed', err.message);
    return empty;
  }
}

/** @deprecated use findSigaEnrichment */
async function findNamaPasangan(nik) {
  const { namaPasangan } = await findSigaEnrichment(nik);
  return namaPasangan;
}

module.exports = { pool, findSigaEnrichment, findNamaPasangan };
