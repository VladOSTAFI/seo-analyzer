import { Inject, Injectable, Logger } from '@nestjs/common';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env.validation';
import type { RobotsAudit } from '../db/schema/audits';
import { CRAWL_USER_AGENT } from './crawl.service';

/**
 * A single `User-agent:` group with its directives. `Sitemap:` lines are global
 * (not per-agent) and are collected separately on the parse result.
 */
export interface RobotsGroup {
  userAgent: string;
  disallow: string[];
  allow: string[];
}

/** Pure parse result (no analysis yet). */
export interface ParsedRobots {
  groups: RobotsGroup[];
  sitemapUrls: string[];
}

/** Cap on bytes read from robots.txt (oversized/gzipped files are truncated). */
const MAX_ROBOTS_BYTES = 512 * 1024; // 500KB

/** Asset path markers whose disallow is render-blocking for Google. */
const ASSET_EXTENSIONS = ['.css', '.js', '.mjs'];
const ASSET_DIR_HINTS = ['/css', '/js', '/javascript', '/assets', '/static', '/_next/static'];

/** User-agents whose whole-site disallow is critical (the ones Google obeys). */
const CRITICAL_AGENTS = ['*', 'googlebot'];

/**
 * Path markers for conventionally-blocked, non-content disallows (admin, auth,
 * search, feeds, trackbacks, comment-reply links, caches, infra). Disallowing
 * these is CORRECT SEO hygiene — they must never be reported as "important
 * section blocked", even if the crawler happened to follow one. Matched as a
 * case-insensitive substring of the disallow value.
 */
const BENIGN_DISALLOW_MARKERS = [
  'wp-admin',
  'wp-login',
  'wp-register',
  'wp-comments',
  'wp-trackback',
  'wp-feed',
  'wp-json',
  'xmlrpc',
  'cgi-bin',
  'trackback',
  '/embed',
  '/feed',
  'comments/feed',
  '/cache',
  '/search',
  'replytocom',
  '/admin',
  '/login',
  '/cart',
  '/checkout',
  '/account',
];

/**
 * Is this disallow a conventionally-blocked, non-content path (so it should NOT
 * count as an "important section" block)? Any query-parameter filter (e.g.
 * `*?s=`, `*utm*=`, `/*?replytocom*`) is benign by definition — it targets URL
 * params, not crawlable content paths — as is any path matching a known
 * hygiene/infra marker.
 */
function isBenignDisallow(path: string): boolean {
  const lower = path.toLowerCase();
  if (lower.includes('?') || lower.includes('=')) return true;
  return BENIGN_DISALLOW_MARKERS.some((marker) => lower.includes(marker));
}

/**
 * robots.txt audit (feature 02). Best-effort, once-per-audit discovery sub-step:
 * fetches `${origin}/robots.txt`, parses the user-agent groups + `Sitemap:`
 * directives, and runs "important section" analysis against the crawled
 * `pages.url` paths. Never throws — a network failure is recorded as an issue,
 * never breaks the crawl (mirrors the LinkVerifierService best-effort contract).
 *
 * The parse + analysis helpers are PURE and exported so they can be unit-tested
 * with string fixtures, no network and no DB.
 */
@Injectable()
export class RobotsService {
  private readonly logger = new Logger(RobotsService.name);

  constructor(@Inject(ENV) private readonly env: Env) {}

