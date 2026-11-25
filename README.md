# vc_yankb

Lean Node.js + Express API for **hasil pelayanan KB** (family planning service results), looking up Postgres materialized view `sigabaru.mv_bnba_akseptor_2026` in database `BKKBN` by NIK.

Protected with API key. Call `/api/kb/*` with header `X-API-Key` matching env `API_KEY`. `GET /health` and `GET /api/docs` stay public. JWT login (`POST /api/auth/login`) is removed.

## API docs

OpenAPI 3 spec: [`docs/openapi.yaml`](docs/openapi.yaml).

With the server running, interactive Swagger UI is at `GET /api/docs` (raw YAML also at `GET /api/docs/openapi.yaml`). Both are public (no API key).

**Try it out** uses the OpenAPI `servers` entry `/` (same origin as the docs page), so it works on OpenShift and any deployed host—not only `localhost`. Localhost remains listed as an optional second server for local runs.

## Requirements

- Node.js 18+
- Access to Postgres (`BKKBN` on port `5435`)

## Setup

```bash
cp .env.example .env
# put your Postgres + API_KEY in .env only (never commit .env)
npm install
npm start
```

Dev (auto-restart):

```bash
npm run dev
```

Local runs need your own `DB_*` and `API_KEY` in `.env`. This repo does not include a live host or credentials; the API was built and reviewed without connecting to Postgres.

## Environment

All secrets live in `.env` (see `.env.example`). Do not put secrets in source or commit them.

| Variable      | Default | Description                                   |
|---------------|---------|-----------------------------------------------|
| `PORT`        | `3000`  | HTTP listen port                              |
| `DB_HOST`     | —       | Postgres host (required, your secret)         |
| `DB_PORT`     | `5435`  | Postgres port                                 |
| `DB_NAME`     | `BKKBN` | Database name                                 |
| `DB_USER`     | —       | DB user (required)                            |
| `DB_PASSWORD` | —       | DB password (required)                        |
| `DB_SSL`      | `false` | Set `true` to enable SSL                      |
| `API_KEY`     | —       | Shared secret for `X-API-Key` (required)      |

`.gitignore` excludes `.env`. Set a real `API_KEY` only in local `.env` / secrets — never commit it.

Legacy JWT vars (`JWT_SECRET`, `JWT_EXPIRES_IN`, `AUTH_USERNAME`, `AUTH_PASSWORD`) are unused and appear commented in `.env.example` for reference only.

## Endpoints

### `GET /api/docs`

Swagger UI (public). Spec file: [`docs/openapi.yaml`](docs/openapi.yaml). Requests from **Try it out** go to the current host (`servers: /`), matching the Route URL on OpenShift.

### `GET /health`

Liveness + DB ping (public). Returns `200` with `{ status: "ok", db: "up" }` or `503` if DB is unreachable.

### `GET /api/kb/akseptor/:nik`

Requires header `X-API-Key: <API_KEY>`.

Returns a structured JSON object for the NIK: personal biodata once (`pribadi`), all service rows as `layanan[]` sorted by `tanggalKb` descending, plus `meta`.

Also accepts query form: `GET /api/kb/akseptor?nik=...`

- **401** — missing/invalid `X-API-Key` → `{ "error": "Unauthorized" }`
- **400** — NIK tidak valid: `{ "error": "NIK tidak valid", "message": "..." }` (missing, not exactly 16 digits, or all 16 digits identical)
- **404** — `{ "error": "Tidak ditemukan", "message": "Data akseptor untuk NIK tersebut tidak ditemukan" }`
- **500** — database error

NIK column is queried as `"NIK"` (quoted, case-sensitive). `pribadi` is taken from the newest layanan row.

## Example

```bash
# use API key on KB routes
curl -s "http://localhost:3000/api/kb/akseptor/3202374707880005" \
  -H "X-API-Key: $API_KEY" | jq .
# or
curl -s "http://localhost:3000/api/kb/akseptor?nik=3202374707880005" \
  -H "X-API-Key: $API_KEY" | jq .

# health and docs stay public
curl -s "http://localhost:3000/health" | jq .
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3000/api/docs"
```

Example `200` KB body:

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

## OpenShift deploy

**Project / namespace:** `vc-yankb`.

Node 20 API image (non-root, listens on `PORT` / **8080**, binds `0.0.0.0`). Manifests under `deploy/openshift/`. Do **not** commit secrets — create them in the cluster.

### 1. Create Secret (once per cluster / project)

Values come from your local `.env` only. Never put them in git.

```bash
oc project vc-yankb
oc create secret generic vc-yankb-secrets \
  --from-literal=DB_HOST='...' \
  --from-literal=DB_USER='...' \
  --from-literal=DB_PASSWORD='...' \
  --from-literal=API_KEY='...' \
  --from-literal=DB_SSL='false'
```

To rotate later: `oc delete secret vc-yankb-secrets -n vc-yankb` then recreate, then `oc rollout restart deployment/vc-yankb -n vc-yankb`.

If an existing secret still has JWT/`AUTH_*` keys, replace it with the command above (include `API_KEY`) and restart the deployment.

### 2. Build & push image

```bash
# From repo root — namespace vc-yankb
podman build -t image-registry.openshift-image-registry.svc:5000/vc-yankb/vc-yankb:latest .
podman push image-registry.openshift-image-registry.svc:5000/vc-yankb/vc-yankb:latest
```

Or with OpenShift Build:

```bash
oc project vc-yankb
oc new-build --name=vc-yankb --binary --strategy=docker
oc start-build vc-yankb --from-dir=. --follow
```

### 3. Optional Route host

Set `spec.host` in `deploy/openshift/route.yaml` if you need a fixed hostname; otherwise OpenShift generates one.

### 4. Apply manifests

```bash
oc project vc-yankb
oc apply -f deploy/openshift/configmap.yaml
oc apply -f deploy/openshift/deployment.yaml
oc apply -f deploy/openshift/service.yaml
oc apply -f deploy/openshift/route.yaml
oc get route vc-yankb -n vc-yankb
```

Smoke after Route is ready: `GET /health`, `GET /api/docs`.

ConfigMap holds non-secrets (`PORT`, `DB_PORT`, `DB_NAME`, `APP_NAME`). Secret `vc-yankb-secrets` supplies `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `API_KEY` (and optional `DB_SSL`).

## Notes

- No DB host/user/password or API key is hardcoded; configure them only in `.env` or OpenShift Secret.
- Sorting: parse `tanggalkb` as `D/M/YYYY` (or `DD/MM/YYYY`); if parse fails, fall back to `Tahun` + `Bulan`. Newest first.
