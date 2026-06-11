import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { InvalidArgumentError } from '../common/errors';
import { DB, type Database } from '../db/db.types';
import { AuditRepository } from '../audit/audit.repository';
import { findings, performance, type NewFinding, type NewPerformance } from '../db/schema';
import type { Severity } from '../analyze/rule.types';
import { RULES } from '../analyze/rule.registry';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env.validation';
import { PSI_CLIENT, PSI_STRATEGIES, type PsiClient } from './psi.types';
import type { PerformanceSample, PerformanceSummary, SampleCandidate } from './performance.types';

/** Insert batch size for chunked bulk inserts (mirrors analyze/crawl/enrich). */
const INSERT_CHUNK_SIZE = 500;

/** All severities, zero-filled, so the summary always has every key present. */
const SEVERITY_KEYS: Severity[] = ['critical', 'high', 'medium', 'low', 'info'];

/** Split an array into fixed-size chunks for batched inserts. */
function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

/**
 * Read a single integer aggregate (e.g. `count(*)`) from an `execute` result.
 * node-postgres returns `{ rows: [...] }`; the aggregate column is `n`. Coerces
 * Postgres' bigint-as-string defensively so callers always get a JS number.
 */
function scalarCount(result: { rows: Record<string, unknown>[] }): number {
  const value = result.rows[0]?.n;
  return value == null ? 0 : Number(value);
}

/** Matches a path segment that is a pure integer id (e.g. `42`). */
const NUMERIC_SEGMENT = /^\d+$/;
/** Matches a long hex / uuid-ish opaque token (>= 8 hex chars, optional dashes). */
const ID_LIKE_SEGMENT = /^[0-9a-f]{8,}$/i;
/** Matches a uuid (8-4-4-4-12 hex). */
const UUID_SEGMENT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Derive a stable TEMPLATE KEY from a URL by collapsing id-like path segments to
 * `:id`. Strips scheme+host and the query string, splits the path, and replaces
 * any segment that is numeric, a uuid, or a long hex/opaque token with `:id`.
 *
 * Examples:
 *   https://x.test/product/42        -> /product/:id
 *   https://x.test/product/99?ref=1  -> /product/:id
 *   https://x.test/blog/hello-world  -> /blog/hello-world
 *   https://x.test/                  -> /
 *
 * Pure + exported so the sampler clustering can be unit-tested in isolation.
 */
export function deriveTemplateKey(url: string): string {
  let path: string;
  try {
    path = new URL(url).pathname;
  } catch {
    // Not an absolute URL — fall back to treating the input as a raw path,
    // dropping any query string ourselves.
    path = url.split('?')[0].split('#')[0];
  }

  const segments = path.split('/').filter((s) => s.length > 0);
  if (segments.length === 0) return '/';

  const normalized = segments.map((seg) => {
    const decoded = (() => {
      try {
        return decodeURIComponent(seg);
      } catch {
        return seg;
      }
    })();
    if (
      NUMERIC_SEGMENT.test(decoded) ||
      UUID_SEGMENT.test(decoded) ||
      ID_LIKE_SEGMENT.test(decoded)
    ) {
      return ':id';
    }
    return decoded;
  });

  return `/${normalized.join('/')}`;
}

/**
 * Cluster candidate pages by template key and pick ONE representative per cluster.
 *
 * NOTE (push-to-SQL exception): the project rule is "do row mutation in set-based
 * SQL, not Node". This is SELECTION logic, not mutation — choosing which handful
 * of URLs best represent the site for an expensive, rate-limited, quota-bounded
 * external PSI call. JS clustering is the appropriate and intended tool here
 * (the candidate set is already capped by the crawl page cap, so it is tiny).
 *
 * Representative per cluster = highest inlinkCount (most linked → most important);
 * tie-break: lowest depth, then lexically smallest url (deterministic). Clusters
 * are ordered by DESCENDING size (most common templates first) so the `cap`
 * favours high-impact templates; representatives are then capped at `cap`. Pure +
 * exported for direct unit testing.
 */
export function selectSamples(candidates: SampleCandidate[], cap: number): PerformanceSample[] {
  const clusters = new Map<string, SampleCandidate[]>();
  for (const c of candidates) {
    const key = deriveTemplateKey(c.url);
    const bucket = clusters.get(key);
    if (bucket) bucket.push(c);
    else clusters.set(key, [c]);
  }

  // One representative per cluster.
  const representatives: { sample: PerformanceSample; size: number }[] = [];
  for (const [templateKey, members] of clusters) {
    const best = members.reduce((a, b) => (betterRepresentative(b, a) ? b : a));
    representatives.push({ sample: { url: best.url, templateKey }, size: members.length });
  }

  // Most common templates first; deterministic tie-break on templateKey.
  representatives.sort(
    (a, b) => b.size - a.size || a.sample.templateKey.localeCompare(b.sample.templateKey),
  );

  return representatives.slice(0, Math.max(0, cap)).map((r) => r.sample);
}

