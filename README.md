# vc_yankb

Lean Node.js + Express API for **hasil pelayanan KB** (family planning service results), looking up Postgres materialized view `sigabaru.mv_bnba_akseptor_2026` in database `BKKBN` by NIK.

## Requirements

- Node.js 18+
- Access to Postgres (`BKKBN` on port `5435`)

## Setup

```bash
cp .env.example .env
# put your Postgres secrets in .env only (never commit .env)
npm install
npm start
```

Dev (auto-restart):

```bash
npm run dev
```

Local runs need your own `DB_*` secrets in `.env`. This repo does not include a live host or credentials; the API was built and reviewed without connecting to Postgres.

## Environment

All DB settings live in `.env` (see `.env.example`). Do not put secrets in source or commit them.

| Variable      | Default | Description                          |
|---------------|---------|--------------------------------------|
| `PORT`        | `3000`  | HTTP listen port                     |
| `DB_HOST`     | —       | Postgres host (required, your secret)|
| `DB_PORT`     | `5435`  | Postgres port                        |
| `DB_NAME`     | `BKKBN` | Database name                        |
| `DB_USER`     | —       | DB user (required)                   |
| `DB_PASSWORD` | —       | DB password (required)               |
| `DB_SSL`      | `false` | Set `true` to enable SSL             |

`.gitignore` excludes `.env`.

## Endpoints

### `GET /health`

Liveness + DB ping. Returns `200` with `{ status: "ok", db: "up" }` or `503` if DB is unreachable.

### `GET /api/kb/akseptor/:nik`

Returns a structured JSON object for the NIK: personal biodata once (`pribadi`), all service rows as `layanan[]` sorted by `tanggalKb` descending, plus `meta`.

Also accepts query form: `GET /api/kb/akseptor?nik=...`

- **400** — missing NIK or not exactly 16 digits
- **404** — no rows for that NIK
- **500** — database error

NIK column is queried as `"NIK"` (quoted, case-sensitive). `pribadi` is taken from the newest layanan row.

## Example

```bash
curl -s "http://localhost:3000/api/kb/akseptor/3202374707880005" | jq .
# or
curl -s "http://localhost:3000/api/kb/akseptor?nik=3202374707880005" | jq .
curl -s "http://localhost:3000/health" | jq .
```

Example `200` body:

```json
{
  "nik": "3202374707880005",
  "pribadi": {
    "nama": "ATIKAH",
    "tanggalLahir": "7/7/1988",
    "stsKawin": null,
    "hubunganDenganKk": 1,
    "kki": "32023720040008003S00002",
    "wilayah": {
      "idProv": 12,
      "kodeProv": "32",
      "namaProv": "JAWA BARAT",
      "idKab": 148,
      "kodeKab": "02",
      "namaKab": "SUKABUMI",
      "idKec": 423,
      "kodeKec": "37",
      "namaKec": "PABUARAN",
      "idKel": 3694,
      "kodeKel": "2004",
      "namaKel": "BANTARSARI"
    }
  },
  "layanan": [
    {
      "tahun": "2026",
      "bulan": 9,
      "tanggalKb": "29/9/2026",
      "statusPesertaKb": "Peserta KB Ulangan",
      "jenisTindakan": null,
      "jenisAlokon": null,
      "informedConsent": "01",
      "pelayananPascaPersalinan": "",
      "pelayananPascaKeguguran": "",
      "kasusKomplikasiBerat": "",
      "kasusKegagalan": "",
      "penggunaanAsuransi": "BPJS Kesehatan",
      "sumberAlokon": "APBN",
      "jsKodeSatuSehat": null,
      "tempatPelayanan": {
        "id": "320206103",
        "nama": "POLINDES BANTARSARI"
      }
    }
  ],
  "meta": {
    "jumlahLayanan": 1,
    "diurutkan": "tanggalKb desc"
  }
}
```

## Notes

- No DB host/user/password is hardcoded; configure them only in `.env`.
- Sorting: parse `tanggalkb` as `D/M/YYYY` (or `DD/MM/YYYY`); if parse fails, fall back to `Tahun` + `Bulan`. Newest first.
