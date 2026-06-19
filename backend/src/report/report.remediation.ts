/**
 * Rich remediation catalogue (plan 13 §3.3) — a static, data-driven map keyed by
 * `ruleFamily` (with optional per-`ruleId` overrides), mirroring the
 * REPORT_SECTIONS registry pattern. PURE: no ExcelJS / db / fs.
 *
 * Replaces the single static `recommendation` string scattered through
 * report.sections.ts. The `howToFix` field is the single-sourced short-form
 * guidance the report's `recommendation` cell now renders; `impact`/`effort`
 * (1..5) feed the action-plan priority formula (report.actions.ts).
 *
 * Coverage invariant: report.remediation.spec.ts asserts EVERY `ruleFamily` in
 * the live rule registry has a complete entry — a new rule cannot ship without
 * remediation guidance.
 */

export interface Remediation {
  /** SEO rationale (2–3 sentences) — why this matters. */
  whyItMatters: string;
  /** Concrete fix steps; also the report's `recommendation` cell. */
  howToFix: string;
  /** Optional copy-pasteable HTML/code example. */
  snippet?: string;
  /** What improves and roughly how much. */
  expectedImpact: string;
  /** Canonical doc link (Google Search Central etc.). */
  docLink: string;
  /** Impact on SEO health if fixed, 1..5 (higher = bigger win). */
  impact: number;
  /** Effort to fix, 1..5 (lower = easier). */
  effort: number;
}

const GSC = 'https://developers.google.com/search/docs';

/**
 * The catalogue, keyed by `ruleFamily` (first two dotted segments of a ruleId).
 * Every family in the live registry MUST have an entry (coverage test).
 */
