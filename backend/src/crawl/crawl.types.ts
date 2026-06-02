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
}

/** One image extracted from a page. */
export interface ExtractedImage {
  /** Resolved absolute image src. */
  src: string;
  /** alt attribute value; null when absent. */
  alt: string | null;
  /** title attribute value; null when absent. */
  title: string | null;
}

/** One hreflang alternate declaration extracted from a page. */
export interface ExtractedHreflang {
  /** hreflang value, e.g. "uk-UA" or "x-default". */
  lang: string;
  /** Resolved absolute alternate URL. */
  href: string;
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
  /** All hreflang alternates declared on the page. */
  hreflang: ExtractedHreflang[];
}

/** Row counts persisted by a crawl run, surfaced for logging/reporting. */
export interface CrawlSummary {
  pages: number;
  links: number;
  images: number;
  hreflang: number;
}
