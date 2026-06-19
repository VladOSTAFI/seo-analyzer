import { Inject, Injectable, Logger } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env.validation';
import { DB, type Database } from '../db/db.types';
import { applyBudget } from './url-budget';

/**
 * Outcome of re-fetching one distinct target URL.
 *
 * - `healthy`  — live response settled at 2xx or 3xx ⇒ the crawl-time broken
 *   flag was a FALSE POSITIVE; clear it for every link with this href.
 * - `broken`   — live response is still 4xx/5xx ⇒ genuinely broken; keep the
 *   flag, but refresh `target_status_code` to the freshly observed code.
 * - `inconclusive` — network error / timeout / non-http(s) scheme ⇒ we have NO
 *   positive proof either way, so the existing flag is LEFT UNTOUCHED.
 */
type VerifyOutcome = 'healthy' | 'broken' | 'inconclusive';

interface VerifyResult {
  href: string;
  outcome: VerifyOutcome;
  /** Final HTTP status after following redirects (null when inconclusive). */
  finalStatus: number | null;
  /** Whether the final status is a 3xx (only meaningful when `healthy`). */
  isRedirect: boolean;
}

/** Counts surfaced back to {@link EnrichService} for the summary/log line. */
export interface VerifyPassResult {
  /** Distinct URLs actually fetched (after dedup + cap). */
  linksVerified: number;
  /** Distinct URLs whose flag was cleared (healthy on re-check). */
  falsePositivesCleared: number;
  /** Distinct URLs left untouched because the re-check failed (net error/timeout). */
  verifyInconclusive: number;
}

/** Counts returned by the external-link probe pass. */
export interface ExternalProbeResult {
  /** Distinct external hrefs probed. */
  externalsVerified: number;
  /** Whether the probe set was capped before all candidates were exhausted. */
  truncated: boolean;
}

/** Counts returned by the image probe pass. */
export interface ImageProbeResult {
  /** Distinct image src URLs probed. */
  imagesVerified: number;
  /** Whether the probe set was capped before all candidates were exhausted. */
  truncated: boolean;
}

const ZERO_RESULT: VerifyPassResult = {
  linksVerified: 0,
  falsePositivesCleared: 0,
  verifyInconclusive: 0,
};

const ZERO_EXTERNAL: ExternalProbeResult = { externalsVerified: 0, truncated: false };
const ZERO_IMAGE: ImageProbeResult = { imagesVerified: 0, truncated: false };

/**
 * Browser-like `Accept` header. Paired with the configured browser UA so that
 * UA/`Accept`-sniffing origins serve us the same response a real visitor gets,
 * rather than a bot challenge or a 5xx.
 */
const ACCEPT_HEADER =
  'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8';

/** Status class helpers — kept local so the verifier has no crawl dependency. */
const isHealthy = (status: number): boolean =>
  (status >= 200 && status < 300) || (status >= 300 && status < 400);
const is3xx = (status: number): boolean => status >= 300 && status < 400;

/**
 * Broken-link verification pass for Phase 2 enrich.
 *
 * The crawl records each page's `status_code` as a point-in-time snapshot taken
 * under crawl load with a bot User-Agent. That snapshot produces FALSE POSITIVES
 * for broken-link findings: a page that momentarily 5xx'd under pressure (or that
 * blocks the bot UA) gets permanently flagged `is_broken` even though a normal
 * browser request returns 200. This pass re-checks every link the set-based
 * enrich flagged `is_broken = true` with a fresh, browser-like request and clears
 * the flag for anything that is actually healthy.
 *
 * IDEMPOTENCY NOTE: unlike the set-based enrich steps, this pass is network
 * dependent and therefore NOT strictly idempotent — two runs can legitimately
 * disagree if the live target's status changes between them. That is a deliberate
 * and correct tradeoff: the whole point is to reflect the CURRENT live state, not
 * the frozen crawl snapshot.
 *
 * SAFETY: hrefs were discovered on the crawled (first-party) site, so this is
 * lower-risk than verifying user-supplied URLs. We still only fetch http(s)
 * schemes and never clear a flag without positive proof of health.
 *
 * RESILIENCE: this pass is best-effort. Its DB writes run OUTSIDE the enrich
 * transaction and any failure is caught and logged — verification must NEVER
 * fail the enrich stage. We deliberately use a small concurrency pool and a
 * browser UA so we do not re-trigger the very load/bot-block that caused the
 * false positives in the first place.
 */
