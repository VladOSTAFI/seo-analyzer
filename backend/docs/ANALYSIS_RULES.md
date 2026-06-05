# SEO Analysis Rules

The complete set of audit checks run by the backend's analyze engine
(`AnalyzeService`), defined in `backend/src/analyze/rule.registry.ts`. Each rule
lives in its own `*.rule.ts` file and is registered as one line in the registry.

- **33 checks** across **9 families**, run in the order below.
- Every finding is stamped with a stable `ruleId` (e.g. `meta.title.duplicate`)
  and a `severity`.
- `ruleId` is the persisted `findings.ruleId` key and the report sheet key; ids
  are unique (enforced by a duplicate-id guard test).

**Severity spread:** 1 critical · 13 high · 9 medium · 6 low · 4 info.

> Adding a check = one new `*.rule.ts` file + one line in `rule.registry.ts`.
> The marketing site mirrors these categories in user-facing copy at
> `seoditly/src/lib/checks.ts` — keep it in sync when the rule set changes.

---

## Mirror — host/scheme canonicalization

| Rule ID | Severity | What it flags |
|---|---|---|
| `mirror.main-mirror` | high | Site reachable on multiple host/scheme variants (www/non-www, http/https) without a canonical redirect |
| `mirror.trailing-slash` | medium | Same content at `/path` and `/path/` (slash duplication) |

## Links

| Rule ID | Severity | What it flags |
|---|---|---|
| `links.broken-internal` | critical | Internal links pointing to 4xx/5xx |
| `links.internal-redirect` | high | Internal links pointing to 3xx (should target the final URL) |
| `links.redirect-chain` | high | Internal links resolving through >1 redirect hop / loops |
| `links.broken-external` | medium | External links to 4xx/5xx |
| `links.external-flag` | low | External links missing `rel="nofollow"`/sponsored where expected |

## Meta — title / description / H1

| Rule ID | Severity | What it flags |
|---|---|---|
| `meta.title.missing` | high | Page has no `<title>` |
| `meta.title.duplicate` | medium | Same title across multiple pages |
| `meta.title.multiple` | medium | Page has more than one `<title>` |
| `meta.title.template` | info | Title length/keyword guidance |
| `meta.description.missing` | medium | No meta description |
| `meta.description.duplicate` | low | Duplicate meta description across pages |
| `meta.description.multiple` | low | Multiple meta descriptions on one page |
| `meta.description.template` | info | Recommended description template |
| `meta.h1.missing` | high | No `<h1>` |
| `meta.h1.duplicate` | low | Duplicate H1 text across pages |
| `meta.h1.multiple` | medium | Multiple `<h1>` on one page |
| `meta.h1.template` | info | H1 guidance |

## Duplicate content

| Rule ID | Severity | What it flags |
|---|---|---|
| `dupe.content` | high | Duplicate pages by content hash |

## Index / canonical

| Rule ID | Severity | What it flags |
|---|---|---|
| `index.canonical` | high | Canonical missing / points off-site / non-self on a canonical page |
| `index.robots` | high | Noindex / robots-blocked pages that should be indexable |
| `index.url-heuristics` | low | Non-SEO-friendly URLs (ЧПУ): uppercase, params, underscores, length |

## Pagination

| Rule ID | Severity | What it flags |
|---|---|---|
| `pagination.rel` | medium | Broken/missing `rel=next/prev` on paginated series |

## i18n

| Rule ID | Severity | What it flags |
|---|---|---|
| `i18n.hreflang` | medium | hreflang non-reciprocal / missing return tags / bad lang codes |

## Images

| Rule ID | Severity | What it flags |
|---|---|---|
| `image.broken` | medium | Images returning 4xx/5xx |
| `image.alt-title` | low | Images missing `alt` (and/or `title`) |

## Performance (PageSpeed Insights)

> These four rules depend on PageSpeed Insights data. Without a `PSI_API_KEY`
> set in `backend/.env`, the performance stage is limited/skipped and these rules
> typically produce no findings.

| Rule ID | Severity | What it flags |
|---|---|---|
| `perf.lcp` | high | LCP above the "good" threshold (>2.5s) |
| `perf.cls-inp` | high | CLS > 0.1 or INP > 200ms |
| `perf.mobile-indexing` | high | Mobile usability / indexing issues from PSI mobile data |
| `perf.psi-usability` | medium | Critical PSI usability/opportunity recommendations |
