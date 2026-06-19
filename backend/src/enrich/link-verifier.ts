import { connect as tlsConnect } from 'node:tls';
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

/** Counts returned by the best-effort TLS cert probe pass (feature 11). */
export interface CertProbeResult {
  /** Distinct hosts whose certificate was checked. */
  hostsChecked: number;
}

const ZERO_CERT: CertProbeResult = { hostsChecked: 0 };

/** One host's TLS cert verdict. */
interface CertVerdict {
  /** Cert chain valid AND host matches (Node's authorized flag). */
  valid: boolean;
  /** Whole days until `notAfter` (negative when already expired); null unknown. */
  daysToExpiry: number | null;
}

/**
 * Stream-count cap (bytes) for the image probe when the origin sends no
 * `Content-Length`. Read directly from the environment with a safe default so it
 * works whether or not the validated Env type carries IMAGE_FETCH_MAX_BYTES yet
 * (mirrors how the extractor / rules read their own env knobs). Positive int only.
 */
function readIntEnv(name: string, def: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return def;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : def;
}
const IMAGE_FETCH_MAX_BYTES = readIntEnv('IMAGE_FETCH_MAX_BYTES', 5_000_000);

/**
 * Read a boolean env var (truthy spellings) with a default. Read from
 * process.env directly so the cert gate works whether or not the validated Env
 * type carries SECURITY_VERIFY_ENABLED yet (same discipline as readIntEnv above).
 */
function readBoolEnv(name: string, def: boolean): boolean {
  const raw = (process.env[name] ?? '').trim().toLowerCase();
  if (raw === '') return def;
  return raw === 'true' || raw === '1' || raw === 'yes' || raw === 'on';
}

/** Probe outcome for one image src: live status + measured bytes/format. */
interface ImageProbeRow {
  href: string;
  status: number;
  /** Transfer/content bytes; null when neither header nor stream-count yielded a value. */
  bytes: number | null;
  /** Normalized format token ('webp'|'avif'|'jpeg'|'png'|'gif'|'svg'|...); null unknown. */
  format: string | null;
  /** Scheme of the resolved src (https → true). Drives the feature-11 mixed-content rule. */
  isHttps: boolean;
}

/**
 * Normalize a `Content-Type` header into a short format token. Falls back to the
 * `src` file extension when the header is missing/ambiguous. Returns null when
 * neither yields a recognizable image format.
 */
