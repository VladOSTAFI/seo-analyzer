# SEO Audit — REST API Testing Plan

Manual + scripted test plan for the Phase 7 REST API. Each case pairs an HTTP
call (curl) with the **Postgres query** you can run to confirm what actually
landed in the database.

- **API base:** `http://localhost:3000`
- **DB connection:** `postgres://seo:seo@localhost:5432/seo_audit`
  (host `localhost`, port `5432`, db `seo_audit`, user `seo`, pass `seo`)

Open a psql session in a second terminal and keep it alongside the curl calls:

```bash
psql "postgres://seo:seo@localhost:5432/seo_audit"
```

---

## 0. Prerequisites

| # | Step | Command | Expected |
|---|------|---------|----------|
| 0.1 | Postgres is up | `docker ps \| grep seo-audit-postgres` | container `Up … (healthy)`, port `5432` |
| 0.2 | Build the app | `npm run build` | exit 0, no TS errors |
| 0.3 | Start the API | `npm run api` (or `node dist/api.main.js`) | log: `REST API listening on http://localhost:3000` + 5 mapped routes |
| 0.4 | Smoke the server | `curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/audits` | `200` |

> Tip: to keep live crawls short while testing, start the server with a low page
> cap: `CRAWL_MAX_PAGES=30 node dist/api.main.js`.

### Endpoint reference

| Method | Path | Purpose | Success |
|--------|------|---------|---------|
| POST | `/audits` | Create audit + run pipeline in background | `202` |
| GET | `/audits` | List audits (paginated, newest-first) | `200` |
| GET | `/audits/:id` | One audit + finding rollups | `200` / `404` |
| GET | `/audits/:id/findings` | Findings (filter + paginate) | `200` / `404` |
| GET | `/audits/:id/report` | Download the `.xlsx` report | `200` / `409` / `404` |

---

## 1. `POST /audits`

### 1.1 Valid URL → 202 Accepted

```bash
curl -s -X POST http://localhost:3000/audits \
  -H 'content-type: application/json' \
  -d '{"url":"https://www.covecta.io/"}'
```

**Expected body:** `{"id":"<uuid>","status":"created"}`, HTTP `202`.

**Verify in Postgres** — the row is inserted synchronously:

```sql
-- newest audit (should be the one you just created, status 'created' or already 'crawling')
SELECT id, start_url, status, failed_stage, created_at
FROM audits
ORDER BY created_at DESC
LIMIT 1;
```

> Save the id for the rest of the plan. In psql:
> `\set aid '<paste-uuid-here>'` then reference it as `:'aid'`.

### 1.2 Invalid URL → 400

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:3000/audits \
  -H 'content-type: application/json' -d '{"url":"not-a-url"}'
```

**Expected:** `400` (domain `InvalidArgumentError` → mapped by the global filter).
**Verify:** no new row was created:

```sql
SELECT count(*) FROM audits WHERE start_url = 'not-a-url';   -- expect 0
```

### 1.3 Empty / malformed body → 400

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:3000/audits \
  -H 'content-type: application/json' -d '{}'
```

**Expected:** `400` (Zod validation: `url` required). No DB row.

### 1.4 Extra/unknown field → 400 (strict schema)

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:3000/audits \
  -H 'content-type: application/json' -d '{"url":"https://x.com","foo":1}'
```

**Expected:** `400` (the body schema is `.strict()`).

---

## 2. Watch the pipeline progress (poll `GET /audits/:id`)

The pipeline runs out-of-band (crawl → enrich → analyze → perf → report). Poll
the detail endpoint, or watch the status change live in Postgres.

```bash
watch -n 3 "curl -s http://localhost:3000/audits/<AID> | jq '{status,findingsTotal,reportPath}'"
```

**Verify in Postgres** — status transitions and stage row counts:

```sql
-- status should walk: created → crawling → enriching → analyzing → (perf) → done
SELECT status, failed_stage, report_path, updated_at
FROM audits WHERE id = :'aid';

