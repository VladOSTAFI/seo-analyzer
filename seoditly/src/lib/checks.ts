/**
 * Single source of truth for the technical-SEO checks the audit runs.
 *
 * Grouped into the six categories the pipeline reports against (Metadata,
 * Canonical/Indexing, Links, Images, Performance, i18n). Editing a check name,
 * adding one, or re-categorising happens here — the `/how-it-works` checks grid
 * renders straight from this array, so JSX never has to be touched.
 *
 * `CHECK_COUNT` is derived, so the "~31 checks" figure stays honest as the list
 * evolves.
 */
export interface CheckCategory {
  /** Stable key for React lists + icon lookup. */
  key: string;
  /** Human-readable category label shown as the card title. */
  category: string;
  /** One-line description of what this family of checks covers. */
  blurb: string;
  /** Individual check names within the category. */
  items: string[];
}

export const CHECK_CATEGORIES: readonly CheckCategory[] = [
  {
    key: "metadata",
    category: "Metadata",
    blurb: "Titles, descriptions, and headings that search engines read first.",
    items: [
      "Missing or empty <title>",
      "Duplicate titles across pages",
      "Title length outside the recommended range",
      "Missing meta description",
      "Duplicate meta descriptions",
      "Meta description length outside range",
      "Missing or multiple <h1> tags",
      "Missing viewport / charset meta tags",
    ],
  },
  {
    key: "canonical",
    category: "Canonical & Indexing",
    blurb: "Signals that decide which URLs are indexed and which are ignored.",
    items: [
      "Missing canonical tag",
      "Canonical points to a non-200 URL",
      "Canonical points off-site or to a redirect",
      "noindex on a page that should be indexed",
      "URL blocked by robots.txt",
      "Missing or malformed XML sitemap entry",
      "Non-self-referencing canonical on paginated pages",
    ],
  },
  {
    key: "links",
    category: "Links",
    blurb: "The link graph, redirects, and dead ends crawlers hit.",
    items: [
      "Broken internal links (4xx / 5xx)",
      "Redirect chains and loops",
      "Links to non-canonical URLs",
      "Orphan pages with no inbound links",
      "Mixed HTTP / HTTPS links",
      "Anchors with empty or generic link text",
    ],
  },
  {
    key: "images",
    category: "Images",
    blurb: "Asset health that affects accessibility and image search.",
    items: [
      "Images missing alt text",
      "Broken image sources",
      "Oversized images without compression",
      "Missing width / height (layout shift risk)",
    ],
  },
  {
    key: "performance",
    category: "Performance",
    blurb: "Core Web Vitals and load behaviour via Google PageSpeed.",
    items: [
      "Largest Contentful Paint (LCP) over budget",
      "Cumulative Layout Shift (CLS) over budget",
      "Interaction to Next Paint (INP) over budget",
      "Render-blocking resources",
      "Uncompressed or unminified assets",
    ],
  },
  {
    key: "i18n",
    category: "Internationalization",
    blurb: "Language and region targeting for multi-locale sites.",
    items: [
      "Missing or invalid hreflang annotations",
      "hreflang without a return (reciprocal) tag",
      "Missing or incorrect lang attribute",
    ],
  },
] as const;

/** Total number of individual checks — keeps the "~31 checks" copy honest. */
export const CHECK_COUNT = CHECK_CATEGORIES.reduce(
  (total, group) => total + group.items.length,
  0,
);