@Injectable()
export class LinkVerifierService {
  private readonly logger = new Logger(LinkVerifierService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /**
   * Re-verify every DISTINCT `href` currently flagged `is_broken = true` for the
   * audit and reconcile the flag against the live response. Returns observability
   * counts; always resolves (never throws) so the caller can fold the counts into
   * the summary without a try/catch of its own.
   */
  async verifyBrokenLinks(auditId: string): Promise<VerifyPassResult> {
    if (!this.env.LINK_VERIFY_ENABLED) {
      this.logger.log(`Link verify disabled (LINK_VERIFY_ENABLED=false) audit=${auditId}`);
      return { ...ZERO_RESULT };
    }

    try {
      return await this.runPass(auditId);
    } catch (err) {
      // Best-effort contract: a verification failure must NEVER fail enrich.
      const reason = err instanceof Error ? err.message : String(err);
      this.logger.error(`Link verify pass errored (ignored) audit=${auditId}: ${reason}`);
      return { ...ZERO_RESULT };
    }
  }

  /**
   * Probe external links (type='external') whose `target_status_code` is still
   * NULL (i.e. the crawl never visited them). Gated by EXTERNAL_VERIFY_ENABLED.
   * Uses HEAD with GET fallback, bounded pool (LINK_VERIFY_CONCURRENCY / timeout),
   * per-host budget (EXTERNAL_VERIFY_PER_HOST), and global cap (EXTERNAL_VERIFY_MAX).
   *
   * Best-effort: always resolves, never throws.
   */
  async probeExternalLinks(auditId: string): Promise<ExternalProbeResult> {
    if (!this.env.EXTERNAL_VERIFY_ENABLED) {
      this.logger.log(`External probe disabled (EXTERNAL_VERIFY_ENABLED=false) audit=${auditId}`);
      return { ...ZERO_EXTERNAL };
    }

    try {
      return await this.runExternalPass(auditId);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      this.logger.error(`External probe pass errored (ignored) audit=${auditId}: ${reason}`);
      return { ...ZERO_EXTERNAL };
    }
  }

  /**
   * Probe image src URLs whose `status_code` is still NULL (never matched a
   * crawled page in the set-based resolution). Gated by IMAGE_VERIFY_ENABLED.
   * Same pool/budget/cap as the external probe pass.
   *
   * Best-effort: always resolves, never throws.
   */
  async probeImages(auditId: string): Promise<ImageProbeResult> {
    if (!this.env.IMAGE_VERIFY_ENABLED) {
      this.logger.log(`Image probe disabled (IMAGE_VERIFY_ENABLED=false) audit=${auditId}`);
      return { ...ZERO_IMAGE };
    }

    try {
      return await this.runImagePass(auditId);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      this.logger.error(`Image probe pass errored (ignored) audit=${auditId}: ${reason}`);
      return { ...ZERO_IMAGE };
    }
  }

  /** Inner pass: select distinct targets, fetch with a bounded pool, apply results. */
  private async runPass(auditId: string): Promise<VerifyPassResult> {
    const startedAt = Date.now();
    const max = this.env.LINK_VERIFY_MAX;

    // DISTINCT href dedup: many links share the same target, so each URL is
    // fetched once and the result applied to every links row with that href.
    // Fetch one extra so we can detect (and log) cap truncation.
    const rows = (
      await this.db.execute(sql`
        select distinct href
        from links
        where audit_id = ${auditId}
          and is_broken = true
        order by href
        limit ${max + 1}
      `)
    ).rows as { href: string }[];

    let candidates = rows.map((r) => r.href).filter((h) => this.isHttpUrl(h));
    const skippedNonHttp = rows.length - candidates.length;
    if (skippedNonHttp > 0) {
      this.logger.log(
        `Link verify skipping ${skippedNonHttp} non-http(s) target(s) audit=${auditId}`,
      );
    }

    if (candidates.length > max) {
      this.logger.warn(
        `Link verify cap hit: truncating ${candidates.length} distinct targets to ` +
          `LINK_VERIFY_MAX=${max} audit=${auditId}`,
      );
      candidates = candidates.slice(0, max);
    }

    if (candidates.length === 0) {
      this.logger.log(`Link verify: no broken targets to re-check audit=${auditId}`);
      return { ...ZERO_RESULT };
    }

    this.logger.log(
      `Link verify start audit=${auditId} distinct_targets=${candidates.length} ` +
        `concurrency=${this.env.LINK_VERIFY_CONCURRENCY} timeoutMs=${this.env.LINK_VERIFY_TIMEOUT_MS}`,
    );

    const results = await this.fetchAll(candidates);

    let falsePositivesCleared = 0;
    let verifyInconclusive = 0;
    for (const result of results) {
      if (result.outcome === 'inconclusive') {
        verifyInconclusive++;
        continue; // leave the existing flag untouched
      }
      await this.applyResult(auditId, result);
      if (result.outcome === 'healthy') falsePositivesCleared++;
    }

    const elapsedMs = Date.now() - startedAt;
    this.logger.log(
      `Link verify done audit=${auditId} verified=${results.length} ` +
        `false_positives_cleared=${falsePositivesCleared} inconclusive=${verifyInconclusive} ` +
        `durationMs=${elapsedMs}`,
    );

    return {
      linksVerified: results.length,
      falsePositivesCleared,
      verifyInconclusive,
    };
  }

  /**
   * Inner external-link probe: SELECT distinct unprobed external hrefs, apply
   * per-host and total budget caps, HEAD+GET-fallback fetch, UPDATE results.
   */
  private async runExternalPass(auditId: string): Promise<ExternalProbeResult> {
    const startedAt = Date.now();
    const max = this.env.EXTERNAL_VERIFY_MAX;
    const perHost = this.env.EXTERNAL_VERIFY_PER_HOST;

    // Fetch one extra beyond the hard cap so we can detect truncation.
    const rows = (
      await this.db.execute(sql`
        select distinct href
        from links
        where audit_id = ${auditId}
          and type = 'external'
          and target_status_code is null
        order by href
        limit ${max + 1}
      `)
    ).rows as { href: string }[];

    const httpOnly = rows.map((r) => r.href).filter((h) => this.isHttpUrl(h));
    const skippedNonHttp = rows.length - httpOnly.length;
    if (skippedNonHttp > 0) {
      this.logger.log(
        `External probe skipping ${skippedNonHttp} non-http(s) href(s) audit=${auditId}`,
      );
    }

    if (httpOnly.length === 0) {
      this.logger.log(`External probe: no unprobed external links found audit=${auditId}`);
      return { ...ZERO_EXTERNAL };
    }

    const budget = applyBudget(httpOnly, perHost, max);
    if (budget.perHostTruncated || budget.totalTruncated) {
      this.logger.warn(
        `External probe budget applied: perHostTruncated=${budget.perHostTruncated} ` +
          `totalTruncated=${budget.totalTruncated} remaining=${budget.urls.length} audit=${auditId}`,
      );
    }

    this.logger.log(
      `External probe start audit=${auditId} distinct_targets=${budget.urls.length} ` +
        `concurrency=${this.env.LINK_VERIFY_CONCURRENCY} timeoutMs=${this.env.LINK_VERIFY_TIMEOUT_MS}`,
    );

    const probed = await this.fetchAllStatuses(budget.urls);

    for (const { href, status, broken } of probed) {
      await this.db.execute(sql`
        update links
        set target_status_code = ${status},
            is_broken = ${broken}
        where audit_id = ${auditId}
          and href = ${href}
          and type = 'external'
      `);
    }

    const elapsedMs = Date.now() - startedAt;
    this.logger.log(
      `External probe done audit=${auditId} probed=${probed.length} ` +
        `truncated=${budget.perHostTruncated || budget.totalTruncated} durationMs=${elapsedMs}`,
    );

    return {
      externalsVerified: probed.length,
      truncated: budget.perHostTruncated || budget.totalTruncated,
    };
  }

  /**
   * Inner image probe: SELECT distinct unprobed image srcs, apply budget caps,
   * HEAD+GET-fallback fetch, UPDATE images.status_code.
   */
  private async runImagePass(auditId: string): Promise<ImageProbeResult> {
    const startedAt = Date.now();
    const max = this.env.EXTERNAL_VERIFY_MAX;
    const perHost = this.env.EXTERNAL_VERIFY_PER_HOST;

    const rows = (
      await this.db.execute(sql`
        select distinct src
        from images
        where audit_id = ${auditId}
          and status_code is null
        order by src
        limit ${max + 1}
      `)
    ).rows as { src: string }[];

    const httpOnly = rows.map((r) => r.src).filter((h) => this.isHttpUrl(h));
    const skippedNonHttp = rows.length - httpOnly.length;
    if (skippedNonHttp > 0) {
      this.logger.log(`Image probe skipping ${skippedNonHttp} non-http(s) src(s) audit=${auditId}`);
    }

    if (httpOnly.length === 0) {
      this.logger.log(`Image probe: no unprobed image srcs found audit=${auditId}`);
      return { ...ZERO_IMAGE };
    }

    const budget = applyBudget(httpOnly, perHost, max);
    if (budget.perHostTruncated || budget.totalTruncated) {
      this.logger.warn(
        `Image probe budget applied: perHostTruncated=${budget.perHostTruncated} ` +
          `totalTruncated=${budget.totalTruncated} remaining=${budget.urls.length} audit=${auditId}`,
      );
    }

    this.logger.log(
      `Image probe start audit=${auditId} distinct_srcs=${budget.urls.length} ` +
        `concurrency=${this.env.LINK_VERIFY_CONCURRENCY} timeoutMs=${this.env.LINK_VERIFY_TIMEOUT_MS}`,
    );

    const probed = await this.fetchAllStatuses(budget.urls);

    for (const { href, status } of probed) {
      await this.db.execute(sql`
        update images
        set status_code = ${status}
        where audit_id = ${auditId}
          and src = ${href}
      `);
    }

    const elapsedMs = Date.now() - startedAt;
    this.logger.log(
      `Image probe done audit=${auditId} probed=${probed.length} ` +
        `truncated=${budget.perHostTruncated || budget.totalTruncated} durationMs=${elapsedMs}`,
    );

    return {
      imagesVerified: probed.length,
      truncated: budget.perHostTruncated || budget.totalTruncated,
    };
  }

  /**
   * Persist one re-check result for ALL links rows sharing this href.
   *
   * - healthy ⇒ false positive: clear `is_broken`, record the fresh status, set
   *   `is_redirect` from whether the final status is a 3xx.
   * - broken  ⇒ keep `is_broken = true` but refresh `target_status_code` to the
   *   freshly observed code so the report shows the current code.
   *
   * Runs as its own small set-based UPDATE OUTSIDE the enrich transaction.
   */
  private async applyResult(auditId: string, result: VerifyResult): Promise<void> {
    if (result.outcome === 'healthy') {
      await this.db.execute(sql`
        update links
        set is_broken = false,
            is_redirect = ${result.isRedirect},
            target_status_code = ${result.finalStatus}
        where audit_id = ${auditId}
          and href = ${result.href}
      `);
    } else if (result.outcome === 'broken') {
      await this.db.execute(sql`
        update links
        set target_status_code = ${result.finalStatus}
        where audit_id = ${auditId}
          and href = ${result.href}
      `);
    }
  }

  /**
   * Fetch every candidate URL with a bounded worker pool (no row-by-row blocking;
   * `LINK_VERIFY_CONCURRENCY` workers drain a shared index). Small + dependency-free.
   */
  private async fetchAll(urls: string[]): Promise<VerifyResult[]> {
    const results: VerifyResult[] = new Array<VerifyResult>(urls.length);
    const poolSize = Math.max(1, Math.min(this.env.LINK_VERIFY_CONCURRENCY, urls.length));
    let next = 0;

    const worker = async (): Promise<void> => {
      for (;;) {
        const idx = next++;
        if (idx >= urls.length) return;
        results[idx] = await this.verifyOne(urls[idx]);
      }
    };

    await Promise.all(Array.from({ length: poolSize }, () => worker()));
    return results;
  }

  /**
   * Probe a list of URLs (HEAD with GET fallback) using the bounded pool and
   * return `{ href, status, broken }` for each. Used by external-link and image
   * probe passes. A fetch failure is recorded as `status=0, broken=true`.
   */
  private async fetchAllStatuses(
    urls: string[],
  ): Promise<{ href: string; status: number; broken: boolean }[]> {
    const results: { href: string; status: number; broken: boolean }[] = new Array(urls.length);
    const poolSize = Math.max(1, Math.min(this.env.LINK_VERIFY_CONCURRENCY, urls.length));
    let next = 0;

    const worker = async (): Promise<void> => {
      for (;;) {
        const idx = next++;
        if (idx >= urls.length) return;
        const href = urls[idx];
        try {
          const status = await this.fetchStatusHeadGet(href);
          results[idx] = { href, status, broken: status >= 400 };
        } catch {
          // Network error / timeout → mark broken (status 0 as sentinel).
          results[idx] = { href, status: 0, broken: true };
        }
      }
    };

    await Promise.all(Array.from({ length: poolSize }, () => worker()));
    return results;
  }

  /**
   * Re-fetch a single URL and classify it. Tries GET (some origins 5xx on HEAD).
   * A couple of retries with small linear backoff cover transient errors; only a
   * truly failed fetch (after retries) is `inconclusive`. A 4xx/5xx HTTP response
   * is a SUCCESSFUL fetch that classifies as `broken` (no retry needed).
   */
  private async verifyOne(href: string): Promise<VerifyResult> {
    const retries = this.env.LINK_VERIFY_RETRIES;
    let lastError: unknown;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const status = await this.fetchStatus(href);
        if (isHealthy(status)) {
          return { href, outcome: 'healthy', finalStatus: status, isRedirect: is3xx(status) };
        }
        return { href, outcome: 'broken', finalStatus: status, isRedirect: false };
      } catch (err) {
        lastError = err;
        if (attempt < retries) {
          // Small linear backoff (100ms, 200ms, ...) — gentle, not a thundering herd.
          await this.sleep(100 * (attempt + 1));
        }
      }
    }

