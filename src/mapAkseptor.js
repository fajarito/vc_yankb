/**
 * Map MV rows → one flat snake_case object (latest layanan for NIK).
 * Empty / missing values → "-". Dates → YYYY-MM-DD or "-".
 */

function col(row, ...names) {
  for (const name of names) {
    if (Object.prototype.hasOwnProperty.call(row, name)) {
      return row[name];
    }
  }
  const lowerMap = Object.create(null);
  for (const key of Object.keys(row)) {
    lowerMap[key.toLowerCase()] = row[key];
  }
  for (const name of names) {
    const key = name.toLowerCase();
    if (key in lowerMap) return lowerMap[key];
  }
  return null;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function isValidYmd(year, month, day) {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const d = new Date(Date.UTC(year, month - 1, day));
  return (
    d.getUTCFullYear() === year &&
    d.getUTCMonth() === month - 1 &&
    d.getUTCDate() === day
  );
}

/**
 * Normalize a date-like value to `YYYY-MM-DD`, or null if empty/unparseable.
 * Accepts: Date (e.g. from pg), D/M/YYYY, DD/MM/YYYY, ISO date, ISO datetime.
 */
function formatDateYmd(raw) {
  if (raw == null || raw === '') return null;

  if (raw instanceof Date) {
    if (Number.isNaN(raw.getTime())) return null;
    const y = raw.getUTCFullYear();
    const m = raw.getUTCMonth() + 1;
    const d = raw.getUTCDate();
    if (!isValidYmd(y, m, d)) return null;
    return `${y}-${pad2(m)}-${pad2(d)}`;
  }

  const s = String(raw).trim();
  if (!s) return null;

  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/.exec(s);
  if (iso) {
    const year = Number(iso[1]);
    const month = Number(iso[2]);
    const day = Number(iso[3]);
    if (!isValidYmd(year, month, day)) return null;
    return `${iso[1]}-${iso[2]}-${iso[3]}`;
  }

  const slash = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (slash) {
    const day = Number(slash[1]);
    const month = Number(slash[2]);
    const year = Number(slash[3]);
    if (!isValidYmd(year, month, day)) return null;
    return `${year}-${pad2(month)}-${pad2(day)}`;
  }

  return null;
}

/** Empty / missing → "-". */
function dash(value) {
  if (value == null) return '-';
  const trimmed = String(value).trim();
  return trimmed || '-';
}

function dashDate(raw) {
  return dash(formatDateYmd(raw));
}

/** Parse date-like value → UTC midnight timestamp ms, or null. */
function parseTanggalKb(raw) {
  const ymd = formatDateYmd(raw);
  if (!ymd) return null;
  const [year, month, day] = ymd.split('-').map(Number);
  return Date.UTC(year, month - 1, day);
}

function sortKey(row) {
  const fromDate = parseTanggalKb(col(row, 'tanggalkb'));
  if (fromDate != null) return fromDate;

  const tahun = Number(col(row, 'Tahun', 'tahun'));
  const bulan = Number(col(row, 'Bulan', 'bulan'));
  const y = Number.isFinite(tahun) ? tahun : 0;
  const mo = Number.isFinite(bulan) && bulan >= 1 && bulan <= 12 ? bulan : 1;
  return Date.UTC(y, mo - 1, 1);
}

function sortRowsNewestFirst(rows) {
  return [...rows].sort((a, b) => sortKey(b) - sortKey(a));
}

/**
 * metode_kontrasepsi: prefer jenisalokon, else jenistindakan.
 */
function metodeKontrasepsi(row) {
  const alokon = col(row, 'jenisalokon');
  if (alokon != null && String(alokon).trim()) return String(alokon).trim();
  const tindakan = col(row, 'jenistindakan');
  if (tindakan != null && String(tindakan).trim()) return String(tindakan).trim();
  return '-';
}

/**
 * jenis_kelamin from NIK digits 7–8 (1-based; string index 6–7).
 * 01–31 → "Laki-laki"; 41–71 → "Perempuan" (calendar day = value − 40); else "-".
 */
function jenisKelaminFromNik(nik) {
  const s = String(nik ?? '');
  if (!/^\d{16}$/.test(s)) return '-';
  const dayCode = Number(s.slice(6, 8));
  if (!Number.isFinite(dayCode)) return '-';
  if (dayCode >= 1 && dayCode <= 31) return 'Laki-laki';
  if (dayCode >= 41 && dayCode <= 71) return 'Perempuan';
  return '-';
}

/**
 * If nama_pasangan equals nama_lengkap (trim + case-insensitive), use "-".
 * Both args are already dash()-normalized (trimmed).
 */
function resolveNamaPasangan(namaLengkap, namaPasangan) {
  if (namaPasangan === '-') return '-';
  if (namaPasangan.toLowerCase() === namaLengkap.toLowerCase()) return '-';
  return namaPasangan;
}

/**
 * @param {object} row — raw MV row
 * @param {{ namaPasangan?: string|null, tanggalCabutLepas?: string|Date|null }} siga
 * @param {string} [nik] — used to derive jenis_kelamin
 */
function mapDataRow(row, siga = {}, nik = '') {
  const nama_lengkap = dash(col(row, 'NamaPesertaKB'));
  const nama_pasangan = resolveNamaPasangan(
    nama_lengkap,
    dash(siga.namaPasangan)
  );
  return {
    nama_lengkap,
    tanggal_lahir: dashDate(col(row, 'tanggal_lahir')),
    jenis_kelamin: jenisKelaminFromNik(nik),
    nama_pasangan,
    asuransi: dash(col(row, 'penggunaanasuransi')),
    metode_kontrasepsi: metodeKontrasepsi(row),
    tanggal_pemakaian: dashDate(col(row, 'tanggalkb')),
    tanggal_cabut_lepas: dashDate(siga.tanggalCabutLepas),
  };
}

/**
 * @param {string} nik
 * @param {object[]} rows — raw MV rows for one NIK
 * @param {{ namaPasangan?: string|null, tanggalCabutLepas?: string|Date|null }} [siga]
 */
function mapAkseptorResponse(nik, rows, siga = {}) {
  const newest = sortRowsNewestFirst(rows)[0];
  return {
    nik,
    ...mapDataRow(newest, siga, nik),
  };
}

module.exports = {
  mapAkseptorResponse,
  mapDataRow,
  jenisKelaminFromNik,
  resolveNamaPasangan,
  sortRowsNewestFirst,
  parseTanggalKb,
  formatDateYmd,
  dash,
  col,
};
