import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import * as cheerio from 'cheerio';
import type { CheerioAPI } from 'cheerio';
import type { AnyNode } from 'domhandler';
import { classifyLink, normalizeUrl, resolveUrl } from '../common/url.util';
import type {
  ExtractInput,
  ExtractedHreflang,
  ExtractedImage,
  ExtractedLink,
  ExtractedPage,
} from './crawl.types';

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
      contentHash: this.computeContentHash($),
      links: this.collectLinks($, base),
      images: this.collectImages($, base),
      hreflang: this.collectHreflang($, base),
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
      out.push({
        href: resolved,
        anchorText: anchorText.length > 0 ? anchorText : null,
        type: classifyLink(base, resolved),
        rel: this.dedupe(this.relTokens($, el)),
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
      out.push({
        src: resolved,
        alt: this.attrOrNull($, el, 'alt'),
        title: this.attrOrNull($, el, 'title'),
      });
    });
    return out;
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
  // Content hash
  // ---------------------------------------------------------------------------

  /**
   * sha256 (hex) of the normalized visible text: <script>/<style> removed,
   * whitespace collapsed, trimmed, lowercased. Null when the normalized text is
   * empty. Note we clone via a fresh load is unnecessary — we mutate a $ used
   * only for hashing... but this $ is shared, so operate on a detached copy of
   * the body markup instead to avoid mutating state other extractors rely on.
   */
  private computeContentHash($: CheerioAPI): string | null {
    // Re-parse the body (or whole doc) into an isolated tree so removing
    // <script>/<style> cannot affect other extractions on the shared `$`.
    const bodyEl = $('body');
    const html = bodyEl.length > 0 ? (bodyEl.html() ?? '') : ($.root().html() ?? '');
    const $isolated = cheerio.load(html);
    $isolated('script, style').remove();

    const normalized = this.collapseWhitespace($isolated.root().text()).toLowerCase();
    if (!normalized) {
      return null;
    }
    return createHash('sha256').update(normalized, 'utf8').digest('hex');
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