  /**
   * Fetch + parse + analyze robots.txt for one site. `crawledPaths` are the
   * normalized path components of the crawled `pages.url` (so disallow prefixes
   * can be intersected with real pages to escalate severity). Always resolves to
   * a {@link RobotsAudit} snapshot; never throws.
   */
  async fetchAndParse(origin: string, crawledPaths: string[]): Promise<RobotsAudit> {
    const url = this.robotsUrl(origin);
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': CRAWL_USER_AGENT },
        redirect: 'follow',
        signal: AbortSignal.timeout(this.env.ROBOTS_FETCH_TIMEOUT_MS),
      });
      const statusCode = res.status;

      // 404 (or any 4xx) = absent but reachable — a legitimate permissive state.
      if (statusCode >= 400 && statusCode < 500) {
        return {
          present: false,
          reachable: true,
          statusCode,
          sitemapUrls: [],
          groups: [],
          issues: [
            {
              kind: 'no-sitemap-directive',
              detail: 'No robots.txt present, so no Sitemap: directive is declared.',
              severity: 'info',
            },
          ],
        };
      }

      // 5xx / unexpected = unreachable. Google treats a 5xx robots.txt as
      // "disallow everything", so that is itself a high-severity finding.
      if (statusCode >= 500 || statusCode < 200) {
        return this.unreachable(statusCode);
      }

      const body = await this.readCapped(res);
      const parsed = parseRobotsTxt(body);
      return analyzeRobots(parsed, {
        present: true,
        reachable: true,
        statusCode,
        crawledPaths,
        importantPaths: this.importantPaths(),
      });
    } catch (err) {
      // Network error / timeout / abort → unreachable, logged, never thrown.
      const reason = err instanceof Error ? err.message : String(err);
      this.logger.warn(`robots.txt fetch failed (treated as unreachable) url=${url}: ${reason}`);
      return this.unreachable(null);
    }
  }

  /** `${origin}/robots.txt` — origin only, no path/query from the seed. */
  private robotsUrl(origin: string): string {
    const u = new URL(origin);
    return `${u.protocol}//${u.host}/robots.txt`;
  }

  /** Extra "important" path prefixes from config (comma-separated). */
  private importantPaths(): string[] {
    return this.env.ROBOTS_IMPORTANT_PATHS.split(',')
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
  }

  private unreachable(statusCode: number | null): RobotsAudit {
    return {
      present: false,
      reachable: false,
      statusCode,
      sitemapUrls: [],
      groups: [],
      issues: [
        {
          kind: 'unreachable',
          detail:
            'robots.txt is unreachable (5xx/timeout). Google treats this as "disallow everything", ' +
            'which can de-index the whole site.',
          severity: 'high',
        },
      ],
    };
  }

  /** Read the response body, capped at {@link MAX_ROBOTS_BYTES}. */
  private async readCapped(res: Response): Promise<string> {
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.subarray(0, MAX_ROBOTS_BYTES).toString('utf8');
  }
}

/**
 * Pure robots.txt parser. Tolerant of comments (`#`), blank lines, BOM, CRLF,
 * and malformed lines (unknown directives are ignored). `User-agent:` opens a
 * group; consecutive `User-agent:` lines (no directive between them) merge into
 * one group sharing the following directives. `Sitemap:` lines are global.
 *
 * Never throws — malformed input degrades to whatever groups/directives parsed.
 */
export function parseRobotsTxt(raw: string): ParsedRobots {
  const text = raw.replace(/^﻿/, ''); // strip BOM
  const groups: RobotsGroup[] = [];
  const sitemapUrls: string[] = [];

  let current: RobotsGroup[] = []; // agents sharing the directive block being built
  let sawDirective = false;

  const startGroupFor = (agent: string): void => {
    // A User-agent line AFTER directives starts a fresh group block.
    if (sawDirective) {
      current = [];
      sawDirective = false;
    }
    const g: RobotsGroup = { userAgent: agent, disallow: [], allow: [] };
    groups.push(g);
    current.push(g);
  };

  for (const line of text.split(/\r\n|\r|\n/)) {
    const noComment = line.split('#')[0] ?? '';
    const trimmed = noComment.trim();
    if (trimmed === '') continue;

    const colon = trimmed.indexOf(':');
    if (colon === -1) continue; // malformed line — ignore
    const field = trimmed.slice(0, colon).trim().toLowerCase();
    const value = trimmed.slice(colon + 1).trim();

    switch (field) {
      case 'user-agent':
        startGroupFor(value.toLowerCase());
        break;
      case 'disallow':
        sawDirective = true;
        for (const g of current) g.disallow.push(value);
        break;
      case 'allow':
        sawDirective = true;
        for (const g of current) g.allow.push(value);
        break;
      case 'sitemap':
        if (value) sitemapUrls.push(value);
        break;
      default:
        // crawl-delay, host, and unknown directives are ignored.
        break;
    }
  }

  return { groups, sitemapUrls: dedupe(sitemapUrls) };
}

/** Context for the "important section" analysis. */
interface AnalyzeContext {
  present: boolean;
  reachable: boolean;
  statusCode: number | null;
  /** Normalized URL paths (e.g. `/private/x`) of the crawled pages. */
  crawledPaths: string[];
  /** Extra important path prefixes whose disallow escalates to high. */
  importantPaths: string[];
}

