const express = require('express');
const { query } = require('../db');
const { findSigaEnrichment } = require('../sigaDb');
const { mapAkseptorResponse } = require('../mapAkseptor');

const router = express.Router();

const MV = 'sigabaru.mv_bnba_akseptor_2026';
const NIK_RE = /^\d{16}$/;
const NIK_SAME_DIGIT_RE = /^(\d)\1{15}$/;

function normalizeNik(raw) {
  if (raw == null) return null;
  return String(raw).trim();
}

function validateNik(nik) {
  if (!nik) {
    return {
      ok: false,
      status: 400,
      error: 'NIK tidak valid',
      message: 'NIK wajib diisi dan harus tepat 16 digit angka',
    };
  }
  if (!NIK_RE.test(nik)) {
    return {
      ok: false,
      status: 400,
      error: 'NIK tidak valid',
      message: 'NIK harus tepat 16 digit angka',
    };
  }
  if (NIK_SAME_DIGIT_RE.test(nik)) {
    return {
      ok: false,
      status: 400,
      error: 'NIK tidak valid',
      message:
        'NIK tidak boleh 16 digit yang sama semua (mis. 0000000000000000 atau 9999999999999999)',
    };
  }
  return { ok: true, nik };
}

/** Mask NIK for logs: keep first 4 + last 4 digits. */
function maskNik(nik) {
  const s = String(nik || '');
  if (s.length !== 16) return '****';
  return `${s.slice(0, 4)}********${s.slice(-4)}`;
}

/**
 * One structured line per GET /api/kb/akseptor.
 * mv: hit|miss|skip|error — siga: ok|fail|skip
 */
function logAkseptorRequest({ nik, status, durationMs, mv, siga, error }) {
  const parts = [
    '[kb.akseptor]',
    `nik=${nik}`,
    `status=${status}`,
    `duration_ms=${durationMs}`,
    `mv=${mv}`,
    `siga=${siga}`,
  ];
  if (error) parts.push(`error=${JSON.stringify(String(error))}`);
  console.log(parts.join(' '));
}

async function findAkseptorByNik(nik) {
  // Quote "NIK" — column is case-sensitive in the materialized view.
  const sql = `
    SELECT *
    FROM ${MV}
    WHERE "NIK" = $1
  `;
  const result = await query(sql, [nik]);
  return result.rows;
}

router.get('/akseptor/:nik?', async (req, res) => {
  const started = Date.now();
  let nikMasked = '-';
  let mv = 'skip';
  let siga = 'skip';
  let errorReason;

  const respond = (status, body) => {
    logAkseptorRequest({
      nik: nikMasked,
      status,
      durationMs: Date.now() - started,
      mv,
      siga,
      error: errorReason,
    });
    return res.status(status).json(body);
  };

  try {
    const nikRaw = req.params.nik ?? req.query.nik;
    const check = validateNik(normalizeNik(nikRaw));
    if (!check.ok) {
      errorReason = check.message;
      return respond(check.status, {
        error: check.error,
        message: check.message,
      });
    }

    nikMasked = maskNik(check.nik);

    const rows = await findAkseptorByNik(check.nik);
    if (!rows.length) {
      mv = 'miss';
      errorReason = 'Tidak ditemukan';
      return respond(404, {
        error: 'Tidak ditemukan',
        message: 'Data akseptor untuk NIK tersebut tidak ditemukan',
      });
    }

    mv = 'hit';

    // SIGA lookup is best-effort; findSigaEnrichment never throws.
    const enrich = await findSigaEnrichment(check.nik);
    siga = enrich.status;
    if (enrich.status === 'fail' && enrich.error) {
      errorReason = enrich.error;
    }

    return respond(200, mapAkseptorResponse(check.nik, rows, enrich));
  } catch (err) {
    mv = 'error';
    errorReason = err && err.message ? err.message : 'unknown error';
    console.error('[kb] query failed', errorReason);
    return respond(500, { error: 'Database query failed' });
  }
});

module.exports = router;
