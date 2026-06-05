import type { Severity } from "@/lib/api/types";

/**
 * Rule catalogue — the single source of truth that turns a raw backend
 * `ruleId` (e.g. `meta.title.duplicate`) into rich, user-facing copy for the
 * findings view.
 *
 * The 33 ids + severities here mirror `backend/docs/ANALYSIS_RULES.md` EXACTLY
 * (the id is the join key between the backend finding and this copy). Keep them
 * in sync: a typo silently drops a rule to the humanized fallback.
 *
 * Copy is written for non-technical site owners — plain language, jargon-light,
 * each field 1–2 sentences:
 *   - `whatItFlags`  — what we found, in plain terms.
 *   - `whyItMatters` — the SEO impact, why they should care.
 *   - `howToFix`     — concrete, actionable remediation.
 */

export interface RuleInfo {
  /** Canonical ruleId, e.g. `meta.title.duplicate`. The join key. */
  id: string;
  /** Human-readable title, e.g. "Duplicate page titles". */
  title: string;
  /** Family / category label, e.g. "Metadata", "Links", "Performance". */
  family: string;
  /** Severity (mirrors the backend's stamp for this rule). */
  severity: Severity;
  /** Plain-language "what we found". */
  whatItFlags: string;
  /** SEO impact in plain terms — why it matters. */
  whyItMatters: string;
  /** Actionable remediation guidance. */
  howToFix: string;
}