export const REMEDIATION: Record<string, Remediation> = {
  // ── mirror.* ──────────────────────────────────────────────────────────────
  'mirror.main-mirror': {
    whyItMatters:
      'When a site answers on multiple host/scheme variants (http/https, www/non-www) without ' +
      'redirecting to one, search engines split signals across duplicates and may index the wrong ' +
      'origin. It dilutes link equity and creates duplicate-content ambiguity.',
    howToFix:
      'Pick one canonical origin and 301-redirect every other variant to it. Enforce HTTPS and a ' +
      'single host form at the server/CDN level.',
    snippet: 'RewriteRule ^ https://www.example.com%{REQUEST_URI} [L,R=301]',
    expectedImpact:
      'Consolidates indexing and link equity onto one origin; removes duplicate hosts.',
    docLink: `${GSC}/crawling-indexing/consolidate-duplicate-urls`,
    impact: 4,
    effort: 2,
  },
  'mirror.trailing-slash': {
    whyItMatters:
      'A page reachable both with and without a trailing slash is two URLs serving identical ' +
      'content. Search engines treat them as duplicates, splitting ranking signals.',
    howToFix:
      'Choose one trailing-slash convention and 301-redirect the other form to it consistently ' +
      'across the site.',
    snippet: 'RewriteRule (.+)/$ /$1 [L,R=301]',
    expectedImpact: 'Removes per-URL duplication; consolidates signals onto the canonical form.',
    docLink: `${GSC}/crawling-indexing/consolidate-duplicate-urls`,
    impact: 3,
    effort: 2,
  },

  // ── links.* ─────────────────────────────────────────────────────────────
  'links.internal-redirect': {
    whyItMatters:
      'Internal links pointing at a 3xx waste crawl budget and leak a small amount of link equity ' +
      'on every hop. They also slow users with an extra round-trip.',
    howToFix: 'Point the link directly at the final destination URL (avoid the 3xx hop).',
    expectedImpact: 'Faster navigation, cleaner crawl paths, no equity loss through redirects.',
    docLink: `${GSC}/crawling-indexing/links-crawlable`,
    impact: 2,
    effort: 1,
  },
  'links.redirect-chain': {
    whyItMatters:
      'Redirect chains (>1 hop) and loops compound crawl waste and latency; long chains can be ' +
      'dropped by crawlers before reaching the destination.',
    howToFix: 'Collapse the chain so each source redirects directly to the final URL in one hop.',
    expectedImpact: 'Eliminates multi-hop latency and crawl waste; prevents dropped redirects.',
    docLink: `${GSC}/crawling-indexing/301-redirects`,
    impact: 3,
    effort: 2,
  },
  'links.broken-internal': {
    whyItMatters:
      'Internal links to 4xx/5xx pages create dead ends for users and crawlers, waste crawl ' +
      'budget, and signal poor maintenance quality.',
    howToFix: 'Fix the target URL, update the link to a live page, or remove the link.',
    expectedImpact: 'Restores crawl paths and user navigation; reclaims wasted crawl budget.',
    docLink: `${GSC}/crawling-indexing/links-crawlable`,
    impact: 4,
    effort: 2,
  },
  'links.broken-external': {
    whyItMatters:
      'Outbound links to dead pages degrade user trust and the perceived quality of the page. ' +
      'They do not directly hurt rankings but reflect poorly on content freshness.',
    howToFix: 'Update the link to a working resource or remove it.',
    expectedImpact: 'Improves user trust and content quality signals.',
    docLink: `${GSC}/crawling-indexing/links-crawlable`,
    impact: 2,
    effort: 2,
  },
  'links.external-flag': {
    whyItMatters:
      'External links without a rel hint (nofollow/sponsored/ugc) on monetized or untrusted ' +
      'destinations can pass equity to places you did not intend and may violate link-scheme ' +
      'guidance for paid placements.',
    howToFix:
      'Add the appropriate rel token (rel="sponsored" for paid, rel="ugc" for user content, ' +
      'rel="nofollow" otherwise) to external links you do not editorially endorse.',
    snippet: '<a href="https://partner.example" rel="sponsored">Partner</a>',
    expectedImpact: 'Correctly attributes outbound link intent; reduces link-scheme risk.',
    docLink: `${GSC}/crawling-indexing/qualify-outbound-links`,
    impact: 1,
    effort: 1,
  },
  'links.anchor-quality': {
    whyItMatters:
      'Empty or generic anchor text ("click here", "read more") gives crawlers and users no ' +
      'context about the destination, weakening the topical signal internal links should pass.',
    howToFix:
      'Use concise, descriptive anchor text that reflects the target page’s primary topic; ' +
      'avoid generic phrases and never leave an internal link with empty anchor text.',
    snippet: '<a href="/pricing">View our pricing plans</a>',
    expectedImpact: 'Strengthens internal topical signals and accessibility of link context.',
    docLink: `${GSC}/crawling-indexing/links-crawlable`,
    impact: 2,
    effort: 1,
  },
  'links.internal-nofollow': {
    whyItMatters:
      'rel="nofollow" on internal links blocks the flow of link equity through your own site and ' +
      'can prevent important pages from being discovered or ranked as well as they should.',
    howToFix:
      'Remove the nofollow attribute from internal links. Reserve nofollow for untrusted ' +
      'outbound destinations, not your own pages.',
    snippet: '<a href="/about">About us</a>',
    expectedImpact: 'Restores internal link-equity flow; improves crawl and ranking of key pages.',
    docLink: `${GSC}/crawling-indexing/qualify-outbound-links`,
    impact: 2,
    effort: 1,
  },

  // ── meta.* ────────────────────────────────────────────────────────────────
  'meta.title': {
    whyItMatters:
      'The <title> is the single strongest on-page relevance signal and the SERP headline users ' +
      'click. Missing, duplicated, or multiple titles dilute relevance and depress click-through.',
    howToFix:
      'Give every page exactly one unique, descriptive <title> targeting its primary keyword, ' +
      'kept within the SERP-visible length.',
    snippet: '<title>Best Gym in Kyiv — Olimp Strong</title>',
    expectedImpact: 'Improves relevance for the target query and SERP click-through rate.',
    docLink: `${GSC}/appearance/title-link`,
    impact: 4,
    effort: 2,
  },
  'meta.description': {
    whyItMatters:
      'The meta description is the SERP snippet that sells the click. Missing or duplicated ' +
      'descriptions let search engines auto-generate snippets that may be off-message and hurt CTR.',
    howToFix:
      'Write a unique, compelling meta description per page summarizing its content within the ' +
      'snippet length; avoid reusing one description site-wide.',
    snippet: '<meta name="description" content="Train at Kyiv’s top-rated gym …">',
    expectedImpact: 'Better, on-message SERP snippets and higher click-through rate.',
    docLink: `${GSC}/appearance/snippet`,
    impact: 3,
    effort: 2,
  },
  'meta.h1': {
    whyItMatters:
      'The H1 is the strongest on-page topical signal after the title. A missing, duplicated, or ' +
      'repeated-across-pages H1 (e.g. a logo wrapped in <h1>) dilutes relevance and confuses both ' +
      'users and crawlers about each page’s primary topic.',
    howToFix:
      'Use exactly one <h1> per page, unique to that page’s primary keyword. Move the logo ' +
      'out of an <h1> into a plain <a>/<img>.',
    snippet: '<h1>Best Gym in Kyiv — Olimp Strong</h1>',
    expectedImpact: 'Improves topical relevance for the page’s target query; clearer intent match.',
    docLink: `${GSC}/appearance/structured-data`,
    impact: 3,
    effort: 1,
  },

  // ── dupe.* ──────────────────────────────────────────────────────────────
  'dupe.content': {
    whyItMatters:
      'Pages sharing identical body content compete with each other for the same queries, split ' +
      'ranking signals, and waste crawl budget. Search engines pick one and may suppress the rest.',
    howToFix:
      'Consolidate duplicates to one canonical URL (rel=canonical or 301), or differentiate the ' +
      'content so each page serves a distinct intent.',
    snippet: '<link rel="canonical" href="https://example.com/the-one-true-url">',
    expectedImpact: 'Consolidates ranking signals onto one URL; reclaims crawl budget.',
    docLink: `${GSC}/crawling-indexing/consolidate-duplicate-urls`,
    impact: 3,
    effort: 3,
  },

  // ── index.* ─────────────────────────────────────────────────────────────
  'index.canonical': {
    whyItMatters:
      'A missing or non-self canonical lets search engines choose a different URL as canonical, ' +
      'potentially de-indexing the page you want ranked and splitting duplicate signals.',
    howToFix:
      'Add a self-referential rel=canonical to each indexable page (or point it deliberately at ' +
      'the intended canonical when consolidating duplicates).',
    snippet: '<link rel="canonical" href="https://example.com/this-page">',
    expectedImpact: 'Ensures the intended URL is the indexed one; resolves duplicate ambiguity.',
    docLink: `${GSC}/crawling-indexing/consolidate-duplicate-urls`,
    impact: 4,
    effort: 2,
  },
  'index.robots': {
    whyItMatters:
      'A live page blocked by a noindex meta tag or robots directive will be dropped from search ' +
      'entirely. When applied accidentally to a page that should rank, it silently kills its traffic.',
    howToFix:
      'Remove the noindex/robots block from any page that should be indexable; verify robots.txt ' +
      'and meta-robots agree with your indexing intent.',
    snippet: '<meta name="robots" content="index, follow">',
    expectedImpact:
      'Restores indexability and organic visibility of unintentionally blocked pages.',
    docLink: `${GSC}/crawling-indexing/robots-meta-tag`,
    impact: 5,
    effort: 1,
  },
  'index.url-heuristics': {
    whyItMatters:
      'Non-SEO-friendly URLs (uppercase, underscores, long query strings) are harder for users to ' +
      'read and share and can fragment crawl/indexing when parameters create near-duplicate URLs.',
    howToFix: 'Use lowercase, hyphen-separated, short, parameter-free, descriptive URL slugs.',
    snippet: '/blog/best-gym-kyiv  (not /Blog/Best_Gym?id=42)',
    expectedImpact: 'Cleaner, more shareable URLs; fewer parameter-driven duplicate URLs.',
    docLink: `${GSC}/crawling-indexing/url-structure`,
    impact: 2,
    effort: 3,
  },
  'index.orphan-page': {
    whyItMatters:
      'An orphan page has no internal links pointing to it, so crawlers struggle to discover it ' +
      'and it accrues little internal link equity — even if it sits in the sitemap.',
    howToFix:
      'Add internal links from relevant hub/category pages and navigation to the orphan page so ' +
      'it is reachable by crawl and inherits link equity.',
    snippet: '<a href="/services/personal-training">Personal training</a>',
    expectedImpact: 'Improves discoverability and internal link equity of buried pages.',
    docLink: `${GSC}/crawling-indexing/links-crawlable`,
    impact: 3,
    effort: 2,
  },
  'index.click-depth': {
    whyItMatters:
      'Pages buried many clicks from the homepage are crawled less often and signal lower ' +
      'importance to search engines, suppressing how well they rank.',
    howToFix:
      'Flatten the architecture: surface important pages within a few clicks via category hubs, ' +
      'breadcrumbs, and contextual internal links.',
    expectedImpact: 'More frequent crawling and stronger importance signals for deep pages.',
    docLink: `${GSC}/crawling-indexing/links-crawlable`,
    impact: 2,
    effort: 3,
  },
  'index.signal-conflict': {
    whyItMatters:
      'Contradictory indexation directives (e.g. a noindex page that is also canonical, or a ' +
      'canonical pointing at a blocked URL) confuse search engines, which may resolve them ' +
      'unpredictably and drop the page.',
    howToFix:
      'Resolve the conflict so all signals agree: a page is either indexable (index + ' +
      'self-canonical) or intentionally excluded (noindex, no conflicting canonical).',
    expectedImpact: 'Removes indexing ambiguity so the intended directive is honored.',
    docLink: `${GSC}/crawling-indexing/robots-meta-tag`,
    impact: 4,
    effort: 2,
  },
  'index.soft-404': {
    whyItMatters:
      'A soft-404 returns 200 OK for a not-found/empty page, so search engines may index thin or ' +
      'error content and waste crawl budget revisiting it.',
    howToFix:
      'Return a real 404 (or 410) status for genuinely not-found pages, or add substantive ' +
      'content if the page should exist and rank.',
    expectedImpact: 'Stops thin/error pages from being indexed; reclaims crawl budget.',
    docLink: `${GSC}/crawling-indexing/http-network-errors`,
    impact: 3,
    effort: 2,
  },

  // ── pagination.* ──────────────────────────────────────────────────────────
  'pagination.rel': {
    whyItMatters:
      'Broken or non-reciprocal rel=next/prev on a paginated series can leave deep pages ' +
      'undiscovered and confuse crawlers about how the sequence fits together.',
    howToFix:
      'Ensure each page in the series links to the correct next/prev URLs reciprocally, and that ' +
      'every page in the sequence is reachable.',
    snippet: '<link rel="next" href="/blog?page=3"><link rel="prev" href="/blog?page=1">',
    expectedImpact: 'Improves discovery and crawl of deep paginated content.',
    docLink: `${GSC}/specialty/ecommerce/pagination-and-incremental-page-loading`,
    impact: 2,
    effort: 2,
  },

  // ── i18n.* ──────────────────────────────────────────────────────────────
  'i18n.hreflang': {
    whyItMatters:
      'Non-reciprocal or invalid hreflang annotations break language/region targeting, so the ' +
      'wrong localized page can be served to a user and duplicate-content issues across locales ' +
      'go unresolved.',
    howToFix:
      'Add reciprocal hreflang return tags between every locale variant and use valid BCP-47 ' +
      'language(-region) codes; include a self-referencing hreflang on each page.',
    snippet: '<link rel="alternate" hreflang="uk-UA" href="https://example.com/uk/">',
    expectedImpact:
      'Correct localized page served per audience; resolves cross-locale duplication.',
    docLink: `${GSC}/specialty/international/localized-versions`,
    impact: 3,
    effort: 3,
  },

  // ── image.* ────────────────────────────────────────────────────────────────
  'image.alt-title': {
    whyItMatters:
      'Images missing alt text are invisible to screen readers and to image search, losing both ' +
      'accessibility and a discovery channel; alt text also adds on-page topical context.',
    howToFix:
      'Add concise, descriptive alt text to every meaningful image; use empty alt="" only for ' +
      'purely decorative images.',
    snippet: '<img src="/gym-floor.jpg" alt="Olimp Strong main training floor">',
    expectedImpact: 'Improves accessibility, image-search visibility, and on-page context.',
    docLink: `${GSC}/appearance/google-images`,
    impact: 2,
    effort: 2,
  },
  'image.broken': {
    whyItMatters:
      'Broken images (4xx/5xx) hurt the user experience, can break layout, and signal ' +
      'unmaintained content; they also lose any image-search opportunity.',
    howToFix: 'Fix the image URL/source or remove the broken <img> reference.',
    expectedImpact: 'Restores visual content and image-search eligibility.',
    docLink: `${GSC}/appearance/google-images`,
    impact: 2,
    effort: 2,
  },

  // ── perf.* ────────────────────────────────────────────────────────────────
  'perf.lcp': {
    whyItMatters:
      'Largest Contentful Paint measures how fast the main content renders. A slow LCP is a Core ' +
      'Web Vitals failure that worsens user experience and is a confirmed ranking signal.',
    howToFix:
      'Optimize the LCP element: preload the hero image/font, serve right-sized WebP/AVIF images, ' +
      'reduce render-blocking CSS/JS, and improve server response time.',
    expectedImpact: 'Passing LCP improves UX and the page-experience ranking signal.',
    docLink: 'https://web.dev/articles/optimize-lcp',
    impact: 4,
    effort: 4,
  },
  'perf.cls-inp': {
    whyItMatters:
      'Cumulative Layout Shift and Interaction to Next Paint capture visual stability and ' +
      'responsiveness. Failing either is a Core Web Vitals miss that frustrates users and is a ' +
      'ranking signal.',
    howToFix:
      'For CLS, set explicit width/height on media and reserve space for dynamic content; for INP, ' +
      'break up long JS tasks and defer non-critical scripts.',
    expectedImpact: 'Passing CLS/INP improves UX and the page-experience ranking signal.',
    docLink: 'https://web.dev/articles/optimize-cls',
    impact: 3,
    effort: 4,
  },
  'perf.psi-usability': {
    whyItMatters:
      'PageSpeed Insights usability/best-practice flags (render-blocking resources, oversized ' +
      'images, unused CSS) slow the page and degrade the user and crawl experience.',
    howToFix:
      'Address the flagged opportunities: defer/inline critical CSS, compress and lazy-load ' +
      'images, remove unused CSS/JS, and enable text compression.',
    expectedImpact: 'Faster pages and improved Lighthouse/PSI scores.',
    docLink: 'https://web.dev/explore/fast',
    impact: 3,
    effort: 4,
  },
  'perf.lab-score': {
    whyItMatters:
      'A low Lighthouse lab performance score indicates the page is slow under controlled ' +
      'conditions, which usually tracks with poor field Core Web Vitals and weaker page experience.',
    howToFix:
      'Improve the Lighthouse performance score: reduce render-blocking resources, optimize ' +
      'images and JavaScript, and cut main-thread work.',
    expectedImpact: 'Higher lab score, generally tracking better field CWV and UX.',
    docLink: 'https://web.dev/explore/fast',
    impact: 3,
    effort: 4,
  },

  // ── meta.opengraph (Open Graph / Twitter Card) ──────────────────────────────
  'meta.opengraph': {
    whyItMatters:
      'Open Graph and Twitter Card tags control the title, description, and image shown when a ' +
      'page is shared on social platforms and chat apps. Missing or invalid tags produce ugly, ' +
      'low-context preview cards that depress click-through from social referral traffic.',
    howToFix:
      'Add og:title, og:description, og:image, og:url and og:type to each page’s <head>, plus a ' +
      'twitter:card (summary_large_image for rich previews). Use an absolute https image URL ≥ ' +
      '1200×630.',
    snippet:
      '<meta property="og:title" content="Best Gym in Kyiv"><meta property="og:image" content="https://example.com/preview.jpg"><meta name="twitter:card" content="summary_large_image">',
    expectedImpact: 'Richer social preview cards and higher click-through on shared links.',
    docLink: 'https://developers.facebook.com/docs/sharing/webmasters/',
    impact: 2,
    effort: 1,
  },

  // ── schema.* (Structured data / JSON-LD) ────────────────────────────────────
  'schema.missing': {
    whyItMatters:
      'Without Schema.org structured data, search engines must infer page meaning from prose and ' +
      'the page is ineligible for rich results (review stars, FAQs, breadcrumbs, business cards), ' +
      'losing SERP real estate to competitors that mark up their content.',
    howToFix:
      'Add JSON-LD structured data appropriate to the page type — Organization/LocalBusiness ' +
      'site-wide, plus BreadcrumbList, Product, Article, or FAQPage where they apply.',
    snippet: '<script type="application/ld+json">{ "@context":"https://schema.org","@type":"Organization" }</script>',
    expectedImpact: 'Eligibility for rich results and clearer entity understanding.',
    docLink: `${GSC}/appearance/structured-data/intro-structured-data`,
    impact: 3,
    effort: 3,
  },
  'schema.invalid': {
    whyItMatters:
      'JSON-LD that fails to parse is ignored entirely by search engines, so any rich-result ' +
      'eligibility the markup was meant to provide is silently lost.',
    howToFix:
      'Fix the JSON syntax error (trailing commas, unescaped quotes, malformed nesting) so the ' +
      'block parses, then validate with the Rich Results Test.',
    expectedImpact: 'Restores the structured data so it can drive rich results again.',
    docLink: `${GSC}/appearance/structured-data/intro-structured-data`,
    impact: 3,
    effort: 2,
  },
  'schema.incomplete': {
    whyItMatters:
      'Structured data missing required or recommended properties is often disqualified from rich ' +
      'results — the markup parses but Google rejects it for the enhanced SERP feature.',
    howToFix:
      'Add the missing required/recommended properties for the declared @type (consult the rich ' +
      'result feature guide for that type) and re-test.',
    expectedImpact: 'Brings the markup up to rich-result eligibility thresholds.',
    docLink: `${GSC}/appearance/structured-data/intro-structured-data`,
    impact: 2,
    effort: 2,
  },
  'schema.localbusiness': {
    whyItMatters:
      'For a local business, LocalBusiness structured data with consistent NAP (name, address, ' +
      'phone), geo coordinates, and opening hours powers the knowledge panel and local-pack ' +
      'eligibility; missing or inconsistent NAP weakens local ranking and trust.',
    howToFix:
      'Add LocalBusiness JSON-LD with name, address (PostalAddress), telephone, geo, openingHours, ' +
      'and url; keep the NAP identical to Google Business Profile and on-page footer.',
    snippet:
      '<script type="application/ld+json">{ "@context":"https://schema.org","@type":"LocalBusiness","name":"Olimp Strong","telephone":"+380…" }</script>',
    expectedImpact: 'Stronger local-pack/knowledge-panel eligibility and NAP trust.',
    docLink: `${GSC}/appearance/structured-data/local-business`,
    impact: 3,
    effort: 3,
  },

  // ── robots.* (robots.txt) ───────────────────────────────────────────────────
  'robots.blocks-important': {
    whyItMatters:
      'A robots.txt rule that disallows the whole site, important sections, or CSS/JS assets can ' +
      'de-index real pages or block Google from rendering them — one bad line can remove a site ' +
      'from search. An unreachable robots.txt is treated as "disallow everything".',
    howToFix:
      'Remove or narrow Disallow rules that cover indexable pages; never block CSS/JS needed to ' +
      'render the page; ensure robots.txt returns 200 and declares the Sitemap: directive.',
    snippet: 'User-agent: *\nAllow: /\nSitemap: https://example.com/sitemap.xml',
    expectedImpact: 'Restores crawlability/indexability of unintentionally blocked content.',
    docLink: `${GSC}/crawling-indexing/robots/intro`,
    impact: 5,
    effort: 1,
  },

  // ── sitemap.* (XML sitemap) ─────────────────────────────────────────────────
  'sitemap.invalid': {
    whyItMatters:
      'A malformed or oversized XML sitemap can be rejected wholesale by search engines, so none ' +
      'of the listed URLs benefit from the faster, more complete discovery a sitemap provides.',
    howToFix:
      'Fix the XML so it is well-formed and within limits (≤ 50,000 URLs / 50MB uncompressed per ' +
      'file; split into a sitemap index if larger), then resubmit in Search Console.',
    expectedImpact: 'A valid sitemap restores reliable discovery of listed URLs.',
    docLink: `${GSC}/crawling-indexing/sitemaps/build-sitemap`,
    impact: 3,
    effort: 2,
  },
  'sitemap.url-not-200': {
    whyItMatters:
      'URLs listed in the sitemap that return non-200 statuses (404, 301, 5xx) waste crawl budget ' +
      'and signal a stale, low-quality sitemap, eroding trust in the rest of the file.',
    howToFix:
      'Keep the sitemap in sync with live, canonical, 200-OK URLs only — remove redirected, ' +
      'broken, or non-canonical entries.',
    expectedImpact: 'A clean sitemap focuses crawl budget on real, indexable pages.',
    docLink: `${GSC}/crawling-indexing/sitemaps/build-sitemap`,
    impact: 2,
    effort: 2,
  },
  'sitemap.noindex-url': {
    whyItMatters:
      'Listing a noindex (or non-self-canonical) URL in the sitemap sends search engines a ' +
      'contradictory signal — "discover and index this" vs. "do not index this" — which wastes ' +
      'crawl budget and muddies indexing intent.',
    howToFix:
      'Include only indexable, self-canonical URLs in the sitemap; drop any URL that is noindex or ' +
      'canonicalizes elsewhere.',
    expectedImpact: 'Removes conflicting indexing signals and tightens crawl focus.',
    docLink: `${GSC}/crawling-indexing/sitemaps/build-sitemap`,
    impact: 2,
    effort: 2,
  },

  // ── links.external-redirect ────────────────────────────────────────────────
  'links.external-redirect': {
    whyItMatters:
      'Outbound links that resolve through a 3xx redirect add an extra round-trip for users and ' +
      'crawlers and can point at content the destination has since moved. They are lower-impact ' +
      'than broken links but signal stale references.',
    howToFix: 'Update the link to point directly at the redirect target (the final URL).',
    expectedImpact: 'Removes a needless hop on outbound navigation; keeps references current.',
    docLink: `${GSC}/crawling-indexing/301-redirects`,
    impact: 1,
    effort: 1,
  },

  // ── image.oversized ────────────────────────────────────────────────────────
  'image.oversized': {
    whyItMatters:
      'Oversized image files are the most common cause of slow LCP and poor Core Web Vitals: every ' +
      'extra kilobyte delays render and wastes the visitor’s bandwidth, especially on mobile.',
    howToFix:
      'Compress the image and serve it at the displayed size; use responsive srcset so smaller ' +
      'viewports download smaller files, and prefer modern formats (WebP/AVIF).',
    expectedImpact: 'Faster LCP and page load; lower bandwidth; better mobile experience.',
    docLink: 'https://web.dev/articles/optimize-lcp',
    impact: 3,
    effort: 3,
  },

  // ── image.legacy-format ────────────────────────────────────────────────────
  'image.legacy-format': {
    whyItMatters:
      'Legacy raster formats (JPEG/PNG/GIF) are typically 25–50% larger than the equivalent WebP or ' +
      'AVIF, inflating page weight and slowing LCP for no visual benefit.',
    howToFix:
      'Serve next-gen formats (WebP or AVIF) with a <picture> fallback, or enable automatic format ' +
      'negotiation at your CDN/image service.',
    snippet:
      '<picture><source srcset="/hero.avif" type="image/avif"><img src="/hero.jpg" alt="…"></picture>',
    expectedImpact: 'Smaller image transfers and faster LCP with identical visual quality.',
    docLink: 'https://web.dev/articles/serve-images-webp',
    impact: 2,
    effort: 3,
  },

  // ── image.no-dimensions ────────────────────────────────────────────────────
  'image.no-dimensions': {
    whyItMatters:
      'An <img> without intrinsic width/height gives the browser no space to reserve, so content ' +
      'jumps as the image loads — a direct cause of Cumulative Layout Shift (CLS) and the PSI ' +
      'unsized-images flag.',
    howToFix:
      'Add explicit width and height attributes (or a CSS aspect-ratio) to every <img> so the ' +
      'browser can reserve layout space before the image loads.',
    snippet: '<img src="/hero.jpg" width="1200" height="630" alt="…">',
    expectedImpact: 'Eliminates image-driven layout shift; improves CLS.',
    docLink: 'https://web.dev/articles/optimize-cls',
    impact: 2,
    effort: 2,
  },

  // ── image.responsive ───────────────────────────────────────────────────────
  'image.responsive': {
    whyItMatters:
      'A large image served without srcset forces every device — including small phones — to ' +
      'download the same full-size file, wasting bandwidth and slowing LCP on the viewports that ' +
      'can least afford it.',
    howToFix:
      'Provide a srcset with multiple widths plus a sizes attribute so the browser picks the ' +
      'smallest file that fits the layout.',
    snippet:
      '<img src="/hero-800.jpg" srcset="/hero-400.jpg 400w, /hero-800.jpg 800w" sizes="100vw" alt="…">',
    expectedImpact: 'Right-sized image downloads per device; faster mobile LCP.',
    docLink: 'https://web.dev/articles/serve-responsive-images',
    impact: 2,
    effort: 3,
  },

  // ── image.lazy-loading ─────────────────────────────────────────────────────
  'image.lazy-loading': {
    whyItMatters:
      'Below-the-fold images that load eagerly compete with the hero/LCP element for bandwidth and ' +
      'delay first render. Native lazy-loading defers them until they are about to enter the ' +
      'viewport.',
    howToFix:
      'Add loading="lazy" to images that start below the fold; keep the LCP / above-the-fold image ' +
      'eager so it is not delayed.',
    snippet: '<img src="/gallery-7.jpg" loading="lazy" width="600" height="400" alt="…">',
    expectedImpact: 'Less bandwidth contention at load; faster initial render.',
    docLink: 'https://web.dev/articles/browser-level-image-lazy-loading',
    impact: 1,
    effort: 1,
  },

  // ── image.alt-quality ──────────────────────────────────────────────────────
  'image.alt-quality': {
    whyItMatters:
      'Alt text that is just the filename, excessively long, or a keyword-stuffed comma list gives ' +
      'screen-reader users and image search no useful description and can read as manipulative.',
    howToFix:
      'Write concise, natural-language alt that describes what the image shows in context; avoid ' +
      'filenames, keyword lists, and very long sentences.',
    snippet: '<img src="/floor.jpg" alt="Main training floor at Olimp Strong gym">',
    expectedImpact: 'Better accessibility and image-search relevance; cleaner on-page context.',
    docLink: `${GSC}/appearance/google-images`,
    impact: 1,
    effort: 2,
  },

  // ── content.* (feature 08) ──────────────────────────────────────────────
  'content.headings-hierarchy': {
    whyItMatters:
      'A logical heading outline (one H1, no skipped levels, no empty headings) is both an ' +
      'accessibility (WCAG) signal and a content-structure signal search engines use to understand ' +
      'a page. Skips and missing/duplicate H1s muddy that structure.',
    howToFix:
      'Use exactly one H1, then nest H2→H3 without skipping levels; never leave a heading empty or ' +
      'use headings purely for styling.',
    snippet: '<h1>Page topic</h1><h2>Section</h2><h3>Sub-section</h3>',
    expectedImpact: 'Clearer document structure for crawlers and screen readers.',
    docLink: `${GSC}/appearance/structured-data`,
    impact: 2,
    effort: 2,
  },
  'content.thin': {
    whyItMatters:
      'Pages with very little content rarely satisfy search intent, seldom rank, and dilute crawl ' +
      'budget across the site.',
    howToFix:
      'Expand thin pages with substantive, original content that fully answers the query, or ' +
      'consolidate/noindex pages that cannot justify standalone value.',
    expectedImpact: 'Higher-quality indexable pages; better crawl-budget allocation.',
    docLink: `${GSC}/fundamentals/creating-helpful-content`,
    impact: 3,
    effort: 3,
  },
  'index.lang-viewport': {
    whyItMatters:
      'A missing <html lang> hurts internationalization and accessibility, a missing charset risks ' +
      'mojibake, and a missing viewport breaks mobile rendering — a direct mobile-usability signal.',
    howToFix:
      'Declare <html lang="…">, a <meta charset="utf-8">, and a responsive ' +
      '<meta name="viewport" content="width=device-width, initial-scale=1"> on every page.',
    snippet:
      '<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">',
    expectedImpact: 'Correct rendering and language/accessibility signals across devices.',
    docLink: `${GSC}/specialty/international/localized-versions`,
    impact: 2,
    effort: 1,
  },
  'dupe.near-content': {
    whyItMatters:
      'Near-duplicate pages (boilerplate templates differing by a few words) compete for the same ' +
      'queries and split ranking signals even though their content hashes differ, so exact-dup ' +
      'detection misses them.',
    howToFix:
      'Differentiate near-duplicate pages with genuinely distinct content, or consolidate them under ' +
      'one canonical URL when they serve the same intent.',
    snippet: '<link rel="canonical" href="https://example.com/the-one-true-url">',
    expectedImpact: 'Consolidates ranking signals; reduces template-driven duplication.',
    docLink: `${GSC}/crawling-indexing/consolidate-duplicate-urls`,
    impact: 2,
    effort: 3,
  },

  // ── security.* (feature 11) ─────────────────────────────────────────────
  'security.mixed-content': {
    whyItMatters:
      'An HTTPS page that loads HTTP sub-resources triggers a mixed-content warning, downgrades the ' +
      'padlock, and is often blocked outright by browsers — breaking the page and eroding trust.',
    howToFix:
      'Serve every sub-resource (scripts, styles, fonts, iframes, media) over HTTPS; update absolute ' +
      'http:// references and prefer protocol-relative or https:// URLs.',
    snippet: '<script src="https://cdn.example.com/app.js"></script>',
    expectedImpact: 'Restores a secure padlock and prevents browser-blocked resources.',
    docLink: 'https://web.dev/articles/fixing-mixed-content',
    impact: 4,
    effort: 2,
  },
  'security.https': {
    whyItMatters:
      'HTTPS is a confirmed (light) ranking signal and a hard trust requirement. A page served over ' +
      'plaintext HTTP is marked "Not secure" and exposes users to tampering.',
    howToFix:
      'Serve the site over HTTPS with a valid certificate and 301-redirect every http:// URL to its ' +
      'https:// equivalent.',
    snippet: 'RewriteRule ^ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]',
    expectedImpact: 'Secure transport, the page-experience HTTPS signal, and user trust.',
    docLink: `${GSC}/crawling-indexing/https`,
    impact: 4,
    effort: 2,
  },
  'security.hsts': {
    whyItMatters:
      'Without HSTS, the first request to a host can still be made over insecure HTTP, leaving a ' +
      'downgrade/SSL-strip window even when the site supports HTTPS.',
    howToFix:
      'Add a Strict-Transport-Security response header (e.g. max-age=63072000; includeSubDomains) ' +
      'on HTTPS responses.',
    snippet: 'Strict-Transport-Security: max-age=63072000; includeSubDomains',
    expectedImpact: 'Forces HTTPS for the host, closing the downgrade window.',
    docLink: 'https://developer.mozilla.org/docs/Web/HTTP/Headers/Strict-Transport-Security',
    impact: 1,
    effort: 1,
  },
  'security.headers': {
    whyItMatters:
      'Missing X-Content-Type-Options: nosniff allows MIME-sniffing attacks, and a missing ' +
      'Content-Security-Policy leaves the page without a baseline XSS/content-injection defense — ' +
      'both weaken the trust/quality profile of the site.',
    howToFix:
      'Send X-Content-Type-Options: nosniff and a Content-Security-Policy header tuned to the ' +
      'resources the page actually loads.',
    snippet: "X-Content-Type-Options: nosniff\nContent-Security-Policy: default-src 'self'",
    expectedImpact: 'Baseline hardening against MIME-sniffing and content injection.',
    docLink: 'https://developer.mozilla.org/docs/Web/HTTP/Headers/Content-Security-Policy',
    impact: 1,
    effort: 2,
  },
  'security.cert': {
    whyItMatters:
      'An expired or invalid TLS certificate makes browsers block the page with a full-screen ' +
      'security interstitial, instantly destroying traffic and trust.',
    howToFix:
      'Renew the certificate before expiry (automate via ACME/Let’s Encrypt) and ensure the full ' +
      'chain and host name are valid.',
    expectedImpact: 'Prevents browser security interstitials; keeps the site reachable.',
    docLink: `${GSC}/crawling-indexing/https`,
    impact: 5,
    effort: 1,
  },

  // ── mobile.* (feature 11) ───────────────────────────────────────────────
  'mobile.viewport': {
    whyItMatters:
      'Without a responsive viewport meta (width=device-width), or with pinned scaling ' +
      '(user-scalable=no / maximum-scale=1), pages render at desktop width on phones and block ' +
      'pinch-zoom — a direct mobile-usability and accessibility failure.',
    howToFix:
      'Add <meta name="viewport" content="width=device-width, initial-scale=1"> and remove any ' +
      'user-scalable=no / maximum-scale pinning.',
    snippet: '<meta name="viewport" content="width=device-width, initial-scale=1">',
    expectedImpact: 'Correct responsive rendering and zoom on mobile devices.',
    docLink: 'https://web.dev/articles/responsive-web-design-basics',
    impact: 3,
    effort: 1,
  },
  'mobile.usability': {
    whyItMatters:
      'Illegibly small fonts and fixed-width containers wider than the screen force horizontal ' +
      'scrolling and squinting on phones — the fixable root causes behind PSI mobile-usability flags.',
    howToFix:
      'Use relative/responsive font sizes ≥ 12px and fluid widths (%/max-width) instead of fixed ' +
      'pixel widths so content reflows to the viewport.',
    expectedImpact: 'Legible, reflowing mobile layouts; fewer PSI usability flags.',
    docLink: 'https://web.dev/articles/responsive-web-design-basics',
    impact: 2,
    effort: 3,
  },

  // ── page.* (feature 11, P3) ─────────────────────────────────────────────
  'page.weight': {
    whyItMatters:
      'Pages that ship too many bytes or too many requests load slowly, hurting LCP and Core Web ' +
      'Vitals — especially on mobile networks.',
    howToFix:
      'Cut total page weight: compress and right-size images, defer/split JS, remove unused CSS, and ' +
      'reduce the number of separate resource requests.',
    expectedImpact: 'Faster loads and better Core Web Vitals.',
    docLink: 'https://web.dev/explore/fast',
    impact: 2,
    effort: 4,
  },
};

/**
 * Optional per-`ruleId` overrides layered over the family entry. Empty for now;
 * the lookup falls back to the family entry. Kept as a seam so a specific rule
 * can carry sharper guidance than its family default without restructuring.
 */
export const REMEDIATION_BY_RULE_ID: Record<string, Partial<Remediation>> = {};

/**
 * Look up the remediation for a `ruleId`: the family entry merged with any
 * per-ruleId override. Returns `undefined` when no family entry exists (the
 * coverage test guarantees this never happens for a live registry rule).
 */
export function remediationFor(ruleId: string): Remediation | undefined {
  const family = ruleId.split('.').slice(0, 2).join('.');
  const base = REMEDIATION[family];
  if (!base) return undefined;
  const override = REMEDIATION_BY_RULE_ID[ruleId];
  return override ? { ...base, ...override } : base;
}

/**
 * Look up the remediation by `ruleFamily` directly (used by the action plan,
 * which already groups by family). Returns `undefined` for an unmapped family.
 */
export function remediationForFamily(family: string): Remediation | undefined {
  return REMEDIATION[family];
}
