import { Inject, Injectable, Logger } from '@nestjs/common';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env.validation';
import type { PsiClient, PsiMetrics, PsiStrategy } from './psi.types';

/** PageSpeed Insights v5 runPagespeed endpoint. */
const PSI_ENDPOINT = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';

/** Max chars of the response body echoed into a thrown error message. */
const ERROR_BODY_SNIPPET = 300;

/**
 * Bound each PSI request so a slow/hung response cannot stall the orchestrated
 * pipeline indefinitely. A timeout aborts the fetch → a thrown Error, which
 * PerformanceService already treats as a NON-FATAL per-(url,strategy) failure.
 */
const REQUEST_TIMEOUT_MS = 25_000;

/** Perf audits scoring below this (and non-null) are treated as problems. */
const PERF_PROBLEM_SCORE = 0.9;

/** SEO audits scoring below this (and non-null) are treated as failures. */
const SEO_PROBLEM_SCORE = 1;

/**
 * The slice of the PSI v5 JSON we read. Everything is optional/loosely typed
 * because PSI shapes vary (field data is absent for low-traffic URLs, audit maps
 * differ per Lighthouse version); every access in the parser is guarded.
 *
 * `origin_fallback` is the undocumented but stable boolean PSI sets on
 * `loadingExperience` when it had no page-level CrUX data and is returning
 * ORIGIN-level aggregates instead. We capture it so downstream rules can
 * collapse identical origin-level findings into one site-level finding.
 */
interface PsiResponse {
  loadingExperience?: {
    metrics?: Record<string, { percentile?: number } | undefined>;
    /** True when PSI is returning origin-level aggregates, not page-level CrUX. */
    origin_fallback?: boolean;
  };
  lighthouseResult?: {
    categories?: Record<
      string,
      { score?: number | null; auditRefs?: { id?: string }[] } | undefined
    >;
    audits?: Record<
      string,
      { score?: number | null; numericValue?: number; title?: string } | undefined
    >;
  };
}

/** Round a finite number to an integer; pass through null/undefined as null. */
function roundMs(value: number | undefined | null): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : null;
}

/** Round to `decimals` places; null for missing/non-finite input. */
function roundTo(value: number | undefined | null, decimals: number): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * Phase 4 PSI client. The ONLY component in the app permitted to make network
 * calls. Calls the PageSpeed Insights v5 API for one (url, strategy) using Node's
 * global `fetch` and parses the response into {@link PsiMetrics}.
 *
 * Field data (CrUX) from `loadingExperience` is preferred for LCP/CLS/INP; lab
 * data from Lighthouse is the fallback. PerformanceService depends on this via
 * the PSI_CLIENT token (interface, not impl) so tests inject a mock.
 *
 * Rate limiting: requests are serialized per instance and spaced by at least
 * `1000 / env.CRAWL_RATE_LIMIT` ms (the req/sec ceiling) to stay under PSI's
 * keyless throttle. Each request is also bounded by an AbortController timeout
 * (see {@link REQUEST_TIMEOUT_MS}) so a hung call cannot stall the Phase 6
 * pipeline. {@link fetch} is documented to THROW on network/quota/HTTP/timeout
 * error — PerformanceService catches per (url, strategy) pair, so failures here
 * are not swallowed.
 */
@Injectable()
export class PsiService implements PsiClient {
  private readonly logger = new Logger(PsiService.name);

  /** Earliest epoch-ms at which the next outgoing request may start. */
  private nextAllowedAt = 0;

  constructor(@Inject(ENV) private readonly env: Env) {}

  async fetch(url: string, strategy: PsiStrategy): Promise<PsiMetrics> {
    await this.pace();

    const endpoint = this.buildUrl(url, strategy);
    // Log the page url + strategy (never the key — it lives in the query string).
    this.logger.debug(`PSI request url=${url} strategy=${strategy}`);

    // Bound the request: abort after REQUEST_TIMEOUT_MS so a hung PSI call
    // rejects instead of stalling the pipeline. The timer is always cleared.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let response: Response;
    try {
      response = await global.fetch(endpoint, { signal: controller.signal });
    } catch (err) {
      const aborted = controller.signal.aborted;
      const reason = err instanceof Error ? err.message : String(err);
      if (aborted) {
        throw new Error(
          `PSI request failed (timeout after ${REQUEST_TIMEOUT_MS}ms) for ${url} [${strategy}]`,
        );
      }
      throw new Error(`PSI request failed (network) for ${url} [${strategy}]: ${reason}`);
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      const snippet = body.slice(0, ERROR_BODY_SNIPPET);
      throw new Error(
        `PSI request failed (${response.status}) for ${url} [${strategy}]: ${snippet}`,
      );
    }

    const json = (await response.json()) as PsiResponse;
    return this.parse(json);
  }

  /**
   * Build the runPagespeed query URL. `category` is appended twice (performance +
   * seo) per the v5 API; the `key` is included only when PSI_API_KEY is non-empty
   * (PSI works keyless at low volume but rate-limits hard).
   */
  private buildUrl(url: string, strategy: PsiStrategy): string {
    const params = new URLSearchParams();
    params.append('url', url);
    params.append('strategy', strategy);
    params.append('category', 'performance');
    params.append('category', 'seo');
    if (this.env.PSI_API_KEY) {
      params.append('key', this.env.PSI_API_KEY);
    }
    return `${PSI_ENDPOINT}?${params.toString()}`;
  }