export const RULE_CATALOG: Record<string, RuleInfo> = {
  // ── Mirror — host/scheme canonicalization ────────────────────────────────
  "mirror.main-mirror": {
    id: "mirror.main-mirror",
    title: "Site loads on multiple addresses",
    family: "Mirror",
    severity: "high",
    whatItFlags:
      "Your site opens under more than one address variant (for example www and non-www, or http and https) instead of redirecting everyone to one canonical version.",
    whyItMatters:
      "Search engines treat each variant as a separate site, splitting your ranking signals and risking duplicate-content penalties. Visitors and links scatter across versions that should be one.",
    howToFix:
      "Pick one preferred version (usually https with or without www) and set a permanent 301 redirect from every other variant to it, so all traffic and link value consolidate onto a single address.",
  },
  "mirror.trailing-slash": {
    id: "mirror.trailing-slash",
    title: "Same page at slash and no-slash URLs",
    family: "Mirror",
    severity: "medium",
    whatItFlags:
      "The same content is reachable at both `/page` and `/page/`, so search engines can see two URLs for one page.",
    whyItMatters:
      "Duplicate URLs dilute ranking signals and waste crawl budget, since engines may index both versions instead of consolidating their value into one.",
    howToFix:
      "Choose one style (with or without the trailing slash) and 301-redirect the other to it consistently across the whole site.",
  },

  // ── Links ────────────────────────────────────────────────────────────────
  "links.broken-internal": {
    id: "links.broken-internal",
    title: "Broken internal links",
    family: "Links",
    severity: "critical",
    whatItFlags:
      "Internal links on your site point to pages that return an error (a 4xx not-found or 5xx server error).",
    whyItMatters:
      "Broken links frustrate visitors and dead-end search crawlers, wasting crawl budget and weakening the flow of ranking value between your pages.",
    howToFix:
      "Update each broken link to point at a working page, or remove it. If the target page moved, link directly to its new URL.",
  },
  "links.internal-redirect": {
    id: "links.internal-redirect",
    title: "Internal links go through a redirect",
    family: "Links",
    severity: "high",
    whatItFlags:
      "Internal links point to URLs that redirect (a 3xx) instead of pointing straight at the final destination.",
    whyItMatters:
      "Every redirect adds load time and leaks a little ranking value. Pointing internal links at the final URL keeps crawling efficient and link signals intact.",
    howToFix:
      "Edit these links to point directly at the final destination URL, skipping the redirect hop.",
  },
  "links.redirect-chain": {
    id: "links.redirect-chain",
    title: "Redirect chains or loops",
    family: "Links",
    severity: "high",
    whatItFlags:
      "Some internal links resolve through more than one redirect in a row, or loop back on themselves.",
    whyItMatters:
      "Chains slow pages down and waste crawl budget; loops can trap crawlers entirely and stop a page from being indexed.",
    howToFix:
      "Collapse each chain so the link points directly to the final URL in one hop, and break any loops by fixing the redirect rule that causes them.",
  },
  "links.broken-external": {
    id: "links.broken-external",
    title: "Broken links to other sites",
    family: "Links",
    severity: "medium",
    whatItFlags:
      "Links from your pages to external websites lead to error pages (4xx or 5xx).",
    whyItMatters:
      "Dead outbound links hurt the visitor experience and signal that your content may be outdated or poorly maintained.",
    howToFix:
      "Update the link to the resource's current address, swap in an equivalent working source, or remove the link if it is no longer relevant.",
  },
  "links.external-flag": {
    id: "links.external-flag",
    title: "Outbound links missing rel attributes",
    family: "Links",
    severity: "low",
    whatItFlags:
      "Some links to external sites are missing a `rel` attribute such as `nofollow` or `sponsored` where one is expected.",
    whyItMatters:
      "Marking paid, user-generated, or untrusted outbound links tells search engines not to pass your ranking value to them, protecting your site's standing.",
    howToFix:
      "Add `rel=\"nofollow\"` to untrusted links and `rel=\"sponsored\"` to paid or affiliate links so search engines treat them correctly.",
  },

  // ── Meta — title / description / H1 ──────────────────────────────────────
  "meta.title.missing": {
    id: "meta.title.missing",
    title: "Missing page title",
    family: "Metadata",
    severity: "high",
    whatItFlags: "The page has no `<title>` tag at all.",
    whyItMatters:
      "The title is the clickable headline in search results and the strongest on-page ranking signal. Without one, search engines guess a title and your listing looks broken.",
    howToFix:
      "Add a unique, descriptive `<title>` of roughly 50–60 characters that summarises the page and includes its main keyword near the front.",
  },
  "meta.title.duplicate": {
    id: "meta.title.duplicate",
    title: "Duplicate page titles",
    family: "Metadata",
    severity: "medium",
    whatItFlags: "The same title text is used across multiple pages.",
    whyItMatters:
      "Identical titles make pages look interchangeable to search engines and confuse users in search results, so the right page may not rank for the right query.",
    howToFix:
      "Give each page a unique, descriptive title that reflects its specific content — templated titles like `Brand | Page` should vary the page portion.",
  },
  "meta.title.multiple": {
    id: "meta.title.multiple",
    title: "More than one title tag",
    family: "Metadata",
    severity: "medium",
    whatItFlags: "The page contains more than one `<title>` tag.",
    whyItMatters:
      "Search engines pick only one title and may choose the wrong one, so the headline shown in results can be unpredictable.",
    howToFix:
      "Keep a single `<title>` tag in the page's `<head>` and remove any extras, often left behind by a template or plugin.",
  },
  "meta.title.template": {
    id: "meta.title.template",
    title: "Title length or keyword guidance",
    family: "Metadata",
    severity: "info",
    whatItFlags:
      "The title is technically present but falls outside best-practice length or keyword guidance (too long, too short, or missing the page's main term).",
    whyItMatters:
      "Titles that are too long get cut off in search results, and ones that are too short or generic waste the chance to attract clicks for your target terms.",
    howToFix:
      "Aim for about 50–60 characters, lead with the page's primary keyword, and make the wording compelling enough to earn the click.",
  },
  "meta.description.missing": {
    id: "meta.description.missing",
    title: "Missing meta description",
    family: "Metadata",
    severity: "medium",
    whatItFlags: "The page has no meta description.",
    whyItMatters:
      "The meta description is the snippet shown beneath your title in search results. Without one, engines auto-generate a snippet that may be unappealing or off-topic, lowering click-through.",
    howToFix:
      "Add a unique meta description of roughly 140–160 characters that summarises the page and gives searchers a reason to click.",
  },
  "meta.description.duplicate": {
    id: "meta.description.duplicate",
    title: "Duplicate meta descriptions",
    family: "Metadata",
    severity: "low",
    whatItFlags: "The same meta description appears on multiple pages.",
    whyItMatters:
      "Repeated descriptions make pages look similar in search results and miss the chance to tailor the pitch for each page's audience.",
    howToFix:
      "Write a distinct description for each page that highlights what makes that specific page worth visiting.",
  },
  "meta.description.multiple": {
    id: "meta.description.multiple",
    title: "More than one meta description",
    family: "Metadata",
    severity: "low",
    whatItFlags:
      "The page has more than one meta description tag.",
    whyItMatters:
      "Search engines may use any one of them, so the snippet shown in results becomes inconsistent and hard to control.",
    howToFix:
      "Keep a single meta description tag per page and remove the duplicates, which usually come from a theme plus a plugin both adding one.",
  },
  "meta.description.template": {
    id: "meta.description.template",
    title: "Meta description guidance",
    family: "Metadata",
    severity: "info",
    whatItFlags:
      "The meta description is present but outside the recommended length or could better reflect the page's content.",
    whyItMatters:
      "Descriptions that are too long get truncated and ones that are too short look thin, both of which reduce how compelling your search snippet appears.",
    howToFix:
      "Keep descriptions around 140–160 characters, written as a clear, benefit-led summary that naturally includes the page's main topic.",
  },
  "meta.h1.missing": {
    id: "meta.h1.missing",
    title: "Missing main heading (H1)",
    family: "Metadata",
    severity: "high",
    whatItFlags: "The page has no `<h1>` heading.",
    whyItMatters:
      "The H1 is the main on-page heading that tells visitors and search engines what the page is about. Without it, the page's topic and structure are unclear.",
    howToFix:
      "Add a single, descriptive `<h1>` near the top of the page that states its main subject, ideally including the primary keyword.",
  },
  "meta.h1.duplicate": {
    id: "meta.h1.duplicate",
    title: "Duplicate main headings across pages",
    family: "Metadata",
    severity: "low",
    whatItFlags: "The same `<h1>` text is used on multiple pages.",
    whyItMatters:
      "When many pages share the same main heading, they look like the same topic to search engines, blurring which page should rank for which subject.",
    howToFix:
      "Give each page an H1 that describes its own specific content rather than reusing a site-wide or template heading.",
  },
  "meta.h1.multiple": {
    id: "meta.h1.multiple",
    title: "More than one main heading (H1)",
    family: "Metadata",
    severity: "medium",
    whatItFlags: "The page has more than one `<h1>` heading.",
    whyItMatters:
      "Multiple top-level headings muddy the page's structure, making it harder for search engines to identify the single main topic.",
    howToFix:
      "Use exactly one `<h1>` for the page's main title and demote the others to `<h2>` or lower to form a clear heading hierarchy.",
  },
  "meta.h1.template": {
    id: "meta.h1.template",
    title: "Main heading guidance",
    family: "Metadata",
    severity: "info",
    whatItFlags:
      "The `<h1>` is present but could be more descriptive or better aligned with the page's title and target keyword.",
    whyItMatters:
      "A clear, keyword-relevant H1 reinforces what the page is about for both readers and search engines, supporting better rankings.",
    howToFix:
      "Make the H1 a concise, descriptive headline that matches the page's intent and echoes the primary term used in the title.",
  },

  // ── Duplicate content ────────────────────────────────────────────────────
  "dupe.content": {
    id: "dupe.content",
    title: "Duplicate page content",
    family: "Duplicate content",
    severity: "high",
    whatItFlags:
      "Multiple pages share essentially identical content (detected by comparing content fingerprints).",
    whyItMatters:
      "Duplicate pages compete with each other and split ranking signals, so search engines may index the wrong version or none of them at full strength.",
    howToFix:
      "Consolidate duplicates into one page, or add a canonical tag pointing the copies at the preferred original so its value is unified.",
  },

  // ── Index / canonical ────────────────────────────────────────────────────
  "index.canonical": {
    id: "index.canonical",
    title: "Canonical tag problem",
    family: "Indexing",
    severity: "high",
    whatItFlags:
      "A page's canonical tag is missing, points to another site, or points somewhere other than itself when it should be self-referencing.",
    whyItMatters:
      "The canonical tag tells search engines which URL is the master copy. A wrong or missing one can hand your ranking value to another page or stop this page being indexed.",
    howToFix:
      "Add a self-referencing canonical tag pointing to this page's own clean URL, unless it is genuinely a duplicate that should point at an on-site original.",
  },
  "index.robots": {
    id: "index.robots",
    title: "Page blocked from search engines",
    family: "Indexing",
    severity: "high",
    whatItFlags:
      "A page that should be findable is marked `noindex` or blocked by robots rules.",
    whyItMatters:
      "Blocked pages cannot appear in search results at all, so any page accidentally hidden this way loses all of its potential traffic.",
    howToFix:
      "Remove the `noindex` directive or the robots.txt block for pages you want indexed, and double-check the rule was not applied site-wide by mistake.",
  },
  "index.url-heuristics": {
    id: "index.url-heuristics",
    title: "URLs are not search-friendly",
    family: "Indexing",
    severity: "low",
    whatItFlags:
      "Some URLs use patterns search engines dislike — uppercase letters, underscores, query parameters, or excessive length.",
    whyItMatters:
      "Clean, readable URLs are easier for people to trust and share and give search engines clearer hints about the page's topic.",
    howToFix:
      "Use short, lowercase URLs with hyphens between words instead of underscores or query strings, and 301-redirect old URLs to the tidy versions.",
  },

  // ── Pagination ───────────────────────────────────────────────────────────
  "pagination.rel": {
    id: "pagination.rel",
    title: "Broken pagination links",
    family: "Pagination",
    severity: "medium",
    whatItFlags:
      "A paginated series (like page 1, 2, 3 of a listing) has missing or broken `rel=next` / `rel=prev` connections.",
    whyItMatters:
      "Clear next/previous signals help search engines understand that paginated pages belong together, improving how the whole sequence is crawled and indexed.",
    howToFix:
      "Make sure each page in the series links cleanly to the correct next and previous pages, with no gaps or links pointing to wrong or error pages.",
  },

  // ── i18n ─────────────────────────────────────────────────────────────────
  "i18n.hreflang": {
    id: "i18n.hreflang",
    title: "Language targeting (hreflang) issues",
    family: "Internationalization",
    severity: "medium",
    whatItFlags:
      "hreflang annotations are non-reciprocal, missing return tags, or use invalid language codes.",
    whyItMatters:
      "hreflang tells search engines which language or region version to show each visitor. When it is broken, the wrong version can surface or none gets the credit.",
    howToFix:
      "Make every hreflang reference point back to its counterparts (reciprocal links), and use valid language-region codes such as `en-us` or `fr-ca`.",
  },

  // ── Images ───────────────────────────────────────────────────────────────
  "image.broken": {
    id: "image.broken",
    title: "Broken images",
    family: "Images",
    severity: "medium",
    whatItFlags:
      "Some images on the page fail to load because their source returns an error (4xx or 5xx).",
    whyItMatters:
      "Missing images break the page's appearance and trust, and can hurt visibility in image search where those assets would otherwise rank.",
    howToFix:
      "Fix or update each broken image source to a working URL, and remove references to images that no longer exist.",
  },
  "image.alt-title": {
    id: "image.alt-title",
    title: "Images missing alt text",
    family: "Images",
    severity: "low",
    whatItFlags:
      "Some images are missing `alt` text (and sometimes a `title`).",
    whyItMatters:
      "Alt text describes images to screen-reader users and to search engines, supporting accessibility and helping your images rank in image search.",
    howToFix:
      "Add concise, descriptive `alt` text to each meaningful image; for purely decorative images, use an empty `alt=\"\"` so assistive tech can skip them.",
  },

  // ── Performance (PageSpeed Insights) ─────────────────────────────────────
  "perf.lcp": {
    id: "perf.lcp",
    title: "Slow main content load (LCP)",
    family: "Performance",
    severity: "high",
    whatItFlags:
      "The Largest Contentful Paint — how long the main content takes to appear — is above the recommended 2.5 second threshold.",
    whyItMatters:
      "Slow-loading pages frustrate visitors and rank worse, since page speed is a confirmed Google ranking factor and part of Core Web Vitals.",
    howToFix:
      "Speed up the largest element (often a hero image or heading) by compressing images, serving modern formats, preloading key assets, and reducing render-blocking scripts.",
  },
  "perf.cls-inp": {
    id: "perf.cls-inp",
    title: "Layout shift or sluggish interaction",
    family: "Performance",
    severity: "high",
    whatItFlags:
      "The page has visual layout shifting (CLS above 0.1) or slow response to taps and clicks (INP above 200ms).",
    whyItMatters:
      "Content jumping around or laggy interactions make a site feel broken, hurting both user experience and your Core Web Vitals ranking signals.",
    howToFix:
      "Reserve space for images, ads, and embeds with fixed width and height, avoid inserting content above existing content, and trim heavy JavaScript that delays interactions.",
  },
  "perf.mobile-indexing": {
    id: "perf.mobile-indexing",
    title: "Mobile usability or indexing issues",
    family: "Performance",
    severity: "high",
    whatItFlags:
      "PageSpeed's mobile analysis found usability or indexing problems on the mobile version of the page.",
    whyItMatters:
      "Google indexes the mobile version of your site first, so mobile problems can directly limit how well the page ranks for everyone.",
    howToFix:
      "Ensure the page is fully responsive, with readable text, tap targets that are not too close together, and a correct viewport meta tag.",
  },
  "perf.psi-usability": {
    id: "perf.psi-usability",
    title: "PageSpeed usability recommendations",
    family: "Performance",
    severity: "medium",
    whatItFlags:
      "PageSpeed Insights flagged critical usability or optimization opportunities for the page.",
    whyItMatters:
      "These recommendations target the issues most slowing the page down or hurting its experience, which feed into both rankings and conversions.",
    howToFix:
      "Work through the listed PageSpeed opportunities — common wins include compressing assets, removing unused code, and eliminating render-blocking resources.",
  },
};