-- rows accumulating per stage table
SELECT
  (SELECT count(*) FROM pages            WHERE audit_id = :'aid') AS pages,
  (SELECT count(*) FROM links            WHERE audit_id = :'aid') AS links,
  (SELECT count(*) FROM images           WHERE audit_id = :'aid') AS images,
  (SELECT count(*) FROM hreflang_entries WHERE audit_id = :'aid') AS hreflang,
  (SELECT count(*) FROM findings         WHERE audit_id = :'aid') AS findings,
  (SELECT count(*) FROM performance      WHERE audit_id = :'aid') AS perf;
```

**Done criteria:** `status = 'done'` and `report_path` is non-null.
If it stops at `status = 'failed'`, `failed_stage` names the stage that threw.

---

## 3. `GET /audits` (list)

### 3.1 Default page → 200

```bash
curl -s 'http://localhost:3000/audits' | jq '{total, limit, offset, count: (.items|length)}'
```

**Expected:** `{ items:[...], total, limit:50, offset:0 }`, newest-first.

**Verify ordering/total against Postgres:**

```sql
SELECT count(*) AS total FROM audits;                       -- == response .total
SELECT id, status, created_at FROM audits
ORDER BY created_at DESC LIMIT 50;                          -- same order/ids as response .items
```

### 3.2 Pagination + clamping

```bash
curl -s 'http://localhost:3000/audits?limit=5&offset=0'  | jq '.limit, (.items|length)'  # 5, ≤5
curl -s 'http://localhost:3000/audits?limit=9999'        | jq '.limit'                   # clamped to 200
curl -s 'http://localhost:3000/audits?limit=0'           | jq '.limit'                   # clamped to 1
curl -s 'http://localhost:3000/audits?limit=abc'         | jq '.limit'                   # falls back to 50
```

**Verify** a given page matches SQL:

```sql
SELECT id FROM audits ORDER BY created_at DESC LIMIT 5 OFFSET 0;
```

---

## 4. `GET /audits/:id` (detail + rollups)

### 4.1 Existing audit → 200

```bash
curl -s http://localhost:3000/audits/<AID> | jq '{status, findingsTotal, bySeverity, reportPath}'
```

**Expected:** full audit + `findingsTotal` + a fully-keyed `bySeverity`
(`critical/high/medium/low/info`, zero-filled).

**Verify the rollup is computed correctly:**

```sql
-- findingsTotal
SELECT count(*) FROM findings WHERE audit_id = :'aid';

