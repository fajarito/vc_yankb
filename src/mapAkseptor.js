/**
 * Map MV rows → { nik, pribadi, layanan[], meta }.
 * Field names follow the approved camelCase design.
 * Date fields in JSON are always `YYYY-MM-DD` (no time/Z).
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

/** Empty / missing / SIGA-fail → "-" (never null). */
function normalizeNamaPasangan(value) {
  if (value == null) return '-';
  const trimmed = String(value).trim();
  return trimmed || '-';
}

function mapPribadi(row, namaPasangan = null) {
  return {
    nama: col(row, 'NamaPesertaKB'),
    namaPasangan: normalizeNamaPasangan(namaPasangan),
    tanggalLahir: formatDateYmd(col(row, 'tanggal_lahir')),
    stsKawin: col(row, 'sts_kawin'),
    hubunganDenganKk: col(row, 'hubungan_dengan_kk'),
    kki: col(row, 'kki'),
    wilayah: {
      idProv: col(row, 'idprov'),
      kodeProv: col(row, 'kodeprov'),
      namaProv: col(row, 'namaprov'),
      idKab: col(row, 'idkab'),
      kodeKab: col(row, 'kodekab'),
      namaKab: col(row, 'namakab'),
      idKec: col(row, 'idkec'),
      kodeKec: col(row, 'kodekec'),
      namaKec: col(row, 'namakec'),
      idKel: col(row, 'idkel'),
      kodeKel: col(row, 'kodekel'),
      namaKel: col(row, 'namakel'),
    },
  };
}

function mapLayanan(row) {
  return {
    tahun: col(row, 'Tahun', 'tahun'),
    bulan: col(row, 'Bulan', 'bulan'),
    tanggalKb: formatDateYmd(col(row, 'tanggalkb')),
    statusPesertaKb: col(row, 'statuspesertakb'),
    jenisTindakan: col(row, 'jenistindakan'),
    jenisAlokon: col(row, 'jenisalokon'),
    informedConsent: col(row, 'InformedConsent'),
    pelayananPascaPersalinan: col(row, 'PelayananPascaPersalinan'),
    pelayananPascaKeguguran: col(row, 'PelayananPascaKeguguran'),
    kasusKomplikasiBerat: col(row, 'KasusKomplikasiBerat'),
    kasusKegagalan: col(row, 'KasusKegagalan'),
    penggunaanAsuransi: col(row, 'penggunaanasuransi'),
    sumberAlokon: col(row, 'sumberalokon'),
    jsKodeSatuSehat: col(row, 'JS_KodeSatuSehat'),
    tempatPelayanan: {
      id: col(row, 'TempatPelayananKBID'),
      nama: col(row, 'NamaTempatPelayananKB'),
    },
  };
}

/**
 * @param {string} nik
 * @param {object[]} rows — raw MV rows for one NIK
 * @param {string|null} [namaPasangan] — from BKKBN_SIGA; empty/missing → "-"
 */
function mapAkseptorResponse(nik, rows, namaPasangan = null) {
  const sorted = sortRowsNewestFirst(rows);
  const newest = sorted[0];
  return {
    nik,
    pribadi: mapPribadi(newest, namaPasangan),
    layanan: sorted.map(mapLayanan),
    meta: {
      jumlahLayanan: sorted.length,
      diurutkan: 'tanggalKb desc',
    },
  };
}

module.exports = {
  mapAkseptorResponse,
  sortRowsNewestFirst,
  parseTanggalKb,
  formatDateYmd,
  col,
};
