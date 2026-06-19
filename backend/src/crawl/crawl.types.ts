/**
 * The shared contract between {@link ExtractService} (parses one HTTP response
 * into structured SEO data) and {@link CrawlService} (drives the crawler and
 * persists rows). These two services are built in parallel; this file is the
 * single source of truth for their interface — keep it precise and complete.
 */

/** A single fetched HTTP response handed to the extractor. */
export interface ExtractInput {
  /** The request URL as it was queued (pre-redirect). */
  url: string;
  /** The final URL after following any redirects (used for self-canonical). */
  finalUrl: string;
  /** Raw HTML body of the response. */
  html: string;
  /** Numeric HTTP status code of the final response. */
  statusCode: number;
  /** Response headers (lowercased keys recommended); used for x-robots-tag. */
  headers: Record<string, string | string[] | undefined>;
}

/** One outlink extracted from a page. */
export interface ExtractedLink {
  /** Resolved absolute URL (via url.util.resolveUrl). */
  href: string;
  /** Visible anchor text, trimmed; null when empty. */
  anchorText: string | null;
  /** Internal vs external relative to the source page's host. */
  type: 'internal' | 'external';
  /** Lowercased tokens of the `rel` attribute (e.g. ['nofollow','sponsored']). */
  rel: string[];
  /**
   * True when the `<a>`'s only meaningful child is an `<img>` and it has no text
   * (feature 10). Powers the `image-link-missing-alt` sub-case of
   * `links.anchor-quality` without a cross-table join.
   */
  anchorIsBareImage: boolean;
  /** True when that wrapped `<img>` lacks a non-empty `alt` (feature 10). */
  imageAltMissing: boolean;
}

/** One image extracted from a page. */
export interface ExtractedImage {
  /** Resolved absolute image src. */
  src: string;
  /** alt attribute value; null when absent. */
  alt: string | null;
  /** title attribute value; null when absent. */
  title: string | null;
  /** Intrinsic width attribute (feature 09); null when absent or non-numeric. */
  width: number | null;
  /** Intrinsic height attribute (feature 09); null when absent or non-numeric. */
  height: number | null;
  /** `loading` attribute value, lowercased (e.g. 'lazy'/'eager'); null when absent. */
  loading: string | null;
  /**
   * True when `srcset` is present on the `<img>` itself or on a parent
   * `<picture><source>` (feature 09; responsive-image hint).
   */
  hasSrcset: boolean;
  /** True when `sizes` is present on the `<img>` or a parent `<source>` (feature 09). */
  hasSizes: boolean;
}

/**
 * One non-image sub-resource referenced by a page (feature 11). Walked from
 * `<script src>`, `<link rel=stylesheet>`, `<link rel=preload as=font>`,
 * `<iframe>`, `<video>/<audio>/<source>` etc. and resolved absolute. Persisted
 * into `page_resources`; `isHttps` drives `security.mixed-content`. Pure HTML
 * parse — no network (bytes/format/status are filled later by the probe pass).
 */
export interface ExtractedResource {
  /** Resolved absolute resource URL. */
  src: string;
  /** Coarse resource class. */
  kind: 'script' | 'style' | 'font' | 'other';
  /** Scheme of the resolved src (https → true). */
  isHttps: boolean;
}

/** One hreflang alternate declaration extracted from a page. */
export interface ExtractedHreflang {
  /** hreflang value, e.g. "uk-UA" or "x-default". */
  lang: string;
  /** Resolved absolute alternate URL. */
  href: string;
}

/** One heading in document order (feature 08, heading-hierarchy analysis). */
export interface ExtractedHeading {
  /** Heading level 1..6 (the digit of h1..h6). */
  level: number;
  /** Collapsed heading text; '' for an empty heading (kept so the rule can flag it). */
  text: string;
}

/**
 * One structured-data error annotation produced by the validator (or by the
 * extractor for a JSON-syntax failure). `code` classifies the problem; `prop`
 * (and `type`) pinpoint which property/type, `message` carries a parser note.
 */
export interface SchemaError {
  /** 'json-syntax' | 'missing-required' | 'missing-recommended'. */
  code: 'json-syntax' | 'missing-required' | 'missing-recommended';
  /** The schema property that is absent/empty (validation errors). */
  prop?: string;
  /** The schema.org @type the error is scoped to. */
  type?: string;
  /** Free-text detail (JSON parse message). */
  message?: string;
}

/**
 * One JSON-LD node extracted (and shape-validated) from a page. The extractor
 * produces the `type`/`valid`/`raw` parse view; the validator fills `valid`
 * and `errors` with the shape-check result before persistence.
 */
