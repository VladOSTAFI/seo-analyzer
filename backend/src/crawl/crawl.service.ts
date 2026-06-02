import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  CheerioCrawler,
  type CheerioCrawlingContext,
  Configuration,
  type Request as CrawleeRequest,
} from 'crawlee';
import { eq } from 'drizzle-orm';
import { classifyLink, normalizeUrl, resolveUrl } from '../common/url.util';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env.validation';
import { DB, type Database } from '../db/db.types';
import {
  hreflangEntries,
  images,
  links,
  type NewHreflangEntry,
  type NewImage,
  type NewLink,
  type NewPage,
  pages,
} from '../db/schema';
import { AuditRepository } from '../audit/audit.repository';
import { ExtractService } from './extract.service';
import type { CrawlSummary, ExtractInput, ExtractedPage } from './crawl.types';

/** A single redirect hop recorded for a crawled page. */
export interface RedirectHop {
  url: string;
  statusCode: number;
}

/** Per-request transport metadata the crawler observed for one fetched page. */
export interface FetchMeta {
  /** The request URL as it was queued (pre-redirect). */
  url: string;
  /** Final URL after following any redirects. */
  finalUrl: string;
  statusCode: number;
  redirectChain: RedirectHop[];
  contentType: string | null;
  responseTimeMs: number | null;
  contentLengthBytes: number | null;
  depth: number;
  crawlSource: 'sitemap' | 'link' | 'redirect' | 'seed';
  /** Raw response headers, lowercased keys. */
  headers: Record<string, string | string[] | undefined>;
  /** Raw HTML body of the response. */
  html: string;
}

/** Everything one fetched page contributes to the crawl, after extraction. */
interface CollectedPage {
  meta: FetchMeta;
  extracted: ExtractedPage;
}

/** Insert batch size for chunked bulk inserts (§1 of the implementation plan). */
const INSERT_CHUNK_SIZE = 500;

/** Descriptive bot identity sent on every request (politeness, §8). */
export const CRAWL_USER_AGENT = 'SEO-Audit-Bot/0.1 (+crawl)';

/** SPA root containers that hint at client-rendered (JS-only) markup. */
const SPA_ROOT_SELECTORS = ['#app', '#root', '#__next', '[data-reactroot]'];

/**
 * Derive the coarse status class bucket from a numeric HTTP status code.
 * Pure + exported so it can be unit-tested without spinning up Crawlee.
 */
export function deriveStatusClass(statusCode: number): '2xx' | '3xx' | '4xx' | '5xx' | null {
  if (statusCode >= 200 && statusCode < 300) return '2xx';
  if (statusCode >= 300 && statusCode < 400) return '3xx';
  if (statusCode >= 400 && statusCode < 500) return '4xx';
  if (statusCode >= 500 && statusCode < 600) return '5xx';
  return null;
}

/**
 * Heuristic for whether a page looks JS-rendered (near-empty body or a known
 * SPA root container with no meaningful content). Phase 1 only logs this; it is
 * the seam where a Playwright escalation would plug in (see {@link CrawlService}).
 */
export function looksLikeSpaShell(html: string): boolean {
  const body = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<[^>]+>/g, '');
  const visibleText = body.replace(/\s+/g, ' ').trim();
  if (visibleText.length > 200) {
    return false;
  }
  return SPA_ROOT_SELECTORS.some((sel) => {
    if (sel.startsWith('#')) {
      const id = sel.slice(1);
      return new RegExp(`id=["']${id}["']`, 'i').test(html);
    }
    return html.toLowerCase().includes('data-reactroot');
  });
}

/** Read a single header value, collapsing string[] to its first element. */
function headerValue(
  headers: Record<string, string | string[] | undefined>,
  key: string,
): string | null {
  const raw = headers[key.toLowerCase()];
  if (Array.isArray(raw)) return raw[0] ?? null;
  return raw ?? null;
}

/**
 * Map an extracted page + transport metadata into a `pages` insert row.
 * Pure + exported for direct unit testing of the column mapping.
 */
export function toPageRow(auditId: string, collected: CollectedPage): NewPage {
  const { meta, extracted } = collected;
  return {
    auditId,
    url: normalizeUrl(meta.url),
    finalUrl: meta.finalUrl,
    statusCode: meta.statusCode,
    statusClass: deriveStatusClass(meta.statusCode),
    redirectChain: meta.redirectChain,
    contentType: meta.contentType,
    responseTimeMs: meta.responseTimeMs,
    contentLengthBytes: meta.contentLengthBytes,
    depth: meta.depth,
    crawlSource: meta.crawlSource,
    title: extracted.title,
    metaDescription: extracted.metaDescription,
    h1: extracted.h1,
    h2: extracted.h2,
    canonicalUrl: extracted.canonicalUrl,
    isSelfCanonical: extracted.isSelfCanonical,
    metaRobots: extracted.metaRobots,
    xRobotsTag: extracted.xRobotsTag,
    blockedByRobotsTxt: false,
    relNext: extracted.relNext,
    relPrev: extracted.relPrev,
    contentHash: extracted.contentHash,
  };
}

