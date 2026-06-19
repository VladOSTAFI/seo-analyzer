import { gunzipSync } from 'node:zlib';
import { Inject, Injectable, Logger } from '@nestjs/common';
import * as sax from 'sax';
import { normalizeUrl } from '../common/url.util';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env.validation';
import type { SitemapAudit } from '../db/schema/audits';
import { CRAWL_USER_AGENT } from './crawl.service';

/** One `<url>` entry collected from a `<urlset>`. */
export interface SitemapUrlEntry {
  loc: string;
  lastmod: string | null;
  changefreq: string | null;
  priority: string | null;
}

/** Result of parsing a single sitemap file (urlset OR sitemapindex). */
export interface ParsedSitemap {
  /** `'urlset'` lists pages; `'sitemapindex'` lists child sitemaps; `'unknown'` = malformed/empty. */
  kind: 'urlset' | 'sitemapindex' | 'unknown';
  /** Collected `<url>` entries (for a urlset). */
  urls: SitemapUrlEntry[];
  /** Child sitemap `<loc>` URLs (for a sitemapindex). */
  childSitemaps: string[];
  /** Whether the file parsed as well-formed XML and is a recognized sitemap. */
  valid: boolean;
  /** Parse/limit errors (e.g. 'malformed-xml', 'limit-exceeded:urls', 'limit-exceeded:bytes'). */
  errors: string[];
  /** Uncompressed byte length seen. */
  bytes: number;
}

/** Caps passed into the pure parser (so unit tests can use tiny limits). */
export interface SitemapParseLimits {
  maxUrls: number;
  maxBytes: number;
}

/** A flattened entry ready for insertion, tagged with the file that listed it. */
export interface CollectedSitemapEntry extends SitemapUrlEntry {
  sourceSitemap: string;
}

/** Full discovery result handed back to the crawl orchestrator. */
export interface SitemapResult {
  audit: SitemapAudit;
  entries: CollectedSitemapEntry[];
}

const MAX_DEPTH = 2; // index → child; reject index-of-index loops.

/**
 * XML sitemap validation + crawl diff (feature 03). Best-effort, once-per-audit
 * discovery sub-step run AFTER the crawl (so the diff has `pages`) and AFTER
 * robots.txt parsing (so we use the declared `Sitemap:` URLs). Order-independent
 * and non-fatal — every network/parse failure is caught and recorded, never
 * breaks the pipeline (mirrors the LinkVerifierService best-effort contract).
 *
 * Parses both `<urlset>` and `<sitemapindex>` with a STREAMING parser so the
 * per-file URL/byte caps are enforced without buffering a 50MB DOM. The pure
 * {@link parseSitemapXml} is exported for unit testing with string fixtures.
 */
@Injectable()
export class SitemapService {
  private readonly logger = new Logger(SitemapService.name);

  constructor(@Inject(ENV) private readonly env: Env) {}

  /**
   * Discover + parse the site's sitemaps. `seedUrls` are the robots.txt
   * `Sitemap:` directives (feature 02); when empty we fall back to
   * `${origin}/sitemap.xml`. Recurses into sitemap-index files (depth ≤ 2,
   * cycle-guarded, capped by `SITEMAP_MAX_FILES`). Always resolves; never throws.
   */
  async discover(origin: string, seedUrls: string[]): Promise<SitemapResult> {
    const limits: SitemapParseLimits = {
      maxUrls: this.env.SITEMAP_MAX_URLS,
      maxBytes: this.env.SITEMAP_MAX_BYTES,
    };
    const files: SitemapAudit['files'] = [];
    const entriesByLoc = new Map<string, CollectedSitemapEntry>();
    const visited = new Set<string>();

    const seeds = seedUrls.length > 0 ? seedUrls : [this.fallbackUrl(origin)];

    // BFS over sitemap files, depth-bounded and capped by SITEMAP_MAX_FILES.
    const queue: { url: string; depth: number }[] = seeds.map((url) => ({ url, depth: 0 }));

    while (queue.length > 0) {
      if (files.length >= this.env.SITEMAP_MAX_FILES) {
        this.logger.warn(
          `Sitemap file cap reached (SITEMAP_MAX_FILES=${this.env.SITEMAP_MAX_FILES}); ` +
            `${queue.length} sitemap(s) left unprocessed.`,
        );
        break;
      }
      const next = queue.shift()!;
      const norm = this.safeNormalize(next.url);
      if (visited.has(norm)) continue; // cycle guard
      visited.add(norm);

      const parsed = await this.fetchAndParse(next.url, limits);
      files.push({
        url: next.url,
        valid: parsed.valid,
        urlCount: parsed.urls.length,
        bytes: parsed.bytes,
        errors: parsed.errors,
      });

      for (const entry of parsed.urls) {
        const locNorm = this.safeNormalize(entry.loc);
        if (!entriesByLoc.has(locNorm)) {
          entriesByLoc.set(locNorm, { ...entry, loc: locNorm, sourceSitemap: next.url });
        }
      }

      if (parsed.kind === 'sitemapindex' && next.depth < MAX_DEPTH - 1) {
        for (const child of parsed.childSitemaps) {
          const childNorm = this.safeNormalize(child);
          if (!visited.has(childNorm)) {
            queue.push({ url: child, depth: next.depth + 1 });
          }
        }
      }
    }

    const entries = [...entriesByLoc.values()];
    return {
      audit: { files, totalUrls: entries.length },
      entries,
    };
  }

  /** `${origin}/sitemap.xml` fallback when robots.txt declares no Sitemap:. */
  private fallbackUrl(origin: string): string {
    const u = new URL(origin);
    return `${u.protocol}//${u.host}/sitemap.xml`;
  }

