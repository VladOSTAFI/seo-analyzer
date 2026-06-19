import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import * as cheerio from 'cheerio';
import type { CheerioAPI } from 'cheerio';
import type { AnyNode } from 'domhandler';
import { classifyLink, normalizeUrl, resolveUrl } from '../common/url.util';
import { estimatePixelWidth } from '../analyze/pixel-width.util';
import { validateStructuredData } from './structured-data.validator';
import { computeSimhash } from './simhash.util';
import type {
  ExtractInput,
  ExtractedHeading,
  ExtractedHreflang,
  ExtractedImage,
  ExtractedLink,
  ExtractedPage,
  ExtractedResource,
  ExtractedStructuredData,
  OgData,
  SecuritySignals,
} from './crawl.types';

/**
 * Bound JSON-LD parsing per page (pages can embed many huge blocks). Read from
 * the environment at module-load with safe defaults so the extractor stays a
 * pure function of its input + a couple of static knobs (mirrors how the rule
 * registry / score read their env directly).
 */
const SCHEMA_MAX_BLOCKS_PER_PAGE = readIntEnv('SCHEMA_MAX_BLOCKS_PER_PAGE', 50);
const SCHEMA_RAW_MAX_BYTES = readIntEnv('SCHEMA_RAW_MAX_BYTES', 8192);

/**
 * Inline-font heuristic threshold (feature 11 `mobile.usability`): an inline
 * `font-size` below this many px reads as illegibly small on mobile.
 */
const MOBILE_MIN_FONT_PX = 12;
/** Fixed-pixel width above this on a top-level container hints at overflow. */
const MOBILE_MAX_FIXED_WIDTH_PX = 600;

function readIntEnv(name: string, def: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return def;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : def;
}

/**
 * Parses a single fetched HTTP response (Cheerio) into the structured
 * {@link ExtractedPage} contract consumed by the crawl service.
 *
 * Pure and deterministic: no network, no DB. Same input always yields the same
 * output. Robust to malformed / empty HTML — returns empty arrays / nulls
 * rather than throwing on normal-but-empty input.
 */