/**
 * Map the outlinks of an extracted page into `links` insert rows. The page they
 * were found on is recorded as `sourceUrl`. Pure + exported for unit testing.
 */
export function toLinkRows(auditId: string, collected: CollectedPage): NewLink[] {
  const sourceUrl = collected.meta.finalUrl;
  return collected.extracted.links.map((link) => ({
    auditId,
    sourceUrl,
    href: link.href,
    anchorText: link.anchorText,
    type: link.type,
    rel: link.rel,
  }));
}

/** Map extracted images into `images` insert rows. Pure + exported. */
export function toImageRows(auditId: string, collected: CollectedPage): NewImage[] {
  const pageUrl = collected.meta.finalUrl;
  return collected.extracted.images.map((img) => ({
    auditId,
    pageUrl,
    src: img.src,
    alt: img.alt,
    title: img.title,
  }));
}

/** Map extracted hreflang alternates into `hreflang_entries` insert rows. Pure + exported. */
export function toHreflangRows(auditId: string, collected: CollectedPage): NewHreflangEntry[] {
  const pageUrl = collected.meta.finalUrl;
  return collected.extracted.hreflang.map((h) => ({
    auditId,
    pageUrl,
    lang: h.lang,
    href: h.href,
  }));
}

/** Split an array into fixed-size chunks for batched inserts. */
function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

/**
 * Phase 1 crawler (§5, §7, §8). Drives a per-run Crawlee `CheerioCrawler` from a
 * seed URL, extracts each page via {@link ExtractService}, and persists pages /
 * links / images / hreflang for one audit.
 *
 * Status semantics: status is set to `crawling` at the start and LEFT at
 * `crawling` on success — `crawling` is the settled "crawled" state until the
 * enrich stage (which owns `enriching`) advances it. On failure we
 * `markFailed(auditId, 'crawl')` and rethrow.
 *
 * Idempotency (§1): a re-run for the same audit must yield the same row set, so
 * before inserting we delete all existing pages/links/images/hreflang rows for
 * the audit and then batch-insert the fresh ones — all inside a single
 * transaction. Because the crawl is async/streaming we collect every extracted
 * row in memory first (bounded by CRAWL_MAX_PAGES) and commit once at the end.
 * Tradeoff: memory scales with the page cap, which is acceptable for Phase 1's
 * bounded crawl; a streaming/upsert approach would be needed for unbounded sites.
 */
@Injectable()
export class CrawlService {
  private readonly logger = new Logger(CrawlService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
    private readonly audits: AuditRepository,
    private readonly extract: ExtractService,
  ) {}

  async crawl(auditId: string): Promise<CrawlSummary> {
    const startedAt = Date.now();
    const audit = await this.audits.assertExists(auditId);
    const startUrl = audit.startUrl;

    await this.audits.setStatus(auditId, 'crawling');
    this.logger.log(`Crawl start audit=${auditId} startUrl=${startUrl}`);

    try {
      const collected = await this.runCrawler(startUrl);
      const summary = await this.persist(auditId, collected);
      const elapsedMs = Date.now() - startedAt;
      this.logger.log(
        `Crawl done audit=${auditId} pages=${summary.pages} links=${summary.links} ` +
          `images=${summary.images} hreflang=${summary.hreflang} durationMs=${elapsedMs}`,
      );
      // Status stays at `crawling` on success — enrich owns the next transition.
      return summary;
    } catch (err) {
      await this.audits.markFailed(auditId, 'crawl');
      const reason = err instanceof Error ? err.message : String(err);
      this.logger.error(`Crawl failed audit=${auditId} stage=crawl: ${reason}`);
      throw err;
    }
  }