/** True when `a` is a better cluster representative than `b` (see selectSamples). */
function betterRepresentative(a: SampleCandidate, b: SampleCandidate): boolean {
  if (a.inlinkCount !== b.inlinkCount) return a.inlinkCount > b.inlinkCount;
  if (a.depth !== b.depth) return a.depth < b.depth;
  return a.url < b.url;
}

/** The `perf.*` subset of the rule registry — the only rules this service runs. */
const PERF_RULES = RULES.filter((r) => r.id.startsWith('perf.'));

/**
 * Phase 4 performance service. Samples representative URLs for an audit, fetches
 * PageSpeed Insights / Core Web Vitals for each (url, strategy) via the injected
 * {@link PsiClient} (skipping pairs already cached in the `performance` table),
 * persists the results, runs the `perf.*` rules and writes their findings.
 *
 * Depends on PSI through the PSI_CLIENT token (the interface seam) — it never
 * makes network calls itself, so unit tests inject a mock client.
 *
 * Status semantics: Phase 4 has NO dedicated `auditStatus` value (the enum is
 * created|crawling|enriching|analyzing|reporting|done|failed). Performance runs
 * on an ALREADY-analyzed audit and only contributes additional findings, so this
 * service DELIBERATELY does NOT advance status on success — it leaves it as-is.
 * On failure the outer catch marks the audit failed at stage `perf` and rethrows.
 */
