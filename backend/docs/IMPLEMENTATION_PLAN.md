# SEO Technical Audit Application — Comprehensive Implementation Plan

> **Goal:** Automate the technical SEO audit of a website end-to-end. Point the
> tool at a domain → it crawls the whole site, runs ~30 technical SEO checks,
> and emits a developer-ready Excel specification (ТЗ) listing every issue,
> grouped into actionable tables.
>
> **One-liner:** One command in (`audit:run <url>`), one Excel report out.

---

## Table of Contents

1. [Architecture & Design Principles](#1-architecture--design-principles)
2. [Technology Stack](#2-technology-stack)
3. [Repository Layout](#3-repository-layout)
4. [Data Model Summary](#4-data-model-summary)
5. [The Pipeline](#5-the-pipeline)
6. [The Audit Check Catalogue (~30 checks)](#6-the-audit-check-catalogue-30-checks)
7. [Phase-by-Phase Implementation](#7-phase-by-phase-implementation)
   - [Phase 0 — Project Foundation](#phase-0--project-foundation)
   - [Phase 1 — Crawler Core](#phase-1--crawler-core-data-acquisition)
   - [Phase 2 — Enrichment](#phase-2--enrichment-link-resolution)
   - [Phase 3 — Analysis Engine](#phase-3--analysis-engine-the-audit-rules)
   - [Phase 4 — Performance & External Data](#phase-4--performance--external-data)
   - [Phase 5 — Report Generation](#phase-5--report-generation-the-тз-deliverable)
   - [Phase 6 — Orchestration & Full Pipeline](#phase-6--orchestration--full-pipeline)
   - [Phase 7 — REST API & Dashboard (optional)](#phase-7--rest-api--dashboard-optional)
8. [Cross-Cutting Concerns](#8-cross-cutting-concerns)
9. [Testing Strategy](#9-testing-strategy)
10. [Configuration Reference](#10-configuration-reference)
11. [CLI Reference](#11-cli-reference)
12. [Definition of Done per Phase](#12-definition-of-done-per-phase)

---

## 1. Architecture & Design Principles

The system is a **five-stage pipeline** orchestrated by a central `AuditService`.
Each stage is an injectable NestJS service and **persists its results to
PostgreSQL** before the next stage begins.

```
        ┌─────────┐   ┌─────────┐   ┌─────────┐   ┌──────────────┐   ┌─────────┐
 URL ─▶ │  CRAWL  │─▶ │ ENRICH  │─▶ │ ANALYZE │─▶ │ PERFORMANCE  │─▶ │ REPORT  │─▶ .xlsx
        └─────────┘   └─────────┘   └─────────┘   └──────────────┘   └─────────┘
             │             │             │               │                │
             ▼             ▼             ▼               ▼                ▼
          pages         links        findings       performance      report_path
          links         (enrich)                                     on audits row
          images        pages.inlink
          hreflang      images.status
                        hreflang.recip
```

### The three rules that hold the system together

1. **Persist after every stage.** Each stage reads the prior stage's tables and
   writes its own. Re-running *analysis* never forces a *re-crawl*. A failed run
   can resume from the last completed stage by `auditId`.
2. **Keep audit rules data-driven.** Every check is one file implementing a
   `Rule` interface and self-registering in a registry. Adding a check is *one
   file* — it never touches the orchestrator or the pipeline.
3. **Push aggregations into PostgreSQL.** Duplicate detection (`GROUP BY … HAVING
   count > 1`), link joins, content-hash grouping, `jsonb_array_length` checks —
   all run as set-based SQL, never row-by-row in Node. This is the core reason
   Postgres is in the stack.

### Idempotency contract

Every stage is **idempotent per `auditId`**: re-running it produces the same end
state. Implementations delete-then-insert (or upsert) the rows they own, scoped
to `auditId`, inside a transaction. This makes every stage safely re-runnable.

---

## 2. Technology Stack

| Concern            | Choice                                              |
|--------------------|-----------------------------------------------------|
| Runtime / Language | Node.js + **TypeScript (strict mode)**              |
| Framework          | **NestJS** (dependency-injected services)           |
| CLI                | **nest-commander** (one command per stage)          |
| Crawler            | **Crawlee** — `CheerioCrawler` (fast), `PlaywrightCrawler` (JS-rendered fallback) |
| HTML parsing       | **Cheerio**                                         |
| Database           | **PostgreSQL** (pinned version via Docker)          |
| ORM / migrations   | **Drizzle ORM** + **drizzle-kit**                   |
| DB driver          | `pg` (Pool)                                         |
| Performance API    | **PageSpeed Insights API** (Core Web Vitals)        |
| Report output      | **ExcelJS**                                         |
| Queue (Phase 7)    | **@nestjs/bullmq** + Redis (optional)               |
| Dashboard (Phase 7)| **Next.js** (optional)                              |
| Testing            | **Jest** (unit + integration), Testcontainers for DB |

---

## 3. Repository Layout

```
backend/
├── docker-compose.yml              # Postgres (+ Redis in Phase 7)
├── drizzle.config.ts
├── package.json
├── tsconfig.json                   # strict: true
├── .env.example
├── docs/
│   ├── IMPLEMENTATION_PLAN.md       # this file
│   ├── implementation-plan.txt
│   └── db-schemas.txt
├── drizzle/                         # generated SQL migrations
└── src/
    ├── main.ts                      # CLI bootstrap (CommandFactory)
    ├── app.module.ts
    ├── config/
    │   ├── config.module.ts
    │   └── env.validation.ts        # zod/class-validator schema
    ├── db/
    │   ├── db.module.ts             # global: Pool + Drizzle provider
    │   ├── schema/                  # one file per table + enums
    │   │   ├── enums.ts
    │   │   ├── audits.ts
    │   │   ├── pages.ts
    │   │   ├── links.ts
    │   │   ├── images.ts
    │   │   ├── hreflang.ts
    │   │   ├── findings.ts
    │   │   ├── performance.ts
    │   │   └── index.ts
    │   └── db.types.ts
    ├── audit/
    │   ├── audit.module.ts
    │   ├── audit.service.ts         # orchestrator (Phase 6)
    │   └── audit.repository.ts      # status transitions, lookups
    ├── crawl/                       # Phase 1
    │   ├── crawl.module.ts
    │   ├── crawl.service.ts
    │   ├── extract.service.ts
    │   └── crawl.types.ts
    ├── enrich/                      # Phase 2
    │   ├── enrich.module.ts
    │   └── enrich.service.ts
    ├── analyze/                     # Phase 3
    │   ├── analyze.module.ts
    │   ├── analyze.service.ts
    │   ├── rule.interface.ts
    │   ├── rule.registry.ts
    │   └── rules/                   # one file per check
    │       ├── mirror.main-mirror.ts
    │       ├── links.internal-redirect.ts
    │       ├── meta.title.missing.ts
    │       └── … (see catalogue)
    ├── performance/                 # Phase 4
    │   ├── performance.module.ts
    │   ├── psi.service.ts
    │   └── performance.service.ts
    ├── report/                      # Phase 5
    │   ├── report.module.ts
    │   └── report.service.ts
    ├── cli/                         # nest-commander commands
    │   ├── create.command.ts
    │   ├── crawl.command.ts
    │   ├── enrich.command.ts
    │   ├── analyze.command.ts
    │   ├── perf.command.ts
    │   ├── report.command.ts
    │   └── run.command.ts
    └── common/
        ├── logger.ts
        ├── url.util.ts              # normalization, variant generation
        └── errors.ts
```

---

## 4. Data Model Summary

All tables defined with Drizzle (`drizzle-orm/pg-core`). Full definitions live in
[`db-schemas.txt`](./db-schemas.txt). Every child table FKs to `audits.id` with
`onDelete: 'cascade'`.

### Enums

```ts
auditStatus = ['created','crawling','enriching','analyzing','reporting','done','failed']
statusClass = ['2xx','3xx','4xx','5xx']
linkType    = ['internal','external']
crawlSource = ['sitemap','link','redirect','seed']
severity    = ['critical','high','medium','low','info']
```

### Tables

| Table              | Phase   | Purpose                                                |
|--------------------|---------|--------------------------------------------------------|
| `audits`           | 0       | Root run entity; status + `failedStage` + `reportPath` |
| `pages`            | 1       | One row per crawled URL: response, metadata (jsonb arrays), indexability, `contentHash` |
| `links`            | 1 → 2   | Every outlink; enriched with `targetStatusCode`, `isRedirect`, `isBroken` |
| `images`           | 1 → 2   | `alt`/`title` for step 30; `statusCode` for broken-image detection |
| `hreflang_entries` | 1 → 2   | i18n; `isReciprocal` enriched in Phase 2               |
| `findings`         | 3       | One row per detected issue: `ruleId`, `severity`, `url`, `detail` (jsonb) |
| `performance`      | 4       | PSI/CWV per sampled URL + strategy (`mobile`/`desktop`)|
| `audit_jobs`       | 7 (opt) | BullMQ queue-job tracking for UI history               |

**Key index decisions:**
- `pages (auditId, url)` **unique** → idempotent upserts, dedup.
- `pages (auditId, statusClass)`, `(auditId, contentHash)`, `(auditId, canonicalUrl)` → fast Phase 3 aggregations.
- `links (auditId, href)`, `(auditId, sourceUrl)`, `(auditId, isBroken, isRedirect)` → fast join + flag filtering.
- `performance (auditId, pageUrl, strategy)` **unique** → one row per URL/strategy.

Metadata fields (`title`, `metaDescription`, `h1`, `h2`) are **jsonb string
arrays** — this is deliberate: storing *all* occurrences lets a single column
power three checks at once (missing = empty array, multiple =
`jsonb_array_length > 1`, duplicate = `GROUP BY` the first element).

---

## 5. The Pipeline

| Stage        | Service              | Reads                       | Writes                                  | Status         | CLI                  |
|--------------|----------------------|-----------------------------|-----------------------------------------|----------------|----------------------|
| Crawl        | `CrawlService`       | start URL                   | `pages`, `links`, `images`, `hreflang`  | `crawling`     | `audit:crawl <id>`   |
| Enrich       | `EnrichService`      | `links`, `pages`, `images`  | enriched cols on those tables           | `enriching`    | `audit:enrich <id>`  |
| Analyze      | `AnalyzeService`     | all crawl/enrich tables     | `findings`                              | `analyzing`    | `audit:analyze <id>` |
| Performance  | `PerformanceService` | `pages` (sampled)           | `performance`, `findings`               | (within analyze/own) | `audit:perf <id>` |
| Report       | `ReportService`      | `findings` + support tables | `.xlsx` file; `audits.reportPath`       | `reporting`    | `audit:report <id>`  |

On success the orchestrator sets `audits.status = 'done'`. On any failure it sets
`status = 'failed'` and records the `failedStage`.

---

## 6. The Audit Check Catalogue (~30 checks)

Each row becomes a `Rule` file in `src/analyze/rules/`. The `ruleId` is the
stable key written into `findings.ruleId` and used to group report sheets.

| #  | ruleId                          | Description                                              | Mechanism (SQL)                                            | Severity | Phase |
|----|---------------------------------|---------------------------------------------------------|------------------------------------------------------------|----------|-------|
| 1  | `mirror.main-mirror`            | Site reachable on multiple host/scheme variants (www/non-www, http/https) without canonical redirect | Seed-URL variant probe vs `pages.finalUrl`/redirect       | high     | 3 |
| 2  | `mirror.trailing-slash`         | Same content at `/path` and `/path/` (slash duplication)| `contentHash` group across slash-normalized URLs           | medium   | 3 |
| 3  | `links.internal-redirect`       | Internal links pointing to 3xx (should target final URL)| `links` JOIN where `isRedirect = true`, `type='internal'`  | high     | 3 |
| 4  | `links.redirect-chain`          | Internal links resolving through >1 redirect hop / loops| `pages.redirectChain` length > 1; loop detection           | high     | 3 |
| 5  | `links.broken-internal`         | Internal links to 4xx/5xx                               | `links` where `isBroken=true`, `type='internal'`           | critical | 3 |
| 6  | `links.broken-external`         | External links to 4xx/5xx                               | `links` where `isBroken=true`, `type='external'`           | medium   | 3 |
| 7  | `links.external-flag`           | External links missing `rel="nofollow"`/sponsored where expected | `links` where `type='external'` and `rel` lacks nofollow | low      | 3 |
| 8  | `meta.title.missing`            | Page has no `<title>`                                   | `jsonb_array_length(title) = 0`                            | high     | 3 |
| 9  | `meta.title.duplicate`          | Same title across multiple pages                        | `GROUP BY title->>0 HAVING count(*) > 1`                   | medium   | 3 |
| 10 | `meta.title.multiple`           | Page has more than one `<title>`                        | `jsonb_array_length(title) > 1`                            | medium   | 3 |
| 11 | `meta.description.missing`      | No meta description                                     | `jsonb_array_length(meta_description) = 0`                 | medium   | 3 |
| 12 | `meta.description.duplicate`    | Duplicate meta description across pages                 | `GROUP BY meta_description->>0 HAVING count(*) > 1`        | low      | 3 |
| 13 | `meta.description.multiple`     | Multiple meta descriptions on one page                  | `jsonb_array_length(meta_description) > 1`                 | low      | 3 |
| 14 | `meta.h1.missing`               | No `<h1>`                                               | `jsonb_array_length(h1) = 0`                               | high     | 3 |
| 15 | `meta.h1.duplicate`             | Duplicate H1 text across pages                          | `GROUP BY h1->>0 HAVING count(*) > 1`                      | low      | 3 |
| 16 | `meta.h1.multiple`              | Multiple `<h1>` on one page                             | `jsonb_array_length(h1) > 1`                               | medium   | 3 |
| 17 | `meta.title.template`           | Recommend title template (length/keyword guidance)     | length heuristics on `title->>0`                          | info     | 3/5 |
| 18 | `meta.description.template`     | Recommend description template                          | length heuristics on `meta_description->>0`               | info     | 3/5 |
| 19 | `meta.h1.template`              | Recommend H1 guidance                                   | heuristics on `h1->>0`                                     | info     | 3/5 |
| 20 | `perf.lcp`                      | LCP above "good" threshold (>2.5s)                      | `performance.lcpMs > 2500`                                 | high     | 4 |
| 21 | `perf.cls-inp`                  | CLS > 0.1 or INP > 200ms                                | `performance.cls`/`inpMs` thresholds                      | high     | 4 |
| 22 | `perf.psi-usability`            | Critical PSI usability/opportunity recommendations      | parse `performance.usabilityFlags` / `psiRaw`             | medium   | 4 |
| 23 | `perf.mobile-indexing`          | Mobile usability / indexing issues from PSI mobile data | `performance` strategy='mobile' flags                     | high     | 4 |
| 24 | `dupe.content`                  | Duplicate pages by content hash                         | `GROUP BY contentHash HAVING count(*) > 1`                | high     | 3 |
| 25 | `index.canonical`               | Canonical missing / points off-site / non-self on canonical page | `isSelfCanonical`, `canonicalUrl` vs `url`         | high     | 3 |
| 26 | `index.robots`                  | Noindex / robots-blocked pages that should be indexable | `metaRobots`/`xRobotsTag`/`blockedByRobotsTxt`            | high     | 3 |
| 27 | `index.url-heuristics`          | Non-SEO-friendly URLs (ЧПУ): uppercase, params, underscores, length | regex heuristics on `pages.url`                  | low      | 3 |
| 28 | `pagination.rel`                | Broken/missing `rel=next/prev` on paginated series      | `relNext`/`relPrev` reciprocity vs crawled pages          | medium   | 3 |
| 29 | `i18n.hreflang`                 | hreflang non-reciprocal / missing return tags / bad lang codes | `hreflang_entries` where `isReciprocal=false`     | medium   | 3 |
| 30 | `image.alt-title`               | Images missing `alt` (and/or `title`)                   | `images` where `alt IS NULL OR alt = ''`                  | low      | 3 |
| +  | `image.broken`                  | Images returning 4xx/5xx                                | `images` where `statusCode >= 400`                        | medium   | 3 |

> Severities above are defaults; finalize during Phase 3 against the real
> checklist. The catalogue is the contract between the analysis engine and the
> report sheets — each `ruleId` maps to exactly one report table.

---

## 7. Phase-by-Phase Implementation

Phases 0→6 are **strictly ordered**; each depends on prior tables/services and
ends with something runnable and testable.

---

### Phase 0 — Project Foundation

**Goal:** Runnable NestJS app with Postgres, config, migrations, CLI wiring. No
audit logic yet.

**Tasks**
1. Scaffold NestJS project, `tsconfig` with `strict: true`, ESLint + Prettier.
2. Add `nest-commander`; `main.ts` bootstraps via `CommandFactory.run(AppModule)`.
3. `docker-compose.yml`: Postgres (pinned version, e.g. `postgres:16.4`), named
   volume, `healthcheck` (`pg_isready`).
4. `DbModule` (`@Global()`): create `pg` `Pool` (size from config), wrap with
   Drizzle, export a `DB` injection token.
5. Configure `drizzle-kit` (`drizzle.config.ts`): `generate` + `push`.
6. `ConfigModule` with env validation (zod or class-validator):
   - `DATABASE_URL` — **validate reachable on boot** (ping query); fail fast with
     a clear error otherwise.
   - `PSI_API_KEY`, crawl limits (`CRAWL_MAX_PAGES`, `CRAWL_CONCURRENCY`,
     `CRAWL_RATE_LIMIT`), `OUTPUT_DIR`.
7. Define `audits` table + enums; generate & apply first migration.
8. CLI `audit:create <url>` → insert `audits` row, print the new `id`.
9. Wire Nest `Logger` + a global error handler that prints actionable messages.

**Acceptance**
- `docker compose up -d` starts Postgres; `drizzle-kit push` applies migrations.
- `npm run cli audit:create https://example.com` prints a UUID; row exists.
- App **fails fast** with a clear error if `DATABASE_URL` is unreachable.
- Unit tests pass (config validation, create command).

---

### Phase 1 — Crawler Core (data acquisition)

**Goal:** Crawl a site and persist raw page data — the Screaming Frog
replacement (audit step 1).

**Tasks**
1. Define `pages`, `links`, `images`, `hreflang_entries` tables (see schemas);
   generate & apply migration.
2. `CrawlService` wrapping Crawlee `CheerioCrawler`:
   - Respect `robots.txt`; config-driven concurrency + rate limits; URL dedup;
     retries with backoff.
   - **Crawler instantiated per run** — no shared mutable state across audits.
   - Seed from start URL; optionally seed from `sitemap.xml` (sets
     `crawlSource='sitemap'`).
   - Record `crawlSource`, `depth`, `redirectChain`, timing, content length.
   - Escalate to `PlaywrightCrawler` only when a page needs JS rendering
     (heuristic: empty body / SPA markers) — keep Cheerio as the fast default.
3. `ExtractService` (Cheerio) parses per page:
   - `title[]`, `metaDescription[]`, `h1[]`, `h2[]` (collect **all** occurrences
     → jsonb arrays).
   - `canonical` (+ compute `isSelfCanonical`), `meta robots`, `x-robots-tag`
     header, `blockedByRobotsTxt`.
   - Outlinks (resolved absolute, classify internal/external, capture `rel`,
     `anchorText`).
   - Images (`src`, `alt`, `title`).
   - hreflang entries (`lang`, `href`).
   - `rel=next`/`rel=prev`.
   - `contentHash` (normalized visible text → hash) for later dup detection.
4. **Batch inserts** (~500 rows/chunk) inside transactions.
5. Idempotency: clear this audit's `pages`/`links`/`images`/`hreflang` rows (or
   upsert on `(auditId, url)`) before/while crawling.
6. Status transitions: `created`/prior → `crawling` → back to a settled status.
7. CLI `audit:crawl <auditId>`.

**Acceptance**
- Crawling a real small site fills `pages`/`links`/`images`/`hreflang`.
- Multiple `<title>`/`<h1>` stored as jsonb arrays.
- Crawl is **idempotent per audit** (re-run yields same row set).
- Status transitions correctly.

---

### Phase 2 — Enrichment (link resolution)

**Goal:** Turn raw links into actionable signals powering
redirect/broken-link/inlink checks. **All set-based SQL — no row-by-row in Node.**

**Tasks**
1. `EnrichService` runs a sequence of SQL statements in one transaction:
   - **Link target resolution:** `UPDATE links` from a JOIN against `pages`
     (match `links.href` to `pages.url`/`finalUrl`) to set `targetStatusCode`,
     `isRedirect` (3xx), `isBroken` (4xx/5xx).
   - **Inlink counts:** aggregate `links` grouped by target → `UPDATE pages SET
     inlinkCount`.
   - **Redirect chains/loops:** resolve multi-hop chains from
     `pages.redirectChain`; flag chains (>1 hop) and loops.
   - **Image status:** resolve `images.statusCode` (from crawled responses or a
     HEAD-check pass) → broken images flagged.
   - **Hreflang reciprocity:** set `isReciprocal` by checking whether the target
     page declares a return hreflang back to the source.
2. Idempotent: enrichment columns are recomputed each run (safe to re-run).
3. Status `analyzing`-prior → `enriching` → settled.
4. CLI `audit:enrich <auditId>`.

**Acceptance**
- Broken/redirect link sets and inlink counts query correctly on a crawled audit.
- Redirect chains/loops identified.
- Runs as set-based SQL, verified by inspecting the executed statements.

---

### Phase 3 — Analysis Engine (the audit rules)

**Goal:** Implement the audit checks as data-driven SQL rules producing findings.

**Tasks**
1. Define `findings` table; generate & apply migration.
2. **Rule interface** and registry:
   ```ts
   export interface Rule {
     id: string;                          // e.g. "meta.title.duplicate"
     description: string;
     severity: Severity;
     run(db: Database, auditId: string): Promise<Finding[]>;
   }
   ```
   - `rule.registry.ts` collects all rules (explicit array import — no runtime
     magic that defeats tree-shaking/typing). **Adding a check = one file +
     one registry line** (or auto-glob import).
3. Implement each catalogue rule as a parameterized aggregation pushed into
   Postgres (see [catalogue](#6-the-audit-check-catalogue-30-checks)). Group the
   files by family: `mirror.*`, `links.*`, `meta.*`, `dupe.*`, `index.*`,
   `pagination.*`, `i18n.*`, `image.*`.
4. `AnalyzeService`:
   - Loads `crawling`/`enriching` outputs are present (guard: audit must be
     enriched).
   - Runs **all registered rules**, collects findings, writes them in a single
     transaction (delete this audit's findings first → idempotent).
   - Status → `analyzing` → settled.
5. CLI `audit:analyze <auditId>`.

**Acceptance**
- Each rule has a **unit test against fixture data** (seeded pages/links rows →
  expected findings).
- Analysis on a crawled site produces categorized findings.
- Duplicate/multiple checks resolved via SQL aggregation (assert no per-row Node
  loops).

---

### Phase 4 — Performance & External Data

**Goal:** Add PageSpeed/CWV and mobile-usability checks (steps 20–23).

**Tasks**
1. Define `performance` table; generate & apply migration.
2. `PsiService` — PageSpeed Insights API client:
   - **Rate-limited** (respect PSI quota) and **cached** (skip URLs already
     fetched recently; unique index on `(auditId, pageUrl, strategy)`).
   - Run on **representative URLs** — one per page template, not every URL.
     Sampling strategy: cluster pages by URL pattern / template signature, pick a
     representative per cluster (cap total samples via config).
   - Fetch both `mobile` and `desktop` strategies; store CWV (LCP/CLS/INP), lab
     metrics (perf score, FCP, TBT, Speed Index), `usabilityFlags`, full `psiRaw`.
3. Performance rules (20–23) read `performance` like any other Phase-3 rule and
   write to `findings`. Also derive crawl-based perf signals (HTML size,
   resource/outlink count, lazy-load presence) feeding the same rules.
4. CLI `audit:perf <auditId>`.

**Acceptance**
- PSI metrics stored for sampled URLs (both strategies).
- Performance findings appear in `findings` alongside others.
- PSI calls are cached/rate-limited (re-run does not re-hit the API for cached
  URLs).

---

### Phase 5 — Report Generation (the ТЗ deliverable)

**Goal:** Produce the developer-facing audit document.

**Tasks**
1. `ReportService` (ExcelJS) — **reads only from `findings` + supporting tables;
   no recompute.**
2. **One formatted sheet per issue category**, mirroring the checklist:
   - Redirect-fix table (`from URL → to final URL`).
   - Broken-link removal table (`source page`, `broken href`, `status`).
   - Missing/duplicate/multiple meta tables (Title, Description, H1).
   - Duplicate-pages table (grouped by content hash).
   - Canonical/indexation issues, URL heuristics, pagination, hreflang, images.
   - Performance issues (CWV per sampled URL).
3. **Metatag template recommendations** (steps 17–19) as a structured sheet.
4. **Summary sheet:** counts by severity and by category.
5. Formatting: header styles, frozen header row, column widths, severity color
   coding, autofilter per sheet.
6. Write `.xlsx` to `OUTPUT_DIR`; record path on `audits.reportPath`; status →
   `reporting` → settled.
7. CLI `audit:report <auditId>`.

**Acceptance**
- Running on a real audit produces an Excel file with populated, correctly
  formatted ТЗ tables and a working summary sheet.

---

### Phase 6 — Orchestration & Full Pipeline

**Goal:** One command, cold start to finished report.

**Tasks**
1. `AuditService` orchestrator: `crawl → enrich → analyze → perf → report`,
   updating `audits.status` per stage.
2. CLI `audit:run <url>`:
   - Creates the audit row, then drives every stage.
   - Each stage **idempotent and re-runnable by `auditId`**.
   - On failure: set `status='failed'` + `failedStage=<stage>`; surface stage
     context in logs.
   - Progress logging per stage (start/end, row counts, durations).
3. Resume semantics: re-running `audit:run` (or an individual stage command) on
   an existing audit resumes without re-crawling.

**Acceptance**
- `audit:run https://site.com` produces a finished `.xlsx` from a cold start.
- Re-running a single stage never forces a re-crawl.

---

### Phase 7 — REST API & Dashboard (optional)

**Goal:** Move from CLI to a usable app surface.

**Tasks**
1. REST controllers:
   - `POST /audits` (start) → returns `id`, status `created`.
   - `GET /audits/:id` (status).
   - `GET /audits/:id/findings`.
   - `GET /audits/:id/report` (download `.xlsx`).
2. `@nestjs/bullmq` + Redis for background crawl jobs (replaces in-process
   execution); add Redis to `docker-compose.yml`. Optionally track jobs in the
   `audit_jobs` table for history/UI.
3. Minimal **Next.js** dashboard: trigger an audit, watch status update, view the
   findings table, download the report.

**Acceptance**
- Start an audit from the UI, watch status update, download the report.

---

## 8. Cross-Cutting Concerns

- **URL normalization** (`common/url.util.ts`): consistent scheme/host casing,
  default-port stripping, fragment removal, trailing-slash policy, query-param
  ordering. Used by both crawl (dedup) and enrich (link matching) — they **must**
  share one implementation or the JOINs miss.
- **Status as a state machine:** transitions only forward (or to `failed`);
  `AuditRepository` centralizes them so no stage flips status ad hoc.
- **Transactions:** each stage's writes are atomic; partial failure leaves the
  prior stage's data intact.
- **Logging/observability:** per-stage start/end, durations, row counts, and PSI
  call counts. Failures log the `failedStage` and the underlying error.
- **Secrets:** `PSI_API_KEY` and `DATABASE_URL` from env only; `.env` gitignored,
  `.env.example` checked in.
- **Politeness:** respect `robots.txt`, configurable rate limits, a descriptive
  User-Agent — the crawler must be a good citizen.

---

## 9. Testing Strategy

| Layer            | What                                                                 |
|------------------|---------------------------------------------------------------------|
| Unit             | `ExtractService` against saved HTML fixtures; each `Rule` against seeded DB fixtures; `url.util` normalization cases. |
| Integration (DB) | Spin Postgres (Testcontainers or the compose DB), run a stage end-to-end against seed data, assert table state. |
| Enrichment       | Seed `pages` + `links`, run `EnrichService`, assert `isBroken`/`isRedirect`/`inlinkCount`/chains. |
| Analysis         | Per-rule: seed the minimal rows that trigger / don't trigger it, assert exact findings (id, severity, url, detail). |
| Report           | Generate a workbook from seeded findings; assert sheet names, headers, row counts (parse back with ExcelJS). |
| E2E (smoke)      | `audit:run` against a tiny local fixture site (static files served locally) → produces `.xlsx`. |

Principle: **every rule ships with a unit test** (Phase 3 acceptance). PSI is
mocked in tests (no live API calls in CI).

---

## 10. Configuration Reference

| Env var             | Purpose                                   | Validation              |
|---------------------|-------------------------------------------|-------------------------|
| `DATABASE_URL`      | Postgres connection string                | Required; **reachable on boot** |
| `DB_POOL_SIZE`      | `pg` Pool size                            | Int, default 10         |
| `PSI_API_KEY`       | PageSpeed Insights API key                | Required for Phase 4    |
| `CRAWL_MAX_PAGES`   | Hard cap on crawled URLs per audit        | Int                     |
| `CRAWL_CONCURRENCY` | Crawlee concurrency                       | Int                     |
| `CRAWL_RATE_LIMIT`  | Requests/sec ceiling                      | Int/float               |
| `PSI_MAX_SAMPLES`   | Max representative URLs sent to PSI        | Int                     |
| `OUTPUT_DIR`        | Where `.xlsx` reports are written         | Writable path           |
| `REDIS_URL`         | (Phase 7) BullMQ broker                   | Required if API enabled |

---

## 11. CLI Reference

```bash
npm run cli audit:create <url>       # Phase 0 — insert audits row, print id
npm run cli audit:crawl <auditId>    # Phase 1 — crawl → pages/links/images/hreflang
npm run cli audit:enrich <auditId>   # Phase 2 — resolve links, inlinks, chains, reciprocity
npm run cli audit:analyze <auditId>  # Phase 3 — run all rules → findings
npm run cli audit:perf <auditId>     # Phase 4 — PSI/CWV for sampled URLs → findings
npm run cli audit:report <auditId>   # Phase 5 — write .xlsx, record reportPath
npm run cli audit:run <url>          # Phase 6 — full pipeline, cold start → .xlsx
```

---

## 12. Definition of Done per Phase

| Phase | Done when…                                                                                  |
|-------|---------------------------------------------------------------------------------------------|
| 0     | `docker compose up` + migrations + `audit:create` work; fails fast on bad `DATABASE_URL`; tests pass. |
| 1     | Real small site fills all four crawl tables; multi-title/H1 as jsonb arrays; crawl idempotent. |
| 2     | Broken/redirect/inlink/chain/reciprocity all correct via set-based SQL.                     |
| 3     | Every rule unit-tested; analysis yields categorized findings; aggregations in SQL.          |
| 4     | PSI metrics stored for samples; perf findings in `findings`; calls cached/rate-limited.     |
| 5     | Real audit → formatted `.xlsx` with populated ТЗ tables + summary.                          |
| 6     | `audit:run <url>` cold-start → finished `.xlsx`; single-stage re-run never re-crawls.       |
| 7     | Start audit from UI, watch status, download report.                                         |

---

*This document is the build contract. Execute one phase at a time; each phase
ends runnable and testable, and the next builds on it without rewrites.*