  /**
   * Serialize + space outgoing requests. Derives a minimum inter-request gap of
   * `1000 / CRAWL_RATE_LIMIT` ms and sleeps only when the gap has not elapsed
   * (a 0/negative wait never delays — keeps tests instant at a high rate).
   */
  private async pace(): Promise<void> {
    const minIntervalMs = 1000 / this.env.CRAWL_RATE_LIMIT;
    const now = Date.now();
    const waitMs = this.nextAllowedAt - now;
    if (waitMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
    this.nextAllowedAt = Math.max(now, this.nextAllowedAt) + minIntervalMs;
  }

  /**
   * Parse a runPagespeed v5 response into {@link PsiMetrics}. Field CWV (CrUX)
   * is preferred for LCP/CLS/INP with a lab fallback; lab Lighthouse supplies the
   * score + FCP/TBT/SpeedIndex. Every nested access is guarded so a missing
   * section yields nulls / fewer flags rather than a throw. The full JSON is
   * returned verbatim as `raw`.
   *
   * Provenance fields:
   * - `isOriginFallback`: true when `loadingExperience.origin_fallback === true`,
   *   meaning PSI returned origin-level CrUX aggregates rather than page-specific
   *   data. Rules use this to avoid emitting one false per-page finding per sample.
   * - `cwvSource`: 'field' when any of LCP/CLS/INP came from CrUX field data,
   *   'lab' when only lab fallbacks (LCP/CLS from Lighthouse) were available,
   *   'none' when no CWV data at all was present.
   */
  private parse(json: PsiResponse): PsiMetrics {
    const le = json.loadingExperience;
    const fieldMetrics = le?.metrics ?? {};
    const audits = json.lighthouseResult?.audits ?? {};

    // Record whether PSI is reporting origin-level aggregates for this page.
    const isOriginFallback = le?.origin_fallback === true;

    // Field (CrUX) percentiles; absent for low-traffic URLs.
    const fieldLcp = fieldMetrics.LARGEST_CONTENTFUL_PAINT_MS?.percentile;
    const fieldClsRaw = fieldMetrics.CUMULATIVE_LAYOUT_SHIFT_SCORE?.percentile;
    const fieldInp = fieldMetrics.INTERACTION_TO_NEXT_PAINT?.percentile;

    // Lab fallbacks for LCP/CLS (no reliable lab INP exists).
    const labLcp = audits['largest-contentful-paint']?.numericValue;
    const labCls = audits['cumulative-layout-shift']?.numericValue;

    // LCP: prefer field ms, fall back to lab numericValue, else null.
    const lcpMs = roundMs(typeof fieldLcp === 'number' ? fieldLcp : labLcp);

    // CLS: field percentile is CLS×100 (int) → divide by 100; lab is already 0..1.
    const cls =
      typeof fieldClsRaw === 'number' ? roundTo(fieldClsRaw / 100, 3) : roundTo(labCls, 3);

    // INP: field only; no lab fallback.
    const inpMs = roundMs(fieldInp);

    // Determine CWV provenance.
    // 'field' if any of the three field CWV metrics is a real number.
    const hasField =
      typeof fieldLcp === 'number' ||
      typeof fieldClsRaw === 'number' ||
      typeof fieldInp === 'number';
    // 'lab' if no field data but lab LCP or CLS is available.
    const hasLab = !hasField && (labLcp != null || labCls != null);
    const cwvSource: 'field' | 'lab' | 'none' = hasField ? 'field' : hasLab ? 'lab' : 'none';

    const performanceScore = this.score(json, 'performance');

    const fcpMs = roundMs(audits['first-contentful-paint']?.numericValue);
    const tbtMs = roundMs(audits['total-blocking-time']?.numericValue);
    const speedIndexMs = roundMs(audits['speed-index']?.numericValue);

    const usabilityFlags = this.collectUsabilityFlags(json);

    return {
      lcpMs,
      cls,
      inpMs,
      performanceScore,
      fcpMs,
      tbtMs,
      speedIndexMs,
      usabilityFlags,
      cwvSource,
      isOriginFallback,
      raw: json,
    };
  }

  /** `categories[name].score × 100` (0..100), or null when absent. */
  private score(json: PsiResponse, name: string): number | null {
    const raw = json.lighthouseResult?.categories?.[name]?.score;
    return typeof raw === 'number' ? Math.round(raw * 100) : null;
  }

  /**
   * Collect the audit ids of meaningful problems (stable keys, not titles):
   * - performance auditRefs whose audit `score` is non-null and `< 0.9`;
   * - seo auditRefs whose audit `score` is non-null and `< 1`.
   * Deduped + sorted for deterministic output. Missing sections contribute none.
   */
  private collectUsabilityFlags(json: PsiResponse): string[] {
    const audits = json.lighthouseResult?.audits ?? {};
    const flags = new Set<string>();

    const collect = (category: string, threshold: number): void => {
      const refs = json.lighthouseResult?.categories?.[category]?.auditRefs;
      if (!Array.isArray(refs)) return;
      for (const ref of refs) {
        const id = ref?.id;
        if (typeof id !== 'string') continue;
        const score = audits[id]?.score;
        if (typeof score === 'number' && score < threshold) {
          flags.add(id);
        }
      }
    };

    collect('performance', PERF_PROBLEM_SCORE);
    collect('seo', SEO_PROBLEM_SCORE);

    return [...flags].sort();
  }
}