  /**
   * Run a fresh `CheerioCrawler` for one audit and return every successfully
   * fetched + extracted page. A new crawler + in-memory Configuration is built
   * per run so no mutable state (queues, dedup sets) leaks across audits.
   */
  private async runCrawler(startUrl: string): Promise<CollectedPage[]> {
    const collected: CollectedPage[] = [];
    const seen = new Set<string>();
    // Depth bookkeeping keyed by normalized URL; the seed is depth 0.
    const depthByUrl = new Map<string, number>();
    const seedNorm = normalizeUrl(startUrl);
    depthByUrl.set(seedNorm, 0);

    const logger = this.logger;

    // Per-run, in-memory storage: no filesystem persistence, no shared state.
    const config = new Configuration({ persistStorage: false });

    const crawler = new CheerioCrawler(
      {
        maxRequestsPerCrawl: this.env.CRAWL_MAX_PAGES,
        maxConcurrency: this.env.CRAWL_CONCURRENCY,
        // CRAWL_RATE_LIMIT is requests/second; Crawlee throttles per minute.
        maxRequestsPerMinute: Math.max(1, Math.round(this.env.CRAWL_RATE_LIMIT * 60)),
        // Politeness: honor robots.txt. Disallowed URLs are skipped (not fetched),
        // so we never record a body for them; see the skip note below.
        respectRobotsTxtFile: true,
        // Record 4xx/5xx as pages instead of treating them as crawl errors.
        ignoreHttpErrorStatusCodes: [
          400, 401, 402, 403, 404, 405, 406, 407, 408, 409, 410, 411, 412, 413, 414, 415, 416, 417,
          418, 421, 422, 423, 424, 425, 426, 428, 429, 431, 451, 500, 501, 502, 503, 504, 505, 506,
          507, 508, 510, 511,
        ],
        // Crawlee default retry/backoff is sensible; keep it explicit.
        maxRequestRetries: 2,
        additionalMimeTypes: ['text/html', 'application/xhtml+xml'],
        preNavigationHooks: [
          (_ctx, gotOptions): void => {
            gotOptions.headers = { ...gotOptions.headers, 'User-Agent': CRAWL_USER_AGENT };
          },
        ],
        requestHandler: async (ctx: CheerioCrawlingContext): Promise<void> => {
          await this.handleRequest(ctx, { startUrl, seedNorm, seen, depthByUrl, collected });
        },
        failedRequestHandler: ({ request }, error): void => {
          logger.warn(`Request failed url=${request.url}: ${error.message}`);
        },
      },
      config,
    );

    // Seed: the start URL (crawlSource='seed') plus, best-effort, the sitemap
    // (crawlSource='sitemap'). enqueueLinks during the crawl tags discovered
    // URLs as 'link'. We pass crawlSource via userData on each seed request.
    const sources: { url: string; userData: { crawlSource: string; depth: number } }[] = [
      { url: startUrl, userData: { crawlSource: 'seed', depth: 0 } },
    ];
    const sitemapUrl = resolveUrl(startUrl, '/sitemap.xml');
    if (sitemapUrl && sitemapUrl !== seedNorm) {
      sources.push({ url: sitemapUrl, userData: { crawlSource: 'sitemap', depth: 0 } });
      depthByUrl.set(normalizeUrl(sitemapUrl), 0);
    }

    await crawler.run(sources);
    return collected;
  }

  /**
   * Per-request handler: builds the {@link ExtractInput}, calls the extractor,
   * records the page, and enqueues internal links discovered by the extractor.
   * External links are recorded (as rows, later) but never enqueued.
   */
  private async handleRequest(
    ctx: CheerioCrawlingContext,
    state: {
      startUrl: string;
      seedNorm: string;
      seen: Set<string>;
      depthByUrl: Map<string, number>;
      collected: CollectedPage[];
    },
  ): Promise<void> {
    const { request, response, body } = ctx;
    const requestUrl = request.url;
    const requestNorm = normalizeUrl(requestUrl);

    // Dedup defensively (Crawlee also dedups via the queue).
    if (state.seen.has(requestNorm)) {
      return;
    }
    state.seen.add(requestNorm);

    const finalUrl = request.loadedUrl ? normalizeUrl(request.loadedUrl) : requestNorm;
    const statusCode = response.statusCode ?? 0;
    const html = typeof body === 'string' ? body : body.toString('utf8');
    const headers = response.headers as Record<string, string | string[] | undefined>;

    const userData = request.userData as { crawlSource?: string; depth?: number } | undefined;
    const crawlSource = this.normalizeCrawlSource(userData?.crawlSource);
    const depth = state.depthByUrl.get(requestNorm) ?? userData?.depth ?? 0;

    // Redirect chain: derive hops from Crawlee's tracked redirect URLs when the
    // loaded URL differs from the requested one. We don't have per-hop status
    // codes from CheerioCrawler, so intermediate hops are recorded as 301.
    const redirectChain = this.buildRedirectChain(request, statusCode);

    const contentType = headerValue(headers, 'content-type');
    const contentLengthHeader = headerValue(headers, 'content-length');
    const contentLengthBytes =
      contentLengthHeader !== null && /^\d+$/.test(contentLengthHeader)
        ? Number(contentLengthHeader)
        : Buffer.byteLength(html, 'utf8');

    // Playwright fallback SEAM (Phase 1: detect + log only; no browser launch).
    if (looksLikeSpaShell(html)) {
      this.logger.debug(`would escalate to Playwright (SPA shell) url=${finalUrl}`);
    }

    const meta: FetchMeta = {
      url: requestUrl,
      finalUrl,
      statusCode,
      redirectChain,
      contentType,
      // CheerioCrawler does not surface a per-request timing; left null (best-effort).
      responseTimeMs: null,
      contentLengthBytes,
      depth,
      crawlSource,
      headers,
      html,
    };

    const input: ExtractInput = { url: requestUrl, finalUrl, html, statusCode, headers };
    const extracted = this.extract.extract(input);
    state.collected.push({ meta, extracted });

    // Enqueue only internal links discovered by the extractor; record (but do
    // not crawl) external ones — they become `links` rows via toLinkRows.
    const childDepth = depth + 1;
    for (const link of extracted.links) {
      if (classifyLink(state.startUrl, link.href) !== 'internal') {
        continue;
      }
      const linkNorm = normalizeUrl(link.href);
      if (state.seen.has(linkNorm) || state.depthByUrl.has(linkNorm)) {
        continue;
      }
      state.depthByUrl.set(linkNorm, childDepth);
      await ctx.addRequests([
        { url: link.href, userData: { crawlSource: 'link', depth: childDepth } },
      ]);
    }
  }