function deriveImageFormat(contentType: string | null, src: string): string | null {
  const ct = (contentType ?? '').toLowerCase();
  if (ct.includes('image/webp')) return 'webp';
  if (ct.includes('image/avif')) return 'avif';
  if (ct.includes('image/jpeg') || ct.includes('image/jpg')) return 'jpeg';
  if (ct.includes('image/png')) return 'png';
  if (ct.includes('image/gif')) return 'gif';
  if (ct.includes('image/svg')) return 'svg';
  // Fall back to the src extension (strip query/fragment first).
  const path = src.split(/[?#]/)[0] ?? src;
  const ext = path.includes('.') ? (path.split('.').pop() ?? '').toLowerCase() : '';
  if (ext === 'webp') return 'webp';
  if (ext === 'avif') return 'avif';
  if (ext === 'jpg' || ext === 'jpeg') return 'jpeg';
  if (ext === 'png') return 'png';
  if (ext === 'gif') return 'gif';
  if (ext === 'svg') return 'svg';
  return null;
}

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

  /**
   * Best-effort TLS certificate probe (feature 11 `security.cert`). Gated by
   * SECURITY_VERIFY_ENABLED (default OFF). One TLS connection per DISTINCT host
   * across the audit's HTTPS pages; records `cert_valid` / `cert_days_to_expiry`
   * onto every `pages` row for that host. Best-effort: always resolves, never
   * throws — a cert probe failure must NEVER fail enrich.
   */
  async verifyCerts(auditId: string): Promise<CertProbeResult> {
    if (!readBoolEnv('SECURITY_VERIFY_ENABLED', false)) {
      this.logger.log(`Cert verify disabled (SECURITY_VERIFY_ENABLED=false) audit=${auditId}`);
      return { ...ZERO_CERT };
    }
    try {
      return await this.runCertPass(auditId);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      this.logger.error(`Cert verify pass errored (ignored) audit=${auditId}: ${reason}`);
      return { ...ZERO_CERT };
    }
  }

  /**
   * Inner cert pass: SELECT distinct HTTPS hosts from the audit's HTML pages,
   * probe each host's certificate once, and UPDATE the cert columns for every
   * page on that host.
   */
  private async runCertPass(auditId: string): Promise<CertProbeResult> {
    const startedAt = Date.now();
    const rows = (
      await this.db.execute(sql`
        select distinct lower(coalesce(final_url, url)) as eff_url
        from pages
        where audit_id = ${auditId}
          and page_kind = 'html'
          and lower(coalesce(final_url, url)) like 'https://%'
      `)
    ).rows as { eff_url: string }[];

    // Map distinct hosts → an example effective URL (host is what we probe).
    const hosts = new Map<string, void>();
    for (const r of rows) {
      try {
        hosts.set(new URL(r.eff_url).host, undefined);
      } catch {
        // skip unparseable
      }
    }
    if (hosts.size === 0) {
      this.logger.log(`Cert verify: no HTTPS hosts to check audit=${auditId}`);
      return { ...ZERO_CERT };
    }

    let checked = 0;
    for (const host of hosts.keys()) {
      const verdict = await this.probeCert(host);
      if (verdict === null) continue; // inconclusive — leave columns null
      checked += 1;
      await this.db.execute(sql`
        update pages
        set cert_valid = ${verdict.valid},
            cert_days_to_expiry = ${verdict.daysToExpiry}
        where audit_id = ${auditId}
          and page_kind = 'html'
          and lower(coalesce(final_url, url)) like ${`https://${host.toLowerCase()}%`}
      `);
    }

    const elapsedMs = Date.now() - startedAt;
    this.logger.log(
      `Cert verify done audit=${auditId} hosts_checked=${checked} durationMs=${elapsedMs}`,
    );
    return { hostsChecked: checked };
  }

  /**
   * One TLS connection to `host:443` (SNI), reading the peer certificate's
   * validity + `notAfter`. Resolves to a {@link CertVerdict} or null when the
   * connection failed (inconclusive). Bounded by LINK_VERIFY_TIMEOUT_MS. Never
   * throws.
   */
  private probeCert(host: string): Promise<CertVerdict | null> {
    const [hostname, portStr] = host.split(':');
    const port = portStr && /^\d+$/.test(portStr) ? Number(portStr) : 443;
    return new Promise<CertVerdict | null>((resolve) => {
      let settled = false;
      const done = (v: CertVerdict | null): void => {
        if (settled) return;
        settled = true;
        try {
          socket.destroy();
        } catch {
          // ignore
        }
        resolve(v);
      };
      const socket = tlsConnect(
        { host: hostname, port, servername: hostname, timeout: this.env.LINK_VERIFY_TIMEOUT_MS },
        () => {
          try {
            const cert = socket.getPeerCertificate();
            const valid = socket.authorized === true;
            let daysToExpiry: number | null = null;
            if (cert && cert.valid_to) {
              const expiry = new Date(cert.valid_to).getTime();
              if (Number.isFinite(expiry)) {
                daysToExpiry = Math.floor((expiry - Date.now()) / 86_400_000);
              }
            }
            done({ valid, daysToExpiry });
          } catch {
            done(null);
          }
        },
      );
      socket.on('timeout', () => done(null));
      socket.on('error', () => done(null));
    });
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

    const probed = await this.fetchAllImageMeta(budget.urls);

    for (const { href, status, bytes, format } of probed) {
      // (a) keep the legacy images.status_code in sync so `image.broken` fires.
      await this.db.execute(sql`
        update images
        set status_code = ${status}
        where audit_id = ${auditId}
          and src = ${href}
      `);
      // (b) record byte weight + format on the page_resources image row(s).
      // The crawl seeded one row per distinct (page_url, src); we update every
      // row for this src so each referencing page reflects the live resource.
      await this.db.execute(sql`
        update page_resources
        set status_code = ${status},
            bytes = ${bytes},
            format = ${format}
        where audit_id = ${auditId}
          and src = ${href}
          and kind = 'image'
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
   * Probe a list of image srcs (HEAD with GET fallback) returning live status +
   * byte weight + format for each, using the same bounded pool. A fetch failure
   * is recorded as `status=0` with null bytes/format (best-effort).
   */
  private async fetchAllImageMeta(urls: string[]): Promise<ImageProbeRow[]> {
    const results: ImageProbeRow[] = new Array<ImageProbeRow>(urls.length);
    const poolSize = Math.max(1, Math.min(this.env.LINK_VERIFY_CONCURRENCY, urls.length));
    let next = 0;

    const worker = async (): Promise<void> => {
      for (;;) {
        const idx = next++;
        if (idx >= urls.length) return;
        const href = urls[idx];
        const isHttps = href.toLowerCase().startsWith('https://');
        try {
          results[idx] = { ...(await this.fetchImageMeta(href)), href, isHttps };
        } catch {
          results[idx] = { href, status: 0, bytes: null, format: null, isHttps };
        }
      }
    };

    await Promise.all(Array.from({ length: poolSize }, () => worker()));
    return results;
  }

  /**
   * One image probe: HEAD first to read `Content-Length`/`Content-Type` cheaply.
   * On a 405/501 (HEAD-unsupported) or a missing `Content-Length`, fall back to a
   * GET and either trust its `Content-Length` header or stream-count the body up
   * to `IMAGE_FETCH_MAX_BYTES` (recording the cap when the stream exceeds it).
   * Format is derived from `Content-Type` (then the src extension). Throws on a
   * network error / timeout (the caller records it as inconclusive=status 0).
   */
  private async fetchImageMeta(
    href: string,
  ): Promise<{ status: number; bytes: number | null; format: string | null }> {
    const head = await this.fetchHeaders(href, 'HEAD');
    let status = head.status;
    let contentType = head.contentType;
    let bytes = head.contentLength;

    // HEAD unsupported, or no usable length header → GET (read length / stream).
    if (status === 405 || status === 501 || bytes === null) {
      const got = await this.fetchHeaders(href, 'GET');
      status = got.status;
      contentType = got.contentType ?? contentType;
      bytes = got.contentLength;
      if (bytes === null && got.body) {
        bytes = await this.countBytes(got.body);
      } else {
        // We took the length header (or have none); cancel the body promptly.
        try {
          await got.body?.cancel();
        } catch {
          // ignore — best-effort cleanup
        }
      }
    } else {
      try {
        await head.body?.cancel();
      } catch {
        // ignore — best-effort cleanup
      }
    }

    return { status, bytes, format: deriveImageFormat(contentType, href) };
  }

  /**
   * One HTTP request with the browser UA, following redirects, bounded by the
   * per-request timeout. Returns the final status, parsed `Content-Length`
   * (positive int or null), `Content-Type`, and the still-open body stream so the
   * caller can stream-count or cancel it. Throws on network error / timeout.
   */
  private async fetchHeaders(
    href: string,
    method: 'HEAD' | 'GET',
  ): Promise<{
    status: number;
    contentLength: number | null;
    contentType: string | null;
    body: ReadableStream<Uint8Array> | null;
  }> {
    const response = await fetch(href, {
      method,
      redirect: 'follow',
      signal: AbortSignal.timeout(this.env.LINK_VERIFY_TIMEOUT_MS),
      headers: {
        'User-Agent': this.env.LINK_VERIFY_USER_AGENT,
        Accept: ACCEPT_HEADER,
      },
    });
    const lenRaw = response.headers.get('content-length');
    const len = lenRaw !== null && /^\d+$/.test(lenRaw.trim()) ? Number(lenRaw.trim()) : null;
    return {
      status: response.status,
      contentLength: len !== null && len >= 0 ? len : null,
      contentType: response.headers.get('content-type'),
      body: (response.body as ReadableStream<Uint8Array> | null) ?? null,
    };
  }

  /**
   * Stream-count a response body, stopping (and cancelling) once the running
   * total reaches `IMAGE_FETCH_MAX_BYTES` — the returned value is then the cap
   * (recording "at least the cap" rather than downloading an unbounded image).
   */
  private async countBytes(body: ReadableStream<Uint8Array>): Promise<number> {
    const reader = body.getReader();
    let total = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value?.byteLength ?? 0;
        if (total >= IMAGE_FETCH_MAX_BYTES) {
          total = IMAGE_FETCH_MAX_BYTES;
          break;
        }
      }
    } finally {
      try {
        await reader.cancel();
      } catch {
        // ignore — best-effort cleanup
      }
    }
    return total;
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