    const reason = lastError instanceof Error ? lastError.message : String(lastError);
    this.logger.debug?.(`Link verify inconclusive href=${href}: ${reason}`);
    return { href, outcome: 'inconclusive', finalStatus: null, isRedirect: false };
  }

  /**
   * HEAD with GET fallback for the external/image probe passes. Some origins
   * return 405/501 for HEAD — fall back to GET in those cases. Returns the final
   * HTTP status (or throws on network error/timeout).
   */
  private async fetchStatusHeadGet(href: string): Promise<number> {
    const headStatus = await this.fetchStatusMethod(href, 'HEAD');
    if (headStatus === 405 || headStatus === 501) {
      return this.fetchStatusMethod(href, 'GET');
    }
    return headStatus;
  }

  /**
   * One HTTP request with a browser UA, following redirects, bounded by a
   * per-request AbortSignal timeout. Returns the final numeric status.
   * Drains/cancels the body (we only need the status line). Throws on network
   * error / timeout.
   */
  private async fetchStatusMethod(href: string, method: 'HEAD' | 'GET'): Promise<number> {
    const response = await fetch(href, {
      method,
      redirect: 'follow',
      signal: AbortSignal.timeout(this.env.LINK_VERIFY_TIMEOUT_MS),
      headers: {
        'User-Agent': this.env.LINK_VERIFY_USER_AGENT,
        Accept: ACCEPT_HEADER,
      },
    });
    try {
      await response.body?.cancel();
    } catch {
      // ignore — best-effort cleanup
    }
    return response.status;
  }

  /**
   * One HTTP GET with a browser UA, following redirects, bounded by a per-request
   * AbortSignal timeout. Returns the final numeric status. Drains/cancels the body
   * (we only need the status line). Throws on network error / timeout.
   */
  private async fetchStatus(href: string): Promise<number> {
    const response = await fetch(href, {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(this.env.LINK_VERIFY_TIMEOUT_MS),
      headers: {
        'User-Agent': this.env.LINK_VERIFY_USER_AGENT,
        Accept: ACCEPT_HEADER,
      },
    });
    // We only need the status; cancel the body so the connection is freed
    // promptly instead of waiting on a (possibly large) download.
    try {
      await response.body?.cancel();
    } catch {
      // ignore — best-effort cleanup
    }
    return response.status;
  }

  /** Only verify http/https targets (skip mailto:, tel:, javascript:, etc.). */
  private isHttpUrl(href: string): boolean {
    try {
      const scheme = new URL(href).protocol;
      return scheme === 'http:' || scheme === 'https:';
    } catch {
      return false;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