-- bySeverity (compare each number to the API's bySeverity object)
SELECT severity, count(*) AS n
FROM findings WHERE audit_id = :'aid'
GROUP BY severity
ORDER BY n DESC;
```

### 4.2 Unknown id → 404

```bash
curl -s -o /dev/null -w '%{http_code}\n' \
  http://localhost:3000/audits/00000000-0000-0000-0000-000000000000   # 404
```

```sql
SELECT count(*) FROM audits
WHERE id = '00000000-0000-0000-0000-000000000000';          -- expect 0
```

---

## 5. `GET /audits/:id/findings`

### 5.1 All findings (paginated) → 200

```bash
curl -s 'http://localhost:3000/audits/<AID>/findings?limit=200' \
  | jq '{total, count:(.items|length)}'
```

**Verify total:**

```sql
SELECT count(*) FROM findings WHERE audit_id = :'aid';       -- == response .total
```

### 5.2 Severity filter → only that severity

```bash
curl -s 'http://localhost:3000/audits/<AID>/findings?severity=high&limit=200' \
  | jq '{total, allHigh: (all(.items[]; .severity=="high"))}'
```

**Verify:**

```sql
SELECT count(*) FROM findings
WHERE audit_id = :'aid' AND severity = 'high';              -- == response .total
```

### 5.3 ruleId filter

```bash
curl -s 'http://localhost:3000/audits/<AID>/findings?ruleId=index.canonical&limit=200' \
  | jq '.total'
```

```sql
SELECT count(*) FROM findings
WHERE audit_id = :'aid' AND rule_id = 'index.canonical';    -- == response .total
```

### 5.4 Ordering (severity rank, then rule, then url)

The API orders `critical→high→medium→low→info`, then `rule_id`, then `url`
(nulls last). Compare the first rows:

```sql
SELECT severity, rule_id, url FROM findings
WHERE audit_id = :'aid'
ORDER BY CASE severity
  WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2
  WHEN 'low' THEN 3 ELSE 4 END, rule_id, url ASC NULLS LAST
LIMIT 20;
```

### 5.5 Findings of unknown audit → 404

```bash
curl -s -o /dev/null -w '%{http_code}\n' \
  http://localhost:3000/audits/00000000-0000-0000-0000-000000000000/findings   # 404
```

> Note: an **existing** audit with zero findings returns `200` + empty page —
> distinct from a missing audit (`404`).

---

## 6. `GET /audits/:id/report` (download `.xlsx`)

### 6.1 Report ready → 200 + workbook

```bash
curl -s -D - -o /tmp/report.xlsx \
  http://localhost:3000/audits/<AID>/report -w '\nHTTP %{http_code} %{content_type}\n' \
  | grep -iE 'HTTP|content-type|content-disposition'
file /tmp/report.xlsx        # → "Microsoft Excel 2007+"
```

**Expected:** `200`, `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`,
`Content-Disposition: attachment; filename="audit-….xlsx"`, valid Excel file.

**Verify the served path matches the DB:**

```sql
SELECT report_path FROM audits WHERE id = :'aid';           -- the file curl downloaded
```

### 6.2 Audit exists but report not generated yet → 409

Hit this right after POST, before the pipeline reaches the report stage (or on an
audit whose `report_path IS NULL`):

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/audits/<AID>/report   # 409
```

```sql
SELECT id, status, report_path FROM audits
WHERE report_path IS NULL ORDER BY created_at DESC LIMIT 1; -- candidate id for the 409 case
```

### 6.3 Unknown audit → 404

```bash
curl -s -o /dev/null -w '%{http_code}\n' \
  http://localhost:3000/audits/00000000-0000-0000-0000-000000000000/report   # 404
```

---

## 7. End-to-end happy path (one shot)

The repo ships a scripted version of this whole plan:

```bash
# starts from a running server; audits the URL through every endpoint
./scripts/api-smoke.sh "https://www.covecta.io/"          # POLL_TIMEOUT=600 by default
```

It asserts 400/202/200/404/409 across all five routes and downloads the workbook.
Exit code `0` = all green.

---

## 8. Useful inspection queries

```sql
-- All audits at a glance
SELECT id, start_url, status, failed_stage,
       (report_path IS NOT NULL) AS has_report, created_at
FROM audits ORDER BY created_at DESC;

-- Full rule breakdown for one audit (matches the report's contents)
SELECT severity, rule_id, count(*) AS n
FROM findings WHERE audit_id = :'aid'
GROUP BY severity, rule_id
ORDER BY CASE severity
  WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2
  WHEN 'low' THEN 3 ELSE 4 END, n DESC;

-- Sample the detail jsonb for a specific rule
SELECT url, detail
FROM findings
WHERE audit_id = :'aid' AND rule_id = 'index.canonical'
LIMIT 10;

-- Crawl coverage
SELECT status_class, count(*) FROM pages
WHERE audit_id = :'aid' GROUP BY status_class ORDER BY 1;
```

---

## 9. Cleanup

Deleting the audit row cascades to all child tables (`findings`, `pages`,
`links`, `images`, `hreflang_entries`, `performance`):

```sql
DELETE FROM audits WHERE id = :'aid';                       -- cascades everywhere
-- or wipe every covecta test audit:
DELETE FROM audits WHERE start_url LIKE '%covecta%';
```

Remove the generated report file(s) from disk:

```bash
rm -f backend/output/audit-<AID>-*.xlsx
```

---

## 10. Expected-status cheat sheet

| Case | Status |
|------|--------|
| POST valid url | `202` |
| POST invalid url / empty / extra field | `400` |
| GET list | `200` |
| GET detail (exists) | `200` |
| GET detail (unknown) | `404` |
| GET findings (audit exists) | `200` |
| GET findings (unknown audit) | `404` |
| GET report (ready) | `200` |
| GET report (not generated yet) | `409` |
| GET report (unknown audit / file gone) | `404` |