  /** Coerce arbitrary userData into the crawlSource enum, defaulting to 'link'. */
  private normalizeCrawlSource(value: unknown): FetchMeta['crawlSource'] {
    if (value === 'sitemap' || value === 'link' || value === 'redirect' || value === 'seed') {
      return value;
    }
    return 'link';
  }

  /**
   * Best-effort redirect chain. Crawlee tracks the list of URLs visited during
   * redirects on the request; when the loaded URL differs from the requested
   * one we record each intermediate hop. Per-hop status codes are not exposed by
   * CheerioCrawler, so intermediate hops use 301 and the final hop the real code.
   */
  private buildRedirectChain(request: CrawleeRequest, finalStatus: number): RedirectHop[] {
    const loaded = request.loadedUrl;
    if (!loaded || normalizeUrl(loaded) === normalizeUrl(request.url)) {
      return [];
    }
    return [
      { url: normalizeUrl(request.url), statusCode: 301 },
      { url: normalizeUrl(loaded), statusCode: finalStatus },
    ];
  }

  /**
   * Idempotent persistence (§1): inside one transaction, delete every existing
   * row for this audit then batch-insert the freshly collected rows. Dedup pages
   * on the normalized URL to respect the `(audit_id, url)` unique index.
   */
  private async persist(auditId: string, collected: CollectedPage[]): Promise<CrawlSummary> {
    // Dedup pages by normalized URL (unique index pages_audit_url_idx).
    const pageByUrl = new Map<string, CollectedPage>();
    for (const c of collected) {
      const key = normalizeUrl(c.meta.url);
      if (!pageByUrl.has(key)) {
        pageByUrl.set(key, c);
      }
    }
    const deduped = [...pageByUrl.values()];

    const pageRows = deduped.map((c) => toPageRow(auditId, c));
    const linkRows = deduped.flatMap((c) => toLinkRows(auditId, c));
    const imageRows = deduped.flatMap((c) => toImageRows(auditId, c));
    const hreflangRows = deduped.flatMap((c) => toHreflangRows(auditId, c));

    await this.db.transaction(async (tx) => {
      await tx.delete(pages).where(eq(pages.auditId, auditId));
      await tx.delete(links).where(eq(links.auditId, auditId));
      await tx.delete(images).where(eq(images.auditId, auditId));
      await tx.delete(hreflangEntries).where(eq(hreflangEntries.auditId, auditId));

      for (const part of chunk(pageRows, INSERT_CHUNK_SIZE)) {
        if (part.length) await tx.insert(pages).values(part);
      }
      for (const part of chunk(linkRows, INSERT_CHUNK_SIZE)) {
        if (part.length) await tx.insert(links).values(part);
      }
      for (const part of chunk(imageRows, INSERT_CHUNK_SIZE)) {
        if (part.length) await tx.insert(images).values(part);
      }
      for (const part of chunk(hreflangRows, INSERT_CHUNK_SIZE)) {
        if (part.length) await tx.insert(hreflangEntries).values(part);
      }
    });

    return {
      pages: pageRows.length,
      links: linkRows.length,
      images: imageRows.length,
      hreflang: hreflangRows.length,
    };
  }
}
