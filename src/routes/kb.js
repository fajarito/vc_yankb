const express = require('express');
const { query } = require('../db');
const { mapAkseptorResponse } = require('../mapAkseptor');

const router = express.Router();

const MV = 'sigabaru.mv_bnba_akseptor_2026';
const NIK_RE = /^\d{16}$/;

function normalizeNik(raw) {
  if (raw == null) return null;
  return String(raw).trim();
}

function validateNik(nik) {
  if (!nik) {
    return { ok: false, status: 400, error: 'NIK is required' };
  }
  if (!NIK_RE.test(nik)) {
    return {
      ok: false,
      status: 400,
      error: 'NIK must be exactly 16 digits',
    };
  }
  return { ok: true, nik };
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
  try {
    const nikRaw = req.params.nik ?? req.query.nik;
    const check = validateNik(normalizeNik(nikRaw));
    if (!check.ok) {
      return res.status(check.status).json({ error: check.error });
    }

    const rows = await findAkseptorByNik(check.nik);
    if (!rows.length) {
      return res.status(404).json({
        error: 'No KB akseptor records found for this NIK',
        nik: check.nik,
      });
    }

    return res.json(mapAkseptorResponse(check.nik, rows));
  } catch (err) {
    console.error('[kb] query failed', err.message);
    return res.status(500).json({ error: 'Database query failed' });
  }
});

module.exports = router;