@Injectable()
export class ExtractService {
  extract(input: ExtractInput): ExtractedPage {
    const $ = cheerio.load(input.html);

    // Resolve relative URLs against the final (post-redirect) URL; fall back to
    // the queued URL when finalUrl is empty.
    const base = input.finalUrl?.trim() ? input.finalUrl : input.url;

    const title = this.collectText($, 'title');
    const metaDescription = this.collectMetaDescription($);
    const h1 = this.collectText($, 'h1', true);
    const h2 = this.collectText($, 'h2', true);

    const canonicalUrl = this.firstResolvedLinkHref($, 'canonical', base);
    const isSelfCanonical = this.computeSelfCanonical(canonicalUrl, base);

    // Build the normalized body text ONCE; the hash, word count and SimHash all
    // derive from it (the hash output is byte-for-byte unchanged vs. the prior
    // computeContentHash, guarded by the stability test).
    const body = this.computeNormalizedBody($);
    const wordCount = body.text ? body.text.split(/\s+/).filter(Boolean).length : 0;

    const viewportContent = this.viewportContent($);

    return {
      title,
      metaDescription,
      h1,
      h2,
      canonicalUrl,
      isSelfCanonical,
      metaRobots: this.metaContent($, 'robots'),
      xRobotsTag: this.headerValue(input.headers, 'x-robots-tag'),
      relNext: this.firstResolvedLinkHref($, 'next', base),
      relPrev: this.firstResolvedLinkHref($, 'prev', base),
      contentHash: body.hash,
      links: this.collectLinks($, base),
      images: this.collectImages($, base),
      resources: this.collectResources($, base),
      hreflang: this.collectHreflang($, base),
      structuredData: this.collectStructuredData($),
      ogData: this.collectOgData($, base),

      // Feature 08 content semantics.
      wordCount,
      htmlBytes: Buffer.byteLength(input.html ?? '', 'utf8'),
      htmlLang: this.htmlLang($),
      charset: this.charset($),
      hasViewport: viewportContent !== null,
      headingsOutline: this.collectHeadingsOutline($),
      contentSimhash: body.text ? computeSimhash(body.text) : null,
      titlePx: title.length > 0 ? estimatePixelWidth(title[0]!) : null,
      descPx: metaDescription.length > 0 ? estimatePixelWidth(metaDescription[0]!) : null,

      // Feature 11 security + mobile usability.
      security: {
        hsts: this.headerValue(input.headers, 'strict-transport-security'),
        cspPresent: this.headerValue(input.headers, 'content-security-policy') !== null,
        xContentTypeOptions: this.headerValue(input.headers, 'x-content-type-options'),
        viewportContent,
        mobileUsabilityIssues: this.collectMobileUsabilityIssues($),
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Text collection
  // ---------------------------------------------------------------------------

  /**
   * Text of every matching element, trimmed, empties dropped. When `collapse`
   * is set, internal whitespace runs are collapsed to single spaces (used for
   * headings whose source may contain newlines / nested inline markup).
   */
  private collectText($: CheerioAPI, selector: string, collapse = false): string[] {
    const out: string[] = [];
    $(selector).each((_, el) => {
      const raw = $(el).text();
      const text = collapse ? this.collapseWhitespace(raw) : raw.trim();
      if (text) {
        out.push(text);
      }
    });
    return out;
  }

  /**
   * <meta name="description"> contents. Name matched case-insensitively
   * (accepts "description", "Description", "DESCRIPTION", ...).
   */
  private collectMetaDescription($: CheerioAPI): string[] {
    const out: string[] = [];
    $('meta').each((_, el) => {
      const name = $(el).attr('name');
      if (name && name.trim().toLowerCase() === 'description') {
        const content = ($(el).attr('content') ?? '').trim();
        if (content) {
          out.push(content);
        }
      }
    });
    return out;
  }

  // ---------------------------------------------------------------------------
  // Feature 08: heading outline / lang / charset / viewport
  // ---------------------------------------------------------------------------

  /**
   * Headings (h1..h6) in document order. A single `$('h1,...,h6')` selection
   * preserves document order; each entry keeps its level (the digit) and the
   * collapsed text. Empty headings are kept as `{ level, text: '' }` so the
   * `content.headings-hierarchy` rule can flag them.
   */
  private collectHeadingsOutline($: CheerioAPI): ExtractedHeading[] {
    const out: ExtractedHeading[] = [];
    $('h1,h2,h3,h4,h5,h6').each((_, el) => {
      const tag = (el as { tagName?: string; name?: string }).tagName ?? (el as { name?: string }).name ?? '';
      const level = Number(tag.replace(/^h/i, ''));
      if (!Number.isInteger(level) || level < 1 || level > 6) return;
      out.push({ level, text: this.collapseWhitespace($(el).text()) });
    });
    return out;
  }

  /** `<html lang>`, trimmed; null when absent/empty. */
  private htmlLang($: CheerioAPI): string | null {
    const lang = $('html').attr('lang');
    const trimmed = (lang ?? '').trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  /**
   * Detected charset: `<meta charset>` first, then the charset token of a
   * `<meta http-equiv="Content-Type" content="...; charset=...">`. Lowercased
   * and trimmed; null when neither declares one.
   */
  private charset($: CheerioAPI): string | null {
    let result: string | null = null;
    $('meta').each((_, el) => {
      if (result !== null) return;
      const charsetAttr = $(el).attr('charset');
      if (charsetAttr && charsetAttr.trim()) {
        result = charsetAttr.trim().toLowerCase();
        return;
      }
      const httpEquiv = ($(el).attr('http-equiv') ?? '').trim().toLowerCase();
      if (httpEquiv === 'content-type') {
        const content = ($(el).attr('content') ?? '').toLowerCase();
        const match = content.match(/charset\s*=\s*([^;\s]+)/);
        if (match && match[1]) {
          result = match[1].trim();
        }
      }
    });
    return result;
  }

  /**
   * Raw `content` attribute of the FIRST `<meta name="viewport">` with a
   * non-empty content; null when absent/empty. Drives both `has_viewport`
   * (feature 08) and `mobile.viewport` (feature 11).
   */
  private viewportContent($: CheerioAPI): string | null {
    let result: string | null = null;
    $('meta').each((_, el) => {
      if (result !== null) return;
      const name = ($(el).attr('name') ?? '').trim().toLowerCase();
      if (name !== 'viewport') return;
      const content = ($(el).attr('content') ?? '').trim();
      if (content.length > 0) result = content;
    });
    return result;
  }

  // ---------------------------------------------------------------------------
  // <link rel="..."> helpers
  // ---------------------------------------------------------------------------

  /**
   * Resolved absolute href of the FIRST `<link rel="<rel>">` (rel matched
   * case-insensitively, multi-token rel supported). Null when absent or the
   * href cannot be resolved.
   */
  private firstResolvedLinkHref($: CheerioAPI, rel: string, base: string): string | null {
    let resolved: string | null = null;
    $('link').each((_, el) => {
      if (resolved !== null) {
        return;
      }
      if (!this.relTokens($, el).includes(rel)) {
        return;
      }
      const href = $(el).attr('href');
      if (href) {
        resolved = resolveUrl(base, href);
      }
    });
    return resolved;
  }

  private relTokens($: CheerioAPI, el: AnyNode): string[] {
    const rel = $(el).attr('rel') ?? '';
    return rel
      .split(/\s+/)
      .map((t) => t.trim().toLowerCase())
      .filter((t) => t.length > 0);
  }

  // ---------------------------------------------------------------------------
  // Canonical / meta / header
  // ---------------------------------------------------------------------------

  /**
   * Null when no canonical was declared; otherwise compares normalized canonical
   * against the normalized base (final) URL. normalizeUrl can throw on an
   * unparseable base — treat that as "not self-canonical" (false) rather than
   * throwing, since this service must never throw on normal input.
   */
  private computeSelfCanonical(canonicalUrl: string | null, base: string): boolean | null {
    if (canonicalUrl === null) {
      return null;
    }
    try {
      return normalizeUrl(canonicalUrl) === normalizeUrl(base);
    } catch {
      return false;
    }
  }

  /** <meta name="<name>"> content, name matched case-insensitively; null if absent. */
  private metaContent($: CheerioAPI, name: string): string | null {
    let value: string | null = null;
    $('meta').each((_, el) => {
      if (value !== null) {
        return;
      }
      const attr = $(el).attr('name');
      if (attr && attr.trim().toLowerCase() === name) {
        const content = ($(el).attr('content') ?? '').trim();
        value = content.length > 0 ? content : null;
      }
    });
    return value;
  }

  /**
   * Case-insensitive header lookup. Header values may be string | string[]
   * (multiple header lines); arrays are joined with ", ". Null when absent or
   * the joined value is empty.
   */
  private headerValue(
    headers: Record<string, string | string[] | undefined>,
    name: string,
  ): string | null {
    const target = name.toLowerCase();
    for (const key of Object.keys(headers)) {
      if (key.toLowerCase() !== target) {
        continue;
      }
      const raw = headers[key];
      if (raw === undefined) {
        return null;
      }
      const joined = Array.isArray(raw) ? raw.join(', ') : raw;
      const trimmed = joined.trim();
      return trimmed.length > 0 ? trimmed : null;
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // Links / images / hreflang
  // ---------------------------------------------------------------------------

  /**
   * Every `<a href>` whose href resolves to an http(s) URL. resolveUrl returns
   * null for mailto:/tel:/javascript:/data:/fragment-only links — those are
   * skipped.
   *
   * Link dedup choice: we do NOT dedupe links — every anchor is emitted in
   * document order to preserve fidelity (inlink counting / anchor analysis
   * downstream wants the true count of occurrences). Dedup is the crawler's /
   * enrich stage's responsibility.
   *
   * Feature 10: `anchorIsBareImage` is true when the anchor has no visible text
   * and its only meaningful child element is an `<img>` (a common "logo/thumb
   * link" pattern that gives crawlers no anchor signal). `imageAltMissing` is
   * true when that wrapped `<img>` lacks a non-empty `alt`. Together they power
   * the `image-link-missing-alt` sub-case of `links.anchor-quality`.
   */
  private collectLinks($: CheerioAPI, base: string): ExtractedLink[] {
    const out: ExtractedLink[] = [];
    $('a[href]').each((_, el) => {
      const href = $(el).attr('href');
      if (!href) {
        return;
      }
      const resolved = resolveUrl(base, href);
      if (resolved === null) {
        return;
      }
      const anchorText = this.collapseWhitespace($(el).text());
      const hasText = anchorText.length > 0;
      const imgs = $(el).find('img');
      const anchorIsBareImage = !hasText && imgs.length > 0;
      // image-alt missing only matters when the anchor is a bare image link;
      // true iff ANY wrapped <img> lacks a non-empty alt.
      let imageAltMissing = false;
      if (anchorIsBareImage) {
        imgs.each((_i, img) => {
          const alt = $(img).attr('alt');
          if (alt === undefined || alt.trim() === '') {
            imageAltMissing = true;
          }
        });
      }
      out.push({
        href: resolved,
        anchorText: hasText ? anchorText : null,
        type: classifyLink(base, resolved),
        rel: this.dedupe(this.relTokens($, el)),
        anchorIsBareImage,
        imageAltMissing,
      });
    });
    return out;
  }

  /**
   * Every `<img>`. `src` is resolved absolute; images whose src is absent or
   * unresolvable are skipped. As a Phase-1 convenience, when `src` is absent we
   * fall back to `data-src` (common lazy-loading pattern) so we still capture
   * the image.
   *
   * `alt` / `title`: ABSENT attribute → null (treated as "missing" downstream);
   * present-but-empty (`alt=""`) → '' (intentional decorative image, distinct
   * from missing).
   *
   * Feature 09 static signals (one row per `<img>`, preserving dedup semantics):
   *  - `width`/`height`: intrinsic dimension attrs parsed as positive integers
   *    (null when absent or non-numeric, e.g. `width="100%"`) — drives
   *    `image.no-dimensions`.
   *  - `loading`: lowercased `loading` attr (e.g. 'lazy'/'eager'); null absent.
   *  - `hasSrcset`/`hasSizes`: srcset/sizes present on the `<img>` itself OR on a
   *    parent `<picture>`'s `<source>` (the responsive candidates fold into these
   *    booleans rather than spawning extra rows).
   */
  private collectImages($: CheerioAPI, base: string): ExtractedImage[] {
    const out: ExtractedImage[] = [];
    $('img').each((_, el) => {
      const rawSrc = $(el).attr('src') ?? $(el).attr('data-src');
      if (!rawSrc || !rawSrc.trim()) {
        return;
      }
      const resolved = resolveUrl(base, rawSrc);
      if (resolved === null) {
        return;
      }

      // Responsive hints: srcset/sizes on the <img> or any sibling <source> in
      // a wrapping <picture>.
      let hasSrcset = $(el).attr('srcset') !== undefined;
      let hasSizes = $(el).attr('sizes') !== undefined;
      const picture = $(el).closest('picture');
      if (picture.length > 0) {
        picture.find('source').each((_i, source) => {
          if ($(source).attr('srcset') !== undefined) hasSrcset = true;
          if ($(source).attr('sizes') !== undefined) hasSizes = true;
        });
      }

      const loadingRaw = $(el).attr('loading');
      const loading =
        loadingRaw !== undefined && loadingRaw.trim() !== ''
          ? loadingRaw.trim().toLowerCase()
          : null;

      out.push({
        src: resolved,
        alt: this.attrOrNull($, el, 'alt'),
        title: this.attrOrNull($, el, 'title'),
        width: this.dimensionAttr($, el, 'width'),
        height: this.dimensionAttr($, el, 'height'),
        loading,
        hasSrcset,
        hasSizes,
      });
    });
    return out;
  }

  /**
   * Non-image sub-resources (feature 11) referenced by the page, resolved
   * absolute and deduped per distinct `(kind, src)`. Mixed-content detection
   * (`security.mixed-content`) reads `is_https` from these rows; images stay
   * authoritative in the `images` table and are NOT mirrored here.
   *
   *  - `<script src>`                            → 'script'
   *  - `<link rel="stylesheet" href>`            → 'style'
   *  - `<link rel="preload" as="font" href>`     → 'font'
   *  - `<iframe src>`, `<video src>`, `<audio src>`, `<source src>` → 'other'
   *
   * Pure HTML parse — no network. Resources whose src is absent / unresolvable
   * are skipped.
   */
  private collectResources($: CheerioAPI, base: string): ExtractedResource[] {
    const out: ExtractedResource[] = [];
    const seen = new Set<string>();
    const add = (rawSrc: string | undefined, kind: ExtractedResource['kind']): void => {
      if (!rawSrc || !rawSrc.trim()) return;
      const resolved = resolveUrl(base, rawSrc);
      if (resolved === null) return;
      const key = `${kind} ${resolved}`;
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ src: resolved, kind, isHttps: resolved.toLowerCase().startsWith('https://') });
    };

    $('script[src]').each((_, el) => add($(el).attr('src'), 'script'));
    $('link').each((_, el) => {
      const rels = this.relTokens($, el);
      const href = $(el).attr('href');
      if (rels.includes('stylesheet')) {
        add(href, 'style');
      } else if (rels.includes('preload') && ($(el).attr('as') ?? '').trim().toLowerCase() === 'font') {
        add(href, 'font');
      }
    });
    $('iframe[src]').each((_, el) => add($(el).attr('src'), 'other'));
    $('video[src]').each((_, el) => add($(el).attr('src'), 'other'));
    $('audio[src]').each((_, el) => add($(el).attr('src'), 'other'));
    $('source[src]').each((_, el) => add($(el).attr('src'), 'other'));

    return out;
  }

  /**
   * Static mobile-usability heuristics (feature 11 `mobile.usability`,
   * `medium` confidence — no layout). Flags illegibly small inline fonts and
   * top-level containers pinned to a fixed pixel width wider than a phone. These
   * are estimates that upgrade to precise once the Playwright render path lands.
   */
  private collectMobileUsabilityIssues($: CheerioAPI): string[] {
    const issues = new Set<string>();
    $('[style]').each((_, el) => {
      const style = ($(el).attr('style') ?? '').toLowerCase();
      const fontMatch = style.match(/font-size\s*:\s*(\d+(?:\.\d+)?)\s*px/);
      if (fontMatch && Number(fontMatch[1]) < MOBILE_MIN_FONT_PX) {
        issues.add('tiny-font');
      }
      const widthMatch = style.match(/(?:^|[;\s])width\s*:\s*(\d+(?:\.\d+)?)\s*px/);
      if (widthMatch && Number(widthMatch[1]) > MOBILE_MAX_FIXED_WIDTH_PX) {
        issues.add('fixed-width-overflow');
      }
    });
    return [...issues];
  }

  /**
   * Parse an intrinsic dimension attribute (`width`/`height`) into a positive
   * integer. Returns null when absent, empty, or non-integer (e.g. `"100%"`,
   * `"auto"`) — those are NOT real intrinsic dimensions for the CLS check.
   */
  private dimensionAttr($: CheerioAPI, el: AnyNode, attr: string): number | null {
    const raw = $(el).attr(attr);
    if (raw === undefined) return null;
    const trimmed = raw.trim();
    if (trimmed === '' || !/^\d+$/.test(trimmed)) return null;
    const n = Number(trimmed);
    return Number.isInteger(n) && n > 0 ? n : null;
  }

  /** Returns the attribute value verbatim if the attribute is present (incl. ''), else null. */
  private attrOrNull($: CheerioAPI, el: AnyNode, attr: string): string | null {
    const value = $(el).attr(attr);
    return value === undefined ? null : value;
  }

  /**
   * Every `<link rel="alternate" hreflang="...">`. lang trimmed; href resolved
   * absolute. Entries with an empty lang or an unresolvable href are skipped.
   */
  private collectHreflang($: CheerioAPI, base: string): ExtractedHreflang[] {
    const out: ExtractedHreflang[] = [];
    $('link').each((_, el) => {
      if (!this.relTokens($, el).includes('alternate')) {
        return;
      }
      const lang = ($(el).attr('hreflang') ?? '').trim();
      if (!lang) {
        return;
      }
      const href = $(el).attr('href');
      if (!href) {
        return;
      }
      const resolved = resolveUrl(base, href);
      if (resolved === null) {
        return;
      }
      out.push({ lang, href: resolved });
    });
    return out;
  }

  // ---------------------------------------------------------------------------
  // Structured data (JSON-LD) + social metadata (Open Graph / Twitter)
  // ---------------------------------------------------------------------------

  /**
   * Every `<script type="application/ld+json">` block, parsed best-effort into a
   * flat list of nodes. NEVER throws: a syntactically-invalid block yields one
   * entry `{ type:null, valid:false, errors:[json-syntax] }`. Object / array /
   * `@graph` shapes are all normalized to one entry per node. Shape validity is
   * filled by {@link validateStructuredData} (the extractor stays parse-only).
   *
   * Bounded: at most SCHEMA_MAX_BLOCKS_PER_PAGE scripts are parsed and each
   * stored `raw` is truncated to SCHEMA_RAW_MAX_BYTES.
   */
  private collectStructuredData($: CheerioAPI): ExtractedStructuredData[] {
    const out: ExtractedStructuredData[] = [];
    const scripts: AnyNode[] = [];
    $('script').each((_, el) => {
      const type = ($(el).attr('type') ?? '').trim().toLowerCase();
      if (type === 'application/ld+json') {
        scripts.push(el);
      }
    });

    for (const el of scripts.slice(0, SCHEMA_MAX_BLOCKS_PER_PAGE)) {
      const raw = this.truncate($(el).text() ?? '', SCHEMA_RAW_MAX_BYTES);
      let parsed: unknown;
      try {
        parsed = JSON.parse($(el).text());
      } catch (err) {
        out.push({
          type: null,
          valid: false,
          raw,
          errors: [
            {
              code: 'json-syntax',
              message: err instanceof Error ? err.message : String(err),
            },
          ],
        });
        continue;
      }

      for (const node of this.flattenJsonLd(parsed)) {
        out.push({
          type: this.coerceType(node['@type']),
          valid: true, // refined by the validator below
          raw,
          errors: [],
          node,
        });
      }
    }

    // Best-effort shape validation in place (never throws).
    try {
      validateStructuredData(out);
    } catch {
      // leave parse-only verdicts on any unexpected validator error
    }
    return out;
  }

  /**
   * Normalize an arbitrary parsed JSON-LD value into a flat list of node
   * objects: a top-level array iterates its elements; a single object with an
   * `@graph` array iterates that graph; a single object is one node. Non-object
   * members are skipped.
   */
  private flattenJsonLd(value: unknown): Record<string, unknown>[] {
    const nodes: Record<string, unknown>[] = [];
    const push = (v: unknown): void => {
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        nodes.push(v as Record<string, unknown>);
      }
    };
    if (Array.isArray(value)) {
      for (const v of value) push(v);
      return nodes;
    }
    if (value && typeof value === 'object') {
      const obj = value as Record<string, unknown>;
      const graph = obj['@graph'];
      if (Array.isArray(graph)) {
        for (const v of graph) push(v);
        return nodes;
      }
      push(obj);
    }
    return nodes;
  }

  /**
   * Coerce a JSON-LD `@type` (string, or first element of an array) to a plain
   * type string with the optional `http(s)://schema.org/` prefix stripped. Null
   * when absent / not a string.
   */
  private coerceType(rawType: unknown): string | null {
    const value = Array.isArray(rawType) ? rawType[0] : rawType;
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    return trimmed.replace(/^https?:\/\/schema\.org\//i, '');
  }

  /**
   * Open Graph + Twitter Card tags as a flat bag (first non-empty value per key
   * wins). OG uses the `property` attribute; Twitter uses `name`. `og:url` /
   * `og:image` / `twitter:image` are resolved absolute against `base`. Returns
   * null when NO social tags were found (distinguishes absent from partial).
   * Never throws.
   */
  private collectOgData($: CheerioAPI, base: string): OgData | null {
    const raw = new Map<string, string>();
    $('meta').each((_, el) => {
      const key = ($(el).attr('property') ?? $(el).attr('name') ?? '').trim().toLowerCase();
      if (!key || (!key.startsWith('og:') && !key.startsWith('twitter:'))) {
        return;
      }
      if (raw.has(key)) return; // first-wins
      const content = ($(el).attr('content') ?? '').trim();
      if (content) raw.set(key, content);
    });

    if (raw.size === 0) return null;

    const get = (key: string): string | null => raw.get(key) ?? null;
    const resolve = (key: string): string | null => {
      const v = raw.get(key);
      return v ? resolveUrl(base, v) : null;
    };

    return {
      ogTitle: get('og:title'),
      ogDescription: get('og:description'),
      ogImage: resolve('og:image'),
      ogUrl: resolve('og:url'),
      ogType: get('og:type'),
      ogSiteName: get('og:site_name'),
      twitterCard: get('twitter:card'),
      twitterTitle: get('twitter:title'),
      twitterDescription: get('twitter:description'),
      twitterImage: resolve('twitter:image'),
    };
  }

  /** Truncate a string to at most `maxBytes` UTF-8 bytes (best-effort, char-safe). */
  private truncate(text: string, maxBytes: number): string {
    if (Buffer.byteLength(text, 'utf8') <= maxBytes) return text;
    // Slice by chars until under the byte budget (worst case 4 bytes/char).
    let slice = text.slice(0, maxBytes);
    while (Buffer.byteLength(slice, 'utf8') > maxBytes && slice.length > 0) {
      slice = slice.slice(0, -1);
    }
    return slice;
  }

  // ---------------------------------------------------------------------------
  // Content hash + normalized body text
  // ---------------------------------------------------------------------------

  /**
   * Build the normalized visible body text ONCE and return both its sha256 hex
   * `hash` (for duplicate-content grouping) and the `text` itself (reused for
   * the word count and the SimHash, so the DOM is walked once).
   *
   * Normalization: `<script>/<style>` removed, whitespace collapsed, trimmed,
   * lowercased — IDENTICAL to the prior `computeContentHash`, so the hash output
   * is byte-for-byte unchanged (guarded by the `dupe.content` stability test).
   * `hash`/`text` are null/'' when the normalized text is empty.
   *
   * We operate on a DETACHED copy of the body markup so removing `<script>` /
   * `<style>` cannot mutate the shared `$` other extractors rely on.
   */
  private computeNormalizedBody($: CheerioAPI): { hash: string | null; text: string } {
    const bodyEl = $('body');
    const html = bodyEl.length > 0 ? (bodyEl.html() ?? '') : ($.root().html() ?? '');
    const $isolated = cheerio.load(html);
    $isolated('script, style').remove();

    const normalized = this.collapseWhitespace($isolated.root().text()).toLowerCase();
    if (!normalized) {
      return { hash: null, text: '' };
    }
    return {
      hash: createHash('sha256').update(normalized, 'utf8').digest('hex'),
      text: normalized,
    };
  }

  // ---------------------------------------------------------------------------
  // Small utilities
  // ---------------------------------------------------------------------------

  /** Collapse all whitespace runs to single spaces and trim the ends. */
  private collapseWhitespace(text: string): string {
    return text.replace(/\s+/g, ' ').trim();
  }

  /** Stable dedupe preserving first-seen order. */
  private dedupe(tokens: string[]): string[] {
    return [...new Set(tokens)];
  }
}