/** Lookup with no fallback. Returns `undefined` for unknown ids. */
export function getRuleInfo(ruleId: string): RuleInfo | undefined {
  return RULE_CATALOG[ruleId];
}

/**
 * Humanize an unknown id into a readable title, e.g.
 * `meta.title.missing` → "Meta · Title · Missing". Used so a rule the backend
 * adds before the frontend knows about it still renders sensibly.
 */
export function humanizeRuleId(ruleId: string): string {
  return ruleId
    .split(".")
    .map((segment) =>
      segment
        .split(/[-_]/)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" "),
    )
    .join(" · ");
}

/**
 * Always returns a renderable `RuleInfo`. Known ids come straight from the
 * catalogue; unknown ids get a humanized title and generic, non-crashing copy
 * (the finding's own `severity` is passed through by the caller via `severity`).
 */
export function resolveRuleInfo(
  ruleId: string,
  severity: Severity,
): RuleInfo {
  const known = RULE_CATALOG[ruleId];
  if (known) return known;
  return {
    id: ruleId,
    title: humanizeRuleId(ruleId),
    family: "Other",
    severity,
    whatItFlags:
      "This check flagged something on the listed pages. See the technical rule id and the per-page details below.",
    whyItMatters:
      "We don't yet have a plain-language summary for this check. The technical id and details should help you or our support team interpret it.",
    howToFix:
      "Review the affected pages and details below, and reach out to support with the rule id if you need help interpreting this finding.",
  };
}

/** Every catalogued rule, in catalogue order — handy for the filter dropdown. */
export const ALL_RULES: RuleInfo[] = Object.values(RULE_CATALOG);