export interface ExtractedStructuredData {
  /**
   * schema.org @type, e.g. "LocalBusiness" (schema.org URL prefix stripped),
   * the first element of an array @type, or null for an unparseable block /
   * a node with no @type.
   */
  type: string | null;
  /** JSON parsed AND (after validation) all required props present. */
  valid: boolean;
  /** Truncated raw JSON-LD text (bounded by SCHEMA_RAW_MAX_BYTES). */
  raw: string;
  /** Syntax + shape errors. Empty when the node is valid. */
  errors: SchemaError[];
  /**
   * The parsed node object, kept transiently so the validator can shape-check
   * it. Not persisted. Undefined on a JSON-syntax failure.
   */
  node?: Record<string, unknown>;
}

/**
 * Social metadata (Open Graph + Twitter Card) collected from one page's
 * `<head>`. Every field is the FIRST non-empty value found for that tag
 * (duplicates ignored). `ogUrl`/`ogImage`/`twitterImage` are resolved absolute
 * against the page base. The whole bag is null when a page declares no
 * OG/Twitter tags at all (distinguishes "no social metadata" from "partial").
 */
export interface OgData {
  ogTitle: string | null;
  ogDescription: string | null;
  ogImage: string | null;
  ogUrl: string | null;
  ogType: string | null;
  ogSiteName: string | null;
  twitterCard: string | null;
  twitterTitle: string | null;
  twitterDescription: string | null;
  twitterImage: string | null;
}

/**
 * Security headers + mobile-usability signals captured from one response
 * (feature 11). Header values are read from `ExtractInput.headers` as-observed;
 * the mobile signals come from the HTML. All best-effort, no network.
 */
export interface SecuritySignals {
  /** Strict-Transport-Security header value; null when absent. */
  hsts: string | null;
  /** Content-Security-Policy header present. */
  cspPresent: boolean;
  /** X-Content-Type-Options header value (expect 'nosniff'); null when absent. */
  xContentTypeOptions: string | null;
  /** Raw `<meta name=viewport>` content attribute; null when absent. */
  viewportContent: string | null;
  /** Static mobile-usability heuristic hits (tiny inline fonts / fixed-width overflow). */
  mobileUsabilityIssues: string[];
}

/** The full structured result of extracting one page. */
export interface ExtractedPage {
  /** All <title> texts found (array → detect missing/multiple/duplicate). */
  title: string[];
  /** All meta description contents found. */
  metaDescription: string[];
  /** All <h1> texts found. */
  h1: string[];
  /** All <h2> texts found. */
  h2: string[];
  /** Resolved absolute canonical URL from <link rel="canonical">, or null. */
  canonicalUrl: string | null;
  /**
   * Whether the canonical points at this page:
   * normalizeUrl(canonicalUrl) === normalizeUrl(finalUrl). Null when no
   * canonical is declared.
   */
  isSelfCanonical: boolean | null;
  /** Content of <meta name="robots">, or null. */
  metaRobots: string | null;
  /** Value of the X-Robots-Tag response header (from input.headers), or null. */
  xRobotsTag: string | null;
  /** Resolved absolute href of <link rel="next">, or null. */
  relNext: string | null;
  /** Resolved absolute href of <link rel="prev">, or null. */
  relPrev: string | null;
  /** sha256 of normalized visible text, for duplicate-content grouping; null if none. */
  contentHash: string | null;
  /** All outlinks discovered on the page. */
  links: ExtractedLink[];
  /** All images discovered on the page. */
  images: ExtractedImage[];
  /** Non-image sub-resources (feature 11): script/style/font/iframe/media. */
  resources: ExtractedResource[];
  /** All hreflang alternates declared on the page. */
  hreflang: ExtractedHreflang[];
  /** All JSON-LD structured-data nodes found (parse-only; validated downstream). */
  structuredData: ExtractedStructuredData[];
  /** Open Graph + Twitter Card metadata, or null when no social tags exist. */
  ogData: OgData | null;

  // ── Feature 08 (content semantics) ─────────────────────────────────────────
  /** Visible-text word count of the normalized body text; 0 when no body. */
  wordCount: number;
  /** Raw HTML byte length (for the content-to-code ratio). */
  htmlBytes: number;
  /** `<html lang>` value, trimmed; null when absent/empty. */
  htmlLang: string | null;
  /** Detected charset (meta charset or http-equiv); null when absent. */
  charset: string | null;
  /** True when a `<meta name=viewport>` with a non-empty content attr exists. */
  hasViewport: boolean;
  /** Headings in document order across h1..h6 (empty headings kept). */
  headingsOutline: ExtractedHeading[];
  /** 64-bit SimHash of the body (64-char bit string); null when no body. */
  contentSimhash: string | null;
  /** Estimated SERP pixel width of the first title; null when no title. */
  titlePx: number | null;
  /** Estimated SERP pixel width of the first meta description; null when absent. */
  descPx: number | null;

  // ── Feature 11 (security headers + mobile usability) ────────────────────────
  /** Security headers + mobile-usability signals. */
  security: SecuritySignals;
}

/** Row counts persisted by a crawl run, surfaced for logging/reporting. */
export interface CrawlSummary {
  pages: number;
  links: number;
  images: number;
  hreflang: number;
  structuredData: number;
}