/**
 * Pure analysis: turn a {@link ParsedRobots} into a {@link RobotsAudit} with the
 * calibrated `issues[]` the `robots.blocks-important` rule reads. Severity
 * scales: whole-site disallow for `*`/Googlebot → critical; disallow prefixes
 * that hit crawled pages → high; asset disallows → medium; missing Sitemap: →
 * info. Never throws.
 */
export function analyzeRobots(parsed: ParsedRobots, ctx: AnalyzeContext): RobotsAudit {
  const issues: RobotsAudit['issues'] = [];

  for (const group of parsed.groups) {
    const agent = group.userAgent;
    const isCritical = CRITICAL_AGENTS.includes(agent);

    for (const rule of group.disallow) {
      const path = rule.trim();
      if (path === '') continue; // `Disallow:` (empty) = allow-all, not a block.

      // Whole-site block.
      if (path === '/') {
        issues.push({
          kind: 'disallow-all',
          detail: `User-agent "${agent}" is blocked from the entire site (Disallow: /).`,
          severity: isCritical ? 'critical' : 'high',
        });
        continue;
      }

      // Asset (CSS/JS) block — render-blocking for Google.
      if (looksLikeAssetPath(path)) {
        issues.push({
          kind: 'disallow-assets',
          detail: `User-agent "${agent}" disallows asset path "${path}" (render-blocking for Google).`,
          severity: 'medium',
        });
        continue;
      }

      // Conventionally-blocked hygiene/infra paths (admin, auth, search, feeds,
      // trackbacks, param filters) are CORRECT to disallow — never flag them.
      if (isBenignDisallow(path)) continue;

      // Important-section block: the disallow pattern hits a crawled content
      // page, or matches an explicitly-configured important path prefix. A bare
      // '/' configured prefix is ignored (it would match the whole site).
      const hits = ctx.crawledPaths.filter((p) => pathMatchesPattern(p, path));
      const isConfiguredImportant = ctx.importantPaths.some(
        (imp) => imp !== '' && imp !== '/' && path.startsWith(imp),
      );
      if (hits.length > 0 || isConfiguredImportant) {
        issues.push({
          kind: 'disallow-important',
          detail:
            `User-agent "${agent}" disallows "${path}"` +
            (hits.length > 0 ? `, which blocks ${hits.length} crawled page(s).` : '.'),
          severity: 'high',
        });
      }
    }
  }

  if (parsed.sitemapUrls.length === 0) {
    issues.push({
      kind: 'no-sitemap-directive',
      detail: 'robots.txt declares no Sitemap: directive, which slows discovery.',
      severity: 'info',
    });
  }

  return {
    present: ctx.present,
    reachable: ctx.reachable,
    statusCode: ctx.statusCode,
    sitemapUrls: parsed.sitemapUrls,
    groups: parsed.groups,
    issues,
  };
}

/** Does a robots disallow prefix look like a CSS/JS asset path? */
function looksLikeAssetPath(path: string): boolean {
  const lower = path.toLowerCase();
  if (ASSET_EXTENSIONS.some((ext) => lower.includes(ext))) return true;
  return ASSET_DIR_HINTS.some((dir) => lower.startsWith(dir));
}

/**
 * robots.txt path match against a crawled URL path. A disallow value is anchored
 * at the start of the path (prefix match), the `*` wildcard matches any run of
 * characters, and a trailing `$` anchors the end. Built as a regex so a pattern
 * that merely starts with a wildcard (e.g. a leading-star "/feed" rule) matches
 * the literal segment around the wildcard — NOT every path. Pure + conservative;
 * never throws.
 *
 * Note: crawled paths are path-only (no query string), so query-parameter
 * patterns (a "?s=" filter) never match here — those are handled as benign upstream.
 */
function pathMatchesPattern(path: string, disallow: string): boolean {
  const anchored = disallow.endsWith('$');
  const raw = anchored ? disallow.slice(0, -1) : disallow;
  if (raw === '') return false; // empty pattern blocks nothing meaningful
  const escaped = raw.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  try {
    return new RegExp('^' + escaped + (anchored ? '$' : '')).test(path);
  } catch {
    return false;
  }
}

function dedupe(items: string[]): string[] {
  return [...new Set(items)];
}
