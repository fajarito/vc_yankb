# vc_yankb

Lean Node.js + Express API for **hasil pelayanan KB** (family planning service results), looking up Postgres materialized view `sigabaru.mv_bnba_akseptor_2026` in database `BKKBN` by NIK. Response is flat snake_case rows under `data[]`. SIGA (`BKKBN_SIGA` → `sigabaru."dat_PelayananKBDetil"`) enriches `nama_pasangan` (`NamaSuami`) and `tanggal_cabut_lepas` (`TanggalJatuhTempo`). Empty/missing → `"-"`.

Protected with API key. Call `/api/kb/*` with header `X-API-Key` matching env `API_KEY`. `GET /health` and `GET /api/docs` stay public. JWT login (`POST /api/auth/login`) is removed.

## API docs

OpenAPI 3 spec: [`docs/openapi.yaml`](docs/openapi.yaml).

With the server running, interactive Swagger UI is at `GET /api/docs` (raw YAML also at `GET /api/docs/openapi.yaml`). Both are public (no API key).

**Try it out** uses the OpenAPI `servers` entry `/` (same origin as the docs page), so it works on OpenShift and any deployed host—not only `localhost`. Localhost remains listed as an optional second server for local runs.

## Requirements

- Node.js 18+
- Access to Postgres `BKKBN` (MV) and optionally `BKKBN_SIGA` (`nama_pasangan`, `tanggal_cabut_lepas`) on port `5435`

## Setup

```bash
cp .env.example .env
# put your Postgres (DB_* + SIGA_DB_*) + API_KEY in .env only (never commit .env)
npm install
npm start
```

Dev (auto-restart):

```bash
npm run dev
```

Local runs need your own `DB_*`, optional `SIGA_DB_*`, and `API_KEY` in `.env`. This repo does not include a live host or credentials; the API was built and reviewed without connecting to Postgres.

## Environment

All secrets live in `.env` (see `.env.example`). Do not put secrets in source or commit them.

| Variable           | Default       | Description                                              |
|--------------------|---------------|----------------------------------------------------------|
| `PORT`             | `3000`        | HTTP listen port                                         |
| `DB_HOST`          | —             | Primary Postgres host (required, your secret)            |
| `DB_PORT`          | `5435`        | Primary Postgres port                                    |
| `DB_NAME`          | `BKKBN`       | Primary database name                                    |
| `DB_USER`          | —             | Primary DB user (required)                               |
| `DB_PASSWORD`      | —             | Primary DB password (required)                           |
| `DB_SSL`           | `false`       | Set `true` to enable SSL on primary                      |
| `SIGA_DB_HOST`     | —             | SIGA Postgres host (spouse / cabut-lepas enrich)         |
| `SIGA_DB_PORT`     | `5435`        | SIGA Postgres port                                       |
| `SIGA_DB_NAME`     | `BKKBN_SIGA`  | SIGA database name                                       |
| `SIGA_DB_USER`     | —             | SIGA DB user                                             |
| `SIGA_DB_PASSWORD` | —             | SIGA DB password                                         |
| `SIGA_DB_SSL`      | `false`       | Set `true` to enable SSL on SIGA                         |
| `API_KEY`          | —             | Shared secret for `X-API-Key` (required)                 |

`.gitignore` excludes `.env`. Set a real `API_KEY` only in local `.env` / secrets — never commit it.

If `SIGA_DB_*` is missing or the SIGA query fails, the API still returns the MV response with `nama_pasangan` / `tanggal_cabut_lepas` as `"-"` (error logged server-side; no 5xx).

Legacy JWT vars (`JWT_SECRET`, `JWT_EXPIRES_IN`, `AUTH_USERNAME`, `AUTH_PASSWORD`) are unused and appear commented in `.env.example` for reference only.

## Endpoints

### `GET /api/docs`

Swagger UI (public). Spec file: [`docs/openapi.yaml`](docs/openapi.yaml). Requests from **Try it out** go to the current host (`servers: /`), matching the Route URL on OpenShift.

### `GET /health`

Liveness + DB ping (public). Returns `200` with `{ status: "ok", db: "up" }` or `503` if DB is unreachable.

### `GET /api/kb/akseptor/:nik`

Requires header `X-API-Key: <API_KEY>`.

Returns `{ nik, data[], meta }`. Each `data` item is one layanan row (newest `tanggal_pemakaian` first), flat snake_case. Empty/missing fields are `"-"`.

Also accepts query form: `GET /api/kb/akseptor?nik=...`

- **401** — missing/invalid `X-API-Key` → `{ "error": "Unauthorized" }`
- **400** — NIK tidak valid: `{ "error": "NIK tidak valid", "message": "..." }` (missing, not exactly 16 digits, or all 16 digits identical)
- **404** — `{ "error": "Tidak ditemukan", "message": "Data akseptor untuk NIK tersebut tidak ditemukan" }`
- **500** — primary (MV) database error

NIK column is queried as `"NIK"` (quoted, case-sensitive). SIGA enrich: latest non-empty `"NamaSuami"` → `nama_pasangan`; latest non-null `"TanggalJatuhTempo"` → `tanggal_cabut_lepas`. `jenis_kelamin` is `"-"` unless the MV exposes a gender column (current sample has none). `metode_kontrasepsi` prefers `jenisalokon`, else `jenistindakan`.

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
  "data": [
    {
      "nama_lengkap": "ATIKAH",
      "tanggal_lahir": "1988-07-07",
      "jenis_kelamin": "-",
      "nama_pasangan": "MUHAMMAD RAFIL",
      "asuransi": "BPJS Kesehatan",
      "metode_kontrasepsi": "-",
      "tanggal_pemakaian": "2026-09-29",
      "tanggal_cabut_lepas": "-"
    }
  ],
  "meta": {
    "jumlah": 1,
    "diurutkan": "tanggal_pemakaian desc"
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
  --from-literal=DB_SSL='false' \
  --from-literal=SIGA_DB_HOST='...' \
  --from-literal=SIGA_DB_USER='...' \
  --from-literal=SIGA_DB_PASSWORD='...' \
  --from-literal=SIGA_DB_SSL='false' \
  --from-literal=API_KEY='...'
```

To rotate later: `oc delete secret vc-yankb-secrets -n vc-yankb` then recreate, then `oc rollout restart deployment/vc-yankb -n vc-yankb`.

If an existing secret still has JWT/`AUTH_*` keys (or lacks `SIGA_DB_*` / `API_KEY`), replace it with the command above and restart the deployment.

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

ConfigMap holds non-secrets (`PORT`, `DB_PORT`, `DB_NAME`, `APP_NAME`, `SIGA_DB_PORT`, `SIGA_DB_NAME`). Secret `vc-yankb-secrets` supplies `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `API_KEY`, `SIGA_DB_HOST`, `SIGA_DB_USER`, `SIGA_DB_PASSWORD` (and optional `DB_SSL`, `SIGA_DB_SSL`).

## Notes

- No DB host/user/password or API key is hardcoded; configure them only in `.env` or OpenShift Secret.
- Date fields (`tanggal_lahir`, `tanggal_pemakaian`, `tanggal_cabut_lepas`) are `YYYY-MM-DD` or `"-"`. Source values may be `Date` (pg), `D/M/YYYY`, or ISO.
- Sorting: parse `tanggalkb` (same forms as above); if parse fails, fall back to `Tahun` + `Bulan`. Newest first.
- SIGA uses a separate `pg` Pool (`SIGA_DB_*`). Query parent partition table only; Postgres routes to shards.
- All empty/missing string fields in `data[]` are `"-"`.