@Injectable()
export class PerformanceService {
  private readonly logger = new Logger(PerformanceService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly auditRepo: AuditRepository,
    @Inject(PSI_CLIENT) private readonly psi: PsiClient,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async run(auditId: string): Promise<PerformanceSummary> {
    const startedAt = Date.now();
    await this.auditRepo.assertExists(auditId);

    // Guard: performance is meaningless without crawl output. As with analyze we
    // do NOT hard-require a particular status (it is a forward-only single value
    // and perf intentionally runs after analyze). A zero page count is the robust
    // signal that the upstream stages never ran.
    const pageCount = scalarCount(
      await this.db.execute(sql`select count(*)::int as n from pages where audit_id = ${auditId}`),
    );
    if (pageCount === 0) {
      throw new InvalidArgumentError(
        `No crawled pages for audit "${auditId}". ` +
          `Run \`audit:crawl ${auditId}\`, \`audit:enrich ${auditId}\` and ` +
          `\`audit:analyze ${auditId}\` first.`,
      );
    }

    try {
      // 1. Sample representative URLs (indexable HTML 200s only).
      const samples = await this.sample(auditId);

      // 2. Fetch (sequentially) every uncached (url, strategy) pair via PSI and
      //    persist the new rows. Cached pairs are skipped for quota safety.
      const { fetched, cached, failed } = await this.fetchAndPersist(auditId, samples);

      // 3. Run the perf.* rules and write their findings (idempotent re-run).
      const { findingCount, bySeverity } = await this.runRules(auditId);

      const summary: PerformanceSummary = {
        sampled: samples.length,
        fetched,
        cached,
        failed,
        findings: findingCount,
        bySeverity,
      };

      const elapsedMs = Date.now() - startedAt;
      this.logger.log(
        `Perf done audit=${auditId} sampled=${summary.sampled} fetched=${summary.fetched} ` +
          `cached=${summary.cached} failed=${summary.failed} findings=${summary.findings} ` +
          `(critical=${bySeverity.critical}, high=${bySeverity.high}, medium=${bySeverity.medium}, ` +
          `low=${bySeverity.low}, info=${bySeverity.info}) durationMs=${elapsedMs}`,
      );
      // Status intentionally left as-is on success (see class JSDoc).
      return summary;
    } catch (err) {
      await this.auditRepo.markFailed(auditId, 'perf');
      const reason = err instanceof Error ? err.message : String(err);
      this.logger.error(`Perf failed audit=${auditId} stage=perf: ${reason}`);
      throw err;
    }
  }

  /**
   * Select representative URLs for `auditId`. Pulls candidate pages with a single
   * SQL query (indexable HTML 200s only) then clusters/picks in JS (see
   * {@link selectSamples} for the push-to-SQL exception rationale).
   */
  private async sample(auditId: string): Promise<PerformanceSample[]> {
    const result = await this.db.execute(
      sql`
        select url, coalesce(inlink_count, 0)::int as inlink_count, depth
        from pages
        where audit_id = ${auditId}
          and status_class = '2xx'
          and (content_type is null or content_type like 'text/html%')
      `,
    );
    const candidates: SampleCandidate[] = result.rows.map((r) => ({
      url: String(r.url),
      inlinkCount: Number(r.inlink_count ?? 0),
      depth: Number(r.depth ?? 0),
    }));

    const cap = this.env.PSI_MAX_SAMPLES;
    const clusterCount = new Set(candidates.map((c) => deriveTemplateKey(c.url))).size;
    const samples = selectSamples(candidates, cap);
    const dropped = Math.max(0, clusterCount - samples.length);

    this.logger.log(
      `Perf sample audit=${auditId} candidates=${candidates.length} ` +
        `clusters=${clusterCount} sampled=${samples.length} ` +
        `dropped_by_cap=${dropped} cap=${cap}`,
    );
    return samples;
  }

  /**
   * For each sample × strategy: skip pairs already in `performance` (cached), and
   * otherwise fetch via PSI sequentially (the client rate-limits — never flood it
   * with Promise.all) and collect rows. A single fetch error is logged and counted
   * as `failed`, never aborting the run. New rows are chunked-inserted with an
   * upsert on the unique index so the write is idempotent even under a race.
   */
  private async fetchAndPersist(
    auditId: string,
    samples: PerformanceSample[],
  ): Promise<{ fetched: number; cached: number; failed: number }> {
    // One SELECT of all existing (page_url, strategy) pairs for this audit.
    const existingRows = await this.db
      .select({ pageUrl: performance.pageUrl, strategy: performance.strategy })
      .from(performance)
      .where(eq(performance.auditId, auditId));
    const existing = new Set(existingRows.map((r) => `${r.pageUrl} ${r.strategy}`));

    const newRows: NewPerformance[] = [];
    let cached = 0;
    let failed = 0;

    for (const sample of samples) {
      for (const strategy of PSI_STRATEGIES) {
        if (existing.has(`${sample.url} ${strategy}`)) {
          cached += 1;
          continue;
        }
        try {
          const m = await this.psi.fetch(sample.url, strategy);
          newRows.push({
            auditId,
            pageUrl: sample.url,
            strategy,
            lcpMs: m.lcpMs,
            cls: m.cls,
            inpMs: m.inpMs,
            performanceScore: m.performanceScore,
            fcpMs: m.fcpMs,
            tbtMs: m.tbtMs,
            speedIndexMs: m.speedIndexMs,
            usabilityFlags: m.usabilityFlags,
            isOriginFallback: m.isOriginFallback,
            cwvSource: m.cwvSource,
            psiRaw: m.raw,
          });
        } catch (fetchErr) {
          failed += 1;
          const reason = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
          this.logger.warn(
            `PSI fetch failed audit=${auditId} url=${sample.url} strategy=${strategy}: ${reason}`,
          );
        }
      }
    }

    // Persist the freshly-fetched rows. onConflictDoUpdate keeps the write
    // idempotent/re-run-safe even if a concurrent run inserted the same pair.
    for (const part of chunk(newRows, INSERT_CHUNK_SIZE)) {
      if (!part.length) continue;
      await this.db
        .insert(performance)
        .values(part)
        .onConflictDoUpdate({
          target: [performance.auditId, performance.pageUrl, performance.strategy],
          set: {
            lcpMs: sql`excluded.lcp_ms`,
            cls: sql`excluded.cls`,
            inpMs: sql`excluded.inp_ms`,
            performanceScore: sql`excluded.performance_score`,
            fcpMs: sql`excluded.fcp_ms`,
            tbtMs: sql`excluded.tbt_ms`,
            speedIndexMs: sql`excluded.speed_index_ms`,
            usabilityFlags: sql`excluded.usability_flags`,
            isOriginFallback: sql`excluded.is_origin_fallback`,
            cwvSource: sql`excluded.cwv_source`,
            psiRaw: sql`excluded.psi_raw`,
            fetchedAt: sql`now()`,
          },
        });
    }

    return { fetched: newRows.length, cached, failed };
  }

  /**
   * Run the `perf.*` rule subset against the now-populated `performance` table and
   * persist their findings. Done inside ONE transaction that FIRST deletes this
   * audit's existing perf-family findings (so re-runs are idempotent and the ~27
   * analyze findings are left untouched). Each rule's `run` is isolated in its own
   * try/catch (a failing rule is logged, non-fatal); a DB-level error propagates.
   */
  private async runRules(
    auditId: string,
  ): Promise<{ findingCount: number; bySeverity: Record<Severity, number> }> {
    const rows = await this.db.transaction(async (tx) => {
      // Clear ONLY the perf-family findings so analyze findings survive.
      await tx
        .delete(findings)
        .where(and(eq(findings.auditId, auditId), sql`${findings.ruleId} like 'perf.%'`));

      const collected: NewFinding[] = [];
      for (const rule of PERF_RULES) {
        try {
          const found = await rule.run(tx, auditId);
          for (const f of found) {
            collected.push({
              auditId,
              ruleId: rule.id,
              severity: f.severity ?? rule.severity,
              confidence: f.confidence ?? rule.confidence ?? 'high',
              url: f.url,
              detail: f.detail ?? {},
            });
          }
        } catch (ruleErr) {
          const reason = ruleErr instanceof Error ? ruleErr.message : String(ruleErr);
          this.logger.error(`Perf rule failed audit=${auditId} rule=${rule.id}: ${reason}`);
        }
      }

      for (const part of chunk(collected, INSERT_CHUNK_SIZE)) {
        if (part.length) await tx.insert(findings).values(part);
      }
      return collected;
    });

    const bySeverity = Object.fromEntries(SEVERITY_KEYS.map((s) => [s, 0])) as Record<
      Severity,
      number
    >;
    for (const row of rows) bySeverity[row.severity] += 1;

    return { findingCount: rows.length, bySeverity };
  }
}
