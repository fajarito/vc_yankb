/**
 * Map MV rows → { nik, pribadi, layanan[], meta }.
 * Field names follow the approved camelCase design.
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

/** Parse D/M/YYYY or DD/MM/YYYY → timestamp ms, or null. */
function parseTanggalKb(raw) {
  if (raw == null || raw === '') return null;
  const s = String(raw).trim();
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const ms = Date.UTC(year, month - 1, day);
  const d = new Date(ms);
  if (
    d.getUTCFullYear() !== year ||
    d.getUTCMonth() !== month - 1 ||
    d.getUTCDate() !== day
  ) {
    return null;
  }
  return ms;
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

function mapPribadi(row) {
  return {
    nama: col(row, 'NamaPesertaKB'),
    tanggalLahir: col(row, 'tanggal_lahir'),
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
    tanggalKb: col(row, 'tanggalkb'),
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
 */
function mapAkseptorResponse(nik, rows) {
  const sorted = sortRowsNewestFirst(rows);
  const newest = sorted[0];
  return {
    nik,
    pribadi: mapPribadi(newest),
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
  col,
};
