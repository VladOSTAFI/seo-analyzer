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