  private safeNormalize(url: string): string {
    try {
      return normalizeUrl(url);
    } catch {
      return url.trim();
    }
  }

  /**
   * Fetch one sitemap file (gzip-aware) and parse it. Network/decompression
   * failures are recorded as an invalid file; never throws.
   */
  async fetchAndParse(url: string, limits: SitemapParseLimits): Promise<ParsedSitemap> {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': CRAWL_USER_AGENT },
        redirect: 'follow',
        signal: AbortSignal.timeout(this.env.SITEMAP_FETCH_TIMEOUT_MS),
      });
      if (res.status < 200 || res.status >= 300) {
        return invalid(`fetch-status:${res.status}`);
      }

      const raw = Buffer.from(await res.arrayBuffer());
      // Early byte-cap on the COMPRESSED body so a hostile gzip bomb can't be
      // buffered; the uncompressed cap is enforced again during parse.
      if (raw.byteLength > limits.maxBytes) {
        return invalid('limit-exceeded:bytes', raw.byteLength);
      }

      const isGzip =
        url.toLowerCase().endsWith('.gz') ||
        (res.headers.get('content-type') ?? '').includes('gzip') ||
        (raw.length >= 2 && raw[0] === 0x1f && raw[1] === 0x8b);

      let body: string;
      if (isGzip) {
        try {
          body = gunzipSync(raw).toString('utf8');
        } catch {
          return invalid('gzip-decode-failed', raw.byteLength);
        }
      } else {
        body = raw.toString('utf8');
      }

      return parseSitemapXml(body, limits);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Sitemap fetch failed (recorded as invalid) url=${url}: ${reason}`);
      return invalid('fetch-failed');
    }
  }
}

/** Build an `invalid` ParsedSitemap with a single error reason. */
function invalid(reason: string, bytes = 0): ParsedSitemap {
  return { kind: 'unknown', urls: [], childSitemaps: [], valid: false, errors: [reason], bytes };
}

/**
 * PURE streaming sitemap parser. Walks the XML with `sax` (no DOM), enforcing
 * the URL and byte caps WHILE parsing so an oversized file stops early and is
 * flagged `limit-exceeded` rather than buffered. Handles both `<urlset>` (page
 * list) and `<sitemapindex>` (child-sitemap list). Malformed XML → invalid with
 * `malformed-xml`, parsing stops, but whatever parsed before the error is kept.
 *
 * Exported + dependency-free (string in, result out) for unit testing.
 */
export function parseSitemapXml(xml: string, limits: SitemapParseLimits): ParsedSitemap {
  const bytes = Buffer.byteLength(xml, 'utf8');
  const urls: SitemapUrlEntry[] = [];
  const childSitemaps: string[] = [];
  const errors: string[] = [];
  let kind: ParsedSitemap['kind'] = 'unknown';

  if (bytes > limits.maxBytes) {
    return invalid('limit-exceeded:bytes', bytes);
  }

  const parser = sax.parser(/* strict */ true, { lowercase: true, trim: true });

  let limitHit = false;
  let inUrl = false;
  let inSitemapEntry = false; // a <sitemap> child of <sitemapindex>
  let current: SitemapUrlEntry | null = null;
  let childLoc = '';
  let textTarget: string | null = null; // which leaf element the text belongs to
  let text = '';

  parser.onopentag = (node): void => {
    const name = node.name;
    switch (name) {
      case 'urlset':
        if (kind === 'unknown') kind = 'urlset';
        break;
      case 'sitemapindex':
        if (kind === 'unknown') kind = 'sitemapindex';
        break;
      case 'url':
        inUrl = true;
        current = { loc: '', lastmod: null, changefreq: null, priority: null };
        break;
      case 'sitemap':
        inSitemapEntry = true;
        childLoc = '';
        break;
      case 'loc':
      case 'lastmod':
      case 'changefreq':
      case 'priority':
        textTarget = name;
        text = '';
        break;
      default:
        textTarget = null;
        break;
    }
  };

  parser.ontext = (t): void => {
    if (textTarget) text += t;
  };
  parser.oncdata = (t): void => {
    if (textTarget) text += t;
  };

  parser.onclosetag = (name): void => {
    if (limitHit) return;
    if (textTarget === name) {
      const value = text.trim();
      if (inUrl && current) {
        if (name === 'loc') current.loc = value;
        else if (name === 'lastmod') current.lastmod = value || null;
        else if (name === 'changefreq') current.changefreq = value || null;
        else if (name === 'priority') current.priority = value || null;
      } else if (inSitemapEntry && name === 'loc') {
        childLoc = value;
      }
      textTarget = null;
      text = '';
    }

    if (name === 'url' && current) {
      if (current.loc) {
        urls.push(current);
        if (urls.length >= limits.maxUrls) {
          limitHit = true;
          errors.push('limit-exceeded:urls');
        }
      }
      inUrl = false;
      current = null;
    } else if (name === 'sitemap') {
      if (childLoc) childSitemaps.push(childLoc);
      inSitemapEntry = false;
      childLoc = '';
    }
  };

  let malformed = false;
  parser.onerror = (): void => {
    malformed = true;
  };

  try {
    parser.write(xml).close();
  } catch {
    malformed = true;
  }

  if (malformed) {
    errors.push('malformed-xml');
    return { kind, urls, childSitemaps, valid: false, errors, bytes };
  }

  if (kind === 'unknown') {
    errors.push('not-a-sitemap');
  }

  // Valid = recognized root, well-formed, and within caps (limit-exceeded:urls
  // marks the file invalid so `sitemap.invalid` fires).
  const valid = kind !== 'unknown' && errors.length === 0;
  return { kind, urls, childSitemaps, valid, errors, bytes };
}
