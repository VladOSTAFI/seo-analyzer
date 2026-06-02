import type { Cell, ReportSection, SheetRow } from './report.types';

/**
 * The COMPLETE Phase 5 report section registry — one entry per worksheet.
 *
 * Mirrors {@link import('../analyze/rule.registry').RULES}: an explicit, static,
 * data-driven array (NO runtime glob). Each section declares its sheet `name` +
 * `columns` and the `ruleIds` it renders. The catalogue contract is that EVERY
 * `findings.ruleId` maps to exactly ONE section — the union of all
 * `section.ruleIds` must equal the full rule set, with no duplicates. The
 * `report.sections.spec.ts` coverage test enforces that invariant so a Wave-2B
 * mapper can never silently drop a rule.
 *
 * Wave 1 declared the FULL skeleton: real sheet names, real columns (derived
 * from each rule's actual `detail` projection), and STUB `buildRows` returning
 * `[]`. Wave 2B (this revision) fills the `buildRows` bodies — pure projections
 * of the engine-prefiltered findings into display rows keyed to the declared
 * columns. The engine (Wave 2A) owns ExcelJS, formatting, severity coloring,
 * the engine-generated Summary sheet, and the catch-all "Other" sheet.
 *
 * Column conventions: every sheet carries a `url` column; every issue sheet
 * also carries `severity` (so the engine can color-code). Builders MAY emit
 * extra keys not declared here — the engine overflows them into a `details`
 * column (no data loss), so columns list the PRIMARY fields only.
 *
 * ── coverage check (31 ruleIds, each claimed exactly once) ──────────────────
 *   Redirects        : links.internal-redirect, links.redirect-chain
 *   Broken Links     : links.broken-internal, links.broken-external
 *   External Links   : links.external-flag
 *   Titles           : meta.title.missing, meta.title.duplicate, meta.title.multiple
 *   Descriptions     : meta.description.missing, meta.description.duplicate, meta.description.multiple
 *   H1               : meta.h1.missing, meta.h1.duplicate, meta.h1.multiple
 *   Duplicate Pages  : dupe.content
 *   Indexation       : index.canonical, index.robots
 *   URL Heuristics   : index.url-heuristics
 *   Pagination       : pagination.rel
 *   Hreflang         : i18n.hreflang
 *   Images           : image.alt-title, image.broken
 *   Mirrors          : mirror.main-mirror, mirror.trailing-slash
 *   Performance      : perf.lcp, perf.cls-inp, perf.psi-usability, perf.mobile-indexing
 *   Meta Templates   : meta.title.template, meta.description.template, meta.h1.template
 * ────────────────────────────────────────────────────────────────────────────
 */

// ── pure helpers (no IO; Wave-2B owns these) ───────────────────────────────

/** Site-wide / url-less findings render a stable placeholder in the url cell. */
const SITE_WIDE = '(site-wide)';

/** Read `key` from a finding's detail as a string, or null when absent/blank. */
function str(detail: Record<string, unknown>, key: string): Cell {
  const v = detail[key];
  if (v === undefined || v === null) return null;
  if (typeof v === 'string') return v === '' ? null : v;
  return String(v);
}

/** Read `key` as a finite number, or null when absent/non-numeric. */
function num(detail: Record<string, unknown>, key: string): Cell {
  const v = detail[key];
  if (v === undefined || v === null) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Read `key` as a boolean, or null when absent. */
function bool(detail: Record<string, unknown>, key: string): Cell {
  const v = detail[key];
  if (v === undefined || v === null) return null;
  return Boolean(v);
}

/**
 * Read `key` and render it as a comma-joined string cell. Accepts an array
 * (joined with ', '), an already-joined string (normalised so ',' → ', '), or
 * a scalar; returns null when empty/absent. This handles both the array-shaped
 * details (perf flags, url-heuristics issues, robots reason, meta multiples)
 * and the pre-joined string details (i18n.hreflang `issue`).
 */
function joined(detail: Record<string, unknown>, key: string): Cell {
  const v = detail[key];
  if (v === undefined || v === null) return null;
  if (Array.isArray(v)) {
    const parts = v.map((x) => String(x)).filter((s) => s.length > 0);
    return parts.length > 0 ? parts.join(', ') : null;
  }
  if (typeof v === 'string') {
    if (v === '') return null;
    return v
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .join(', ');
  }
  return String(v);
}

/** Last dotted segment of a ruleId, used to derive an `issue`/type label. */
function ruleTail(ruleId: string): string {
  const parts = ruleId.split('.');
  return parts[parts.length - 1] ?? ruleId;
}

export const REPORT_SECTIONS: ReportSection[] = [
  // ── links.* (redirects + broken + external) ────────────────────────────────
  {
    spec: {
      name: 'Redirects',
      description:
        'Internal links pointing to 3xx, and pages resolving through >1 redirect hop / loops.',
      columns: [
        { header: 'Severity', key: 'severity', width: 10 },
        { header: 'Page (source)', key: 'url', width: 60 },
        { header: 'Link href', key: 'href', width: 60 },
        { header: 'Target status', key: 'targetStatusCode', width: 14 },
        { header: 'Hops', key: 'hops', width: 8 },
        { header: 'Loop?', key: 'isLoop', width: 8 },
        { header: 'Recommendation', key: 'recommendation', width: 40 },
      ],
    },
    ruleIds: ['links.internal-redirect', 'links.redirect-chain'],
    buildRows: (findings): SheetRow[] =>
      findings.map((f) => {
        const isChain = f.ruleId === 'links.redirect-chain';
        return {
          severity: f.severity,
          url: f.url ?? SITE_WIDE,
          href: str(f.detail, 'href'),
          targetStatusCode: num(f.detail, 'targetStatusCode'),
          hops: num(f.detail, 'hops'),
          isLoop: bool(f.detail, 'isLoop'),
          recommendation: isChain
            ? 'Collapse the redirect chain; link directly to the final URL'
            : 'Point link to final URL (avoid the 3xx hop)',
        };
      }),
  },
  {
    spec: {
      name: 'Broken Links',
      description: 'Internal/external links whose crawled target returned 4xx/5xx.',
      columns: [
        { header: 'Severity', key: 'severity', width: 10 },
        { header: 'Page (source)', key: 'url', width: 60 },
        { header: 'Link href', key: 'href', width: 60 },
        { header: 'Target status', key: 'targetStatusCode', width: 14 },
        { header: 'Link type', key: 'linkType', width: 12 },
      ],
    },
    ruleIds: ['links.broken-internal', 'links.broken-external'],
    buildRows: (findings): SheetRow[] =>
      findings.map((f) => ({
        severity: f.severity,
        url: f.url ?? SITE_WIDE,
        href: str(f.detail, 'href'),
        targetStatusCode: num(f.detail, 'targetStatusCode'),
        // 'links.broken-internal' → 'internal'; 'links.broken-external' → 'external'
        linkType: ruleTail(f.ruleId).replace(/^broken-/, ''),
        recommendation: 'Remove or fix link',
      })),
  },
  {
    spec: {
      name: 'External Links',
      description: 'External links missing a nofollow/sponsored/ugc rel token.',
      columns: [
        { header: 'Severity', key: 'severity', width: 10 },
        { header: 'Page (source)', key: 'url', width: 60 },
        { header: 'Link href', key: 'href', width: 60 },
        { header: 'rel', key: 'rel', width: 30 },
      ],
    },
    ruleIds: ['links.external-flag'],
    buildRows: (findings): SheetRow[] =>
      findings.map((f) => ({
        severity: f.severity,
        url: f.url ?? SITE_WIDE,
        href: str(f.detail, 'href'),
        rel: joined(f.detail, 'rel'),
      })),
  },

  // ── meta.* (titles / descriptions / h1) ────────────────────────────────────
  {
    spec: {
      name: 'Titles',
      description: 'Missing, duplicate, or multiple <title> elements.',
      columns: [
        { header: 'Severity', key: 'severity', width: 10 },
        { header: 'Page', key: 'url', width: 60 },
        { header: 'Issue', key: 'issue', width: 14 },
        { header: 'Title', key: 'title', width: 60 },
        { header: 'Count', key: 'count', width: 10 },
      ],
    },
    ruleIds: ['meta.title.missing', 'meta.title.duplicate', 'meta.title.multiple'],
    buildRows: (findings): SheetRow[] =>
      findings.map((f) => {
        const issue = ruleTail(f.ruleId); // 'missing' | 'duplicate' | 'multiple'
        // duplicate emits { title, duplicateCount }; multiple emits { titles[], count }.
        const title = issue === 'multiple' ? joined(f.detail, 'titles') : str(f.detail, 'title');
        const count =
          issue === 'duplicate' ? num(f.detail, 'duplicateCount') : num(f.detail, 'count');
        return {
          severity: f.severity,
          url: f.url ?? SITE_WIDE,
          issue,
          title,
          count,
          recommendation:
            issue === 'missing'
              ? 'Add a unique <title>'
              : issue === 'duplicate'
                ? 'Make the title unique per page'
                : 'Keep a single <title>',
        };
      }),
  },
  {
    spec: {
      name: 'Descriptions',
      description: 'Missing, duplicate, or multiple meta descriptions.',
      columns: [
        { header: 'Severity', key: 'severity', width: 10 },
        { header: 'Page', key: 'url', width: 60 },
        { header: 'Issue', key: 'issue', width: 14 },
        { header: 'Description', key: 'description', width: 70 },
        { header: 'Count', key: 'count', width: 10 },
      ],
    },
    ruleIds: [
      'meta.description.missing',
      'meta.description.duplicate',
      'meta.description.multiple',
    ],
    buildRows: (findings): SheetRow[] =>
      findings.map((f) => {
        const issue = ruleTail(f.ruleId);
        const description =
          issue === 'multiple' ? joined(f.detail, 'descriptions') : str(f.detail, 'description');
        const count =
          issue === 'duplicate' ? num(f.detail, 'duplicateCount') : num(f.detail, 'count');
        return {
          severity: f.severity,
          url: f.url ?? SITE_WIDE,
          issue,
          description,
          count,
          recommendation:
            issue === 'missing'
              ? 'Add a meta description'
              : issue === 'duplicate'
                ? 'Make the description unique per page'
                : 'Keep a single meta description',
        };
      }),
  },
  {
    spec: {
      name: 'H1',
      description: 'Missing, duplicate, or multiple <h1> elements.',
      columns: [
        { header: 'Severity', key: 'severity', width: 10 },
        { header: 'Page', key: 'url', width: 60 },
        { header: 'Issue', key: 'issue', width: 14 },
        { header: 'H1', key: 'h1', width: 60 },
        { header: 'Count', key: 'count', width: 10 },
      ],
    },
    ruleIds: ['meta.h1.missing', 'meta.h1.duplicate', 'meta.h1.multiple'],
    buildRows: (findings): SheetRow[] =>
      findings.map((f) => {
        const issue = ruleTail(f.ruleId);
        // duplicate emits { h1, duplicateCount }; multiple emits { h1s[], count }.
        const h1 = issue === 'multiple' ? joined(f.detail, 'h1s') : str(f.detail, 'h1');
        const count =
          issue === 'duplicate' ? num(f.detail, 'duplicateCount') : num(f.detail, 'count');
        return {
          severity: f.severity,
          url: f.url ?? SITE_WIDE,
          issue,
          h1,
          count,
          recommendation:
            issue === 'missing'
              ? 'Add a single <h1>'
              : issue === 'duplicate'
                ? 'Make the H1 unique per page'
                : 'Keep a single <h1>',
        };
      }),
  },

  // ── dupe.* ─────────────────────────────────────────────────────────────────
  {
    spec: {
      name: 'Duplicate Pages',
      description: 'Pages sharing an identical content hash (duplicate bodies).',
      columns: [
        { header: 'Severity', key: 'severity', width: 10 },
        { header: 'Page', key: 'url', width: 60 },
        { header: 'Content hash', key: 'contentHash', width: 40 },
        { header: 'Group size', key: 'duplicateCount', width: 12 },
      ],
    },
    ruleIds: ['dupe.content'],
    buildRows: (findings): SheetRow[] =>
      findings.map((f) => ({
        severity: f.severity,
        url: f.url ?? SITE_WIDE,
        contentHash: str(f.detail, 'contentHash'),
        duplicateCount: num(f.detail, 'duplicateCount'),
        recommendation: 'Canonicalize duplicates to one URL',
      })),
  },

  // ── index.* (canonical + robots; url heuristics separate) ──────────────────
  {
    spec: {
      name: 'Indexation',
      description: 'Canonical missing/non-self, and live pages blocked from indexing.',
      columns: [
        { header: 'Severity', key: 'severity', width: 10 },
        { header: 'Page', key: 'url', width: 60 },
        { header: 'Issue', key: 'issue', width: 18 },
        { header: 'Canonical URL', key: 'canonicalUrl', width: 60 },
        { header: 'Robots reason', key: 'reason', width: 30 },
      ],
    },
    ruleIds: ['index.canonical', 'index.robots'],
    buildRows: (findings): SheetRow[] =>
      findings.map((f) => {
        const isRobots = f.ruleId === 'index.robots';
        // canonical: detail.issue is 'missing'|'non-self'; robots: derive a label.
        const issue = isRobots ? 'noindex/blocked' : str(f.detail, 'issue');
        return {
          severity: f.severity,
          url: f.url ?? SITE_WIDE,
          issue,
          canonicalUrl: str(f.detail, 'canonicalUrl'),
          reason: joined(f.detail, 'reason'),
          recommendation: isRobots
            ? 'Remove the noindex/robots block if the page should rank'
            : 'Set a self-referential canonical',
        };
      }),
  },
  {
    spec: {
      name: 'URL Heuristics',
      description: 'Non-SEO-friendly URLs (ЧПУ): uppercase, underscores, query params, length.',
      columns: [
        { header: 'Severity', key: 'severity', width: 10 },
        { header: 'Page', key: 'url', width: 70 },
        { header: 'Issues', key: 'issues', width: 50 },
      ],
    },
    ruleIds: ['index.url-heuristics'],
    buildRows: (findings): SheetRow[] =>
      findings.map((f) => ({
        severity: f.severity,
        url: f.url ?? SITE_WIDE,
        issues: joined(f.detail, 'issues'),
        recommendation: 'Use lowercase, hyphenated, short, param-free URLs',
      })),
  },

  // ── pagination.* ───────────────────────────────────────────────────────────
  {
    spec: {
      name: 'Pagination',
      description: 'Broken/non-reciprocal rel=next on paginated series.',
      columns: [
        { header: 'Severity', key: 'severity', width: 10 },
        { header: 'Page', key: 'url', width: 60 },
        { header: 'rel=next', key: 'relNext', width: 60 },
        { header: 'Issue', key: 'issue', width: 24 },
      ],
    },
    ruleIds: ['pagination.rel'],
    buildRows: (findings): SheetRow[] =>
      findings.map((f) => ({
        severity: f.severity,
        url: f.url ?? SITE_WIDE,
        relNext: str(f.detail, 'relNext'),
        issue: str(f.detail, 'issue'),
        recommendation: 'Fix rel=next/prev reciprocity across the series',
      })),
  },

  // ── i18n.* ─────────────────────────────────────────────────────────────────
  {
    spec: {
      name: 'Hreflang',
      description: 'hreflang non-reciprocal / invalid lang codes.',
      columns: [
        { header: 'Severity', key: 'severity', width: 10 },
        { header: 'Page', key: 'url', width: 60 },
        { header: 'Lang', key: 'lang', width: 14 },
        { header: 'href', key: 'href', width: 60 },
        { header: 'Issue', key: 'issue', width: 30 },
      ],
    },
    ruleIds: ['i18n.hreflang'],
    buildRows: (findings): SheetRow[] =>
      findings.map((f) => ({
        severity: f.severity,
        url: f.url ?? SITE_WIDE,
        lang: str(f.detail, 'lang'),
        href: str(f.detail, 'href'),
        // detail.issue is a pre-joined string (e.g. 'non-reciprocal,invalid-lang')
        issue: joined(f.detail, 'issue'),
        recommendation: 'Add reciprocal return tags and valid BCP-47 lang codes',
      })),
  },

  // ── image.* ────────────────────────────────────────────────────────────────
  {
    spec: {
      name: 'Images',
      description: 'Images missing alt text, and images returning 4xx/5xx.',
      columns: [
        { header: 'Severity', key: 'severity', width: 10 },
        { header: 'Page', key: 'url', width: 60 },
        { header: 'Image src', key: 'src', width: 60 },
        { header: 'Issue', key: 'issue', width: 16 },
        { header: 'Status', key: 'statusCode', width: 10 },
      ],
    },
    ruleIds: ['image.alt-title', 'image.broken'],
    buildRows: (findings): SheetRow[] =>
      findings.map((f) => {
        const isBroken = f.ruleId === 'image.broken';
        // alt-title: detail.altState is 'missing'|'empty'; broken: a status-based label.
        const issue = isBroken
          ? `broken (${str(f.detail, 'statusCode') ?? '?'})`
          : str(f.detail, 'altState');
        return {
          severity: f.severity,
          url: f.url ?? SITE_WIDE,
          src: str(f.detail, 'src'),
          issue,
          statusCode: num(f.detail, 'statusCode'),
          recommendation: isBroken ? 'Fix or remove the broken image' : 'Add descriptive alt text',
        };
      }),
  },

  // ── mirror.* ───────────────────────────────────────────────────────────────
  {
    spec: {
      name: 'Mirrors',
      description:
        'Site reachable on multiple host/scheme variants, and trailing-slash duplication.',
      columns: [
        { header: 'Severity', key: 'severity', width: 10 },
        { header: 'Page', key: 'url', width: 60 },
        { header: 'Issue', key: 'issue', width: 18 },
        { header: 'Variant / duplicate-of', key: 'variant', width: 60 },
        { header: 'Mirror count', key: 'mirrorCount', width: 12 },
      ],
    },
    ruleIds: ['mirror.main-mirror', 'mirror.trailing-slash'],
    buildRows: (findings): SheetRow[] =>
      findings.map((f) => {
        const isMainMirror = f.ruleId === 'mirror.main-mirror';
        // main-mirror: { variantKey, variants[], mirrorCount }; trailing-slash: { slashUrl, contentHash }.
        const variant = isMainMirror ? joined(f.detail, 'variants') : str(f.detail, 'slashUrl');
        return {
          severity: f.severity,
          url: f.url ?? SITE_WIDE,
          issue: isMainMirror ? 'main-mirror' : 'trailing-slash',
          variant,
          mirrorCount: num(f.detail, 'mirrorCount'),
          recommendation: isMainMirror
            ? 'Redirect mirrors to one canonical origin'
            : 'Redirect to a single trailing-slash form',
        };
      }),
  },

  // ── perf.* ─────────────────────────────────────────────────────────────────
  {
    spec: {
      name: 'Performance',
      description: 'Core Web Vitals (LCP/CLS/INP) and PSI usability / mobile-indexing flags.',
      columns: [
        { header: 'Severity', key: 'severity', width: 10 },
        { header: 'Page', key: 'url', width: 60 },
        { header: 'Strategy', key: 'strategy', width: 10 },
        { header: 'LCP (ms)', key: 'lcpMs', width: 12 },
        { header: 'CLS', key: 'cls', width: 10 },
        { header: 'INP (ms)', key: 'inpMs', width: 12 },
        { header: 'Flags', key: 'flags', width: 50 },
      ],
    },
    ruleIds: ['perf.lcp', 'perf.cls-inp', 'perf.psi-usability', 'perf.mobile-indexing'],
    buildRows: (findings): SheetRow[] =>
      findings.map((f) => {
        // lcp: { strategy, lcpMs }; cls-inp: { strategy, cls, inpMs, issues[] };
        // psi-usability / mobile-indexing: { strategy, flags[] }.
        // 'flags' column carries usability flags OR the cls-inp tripped-metric list.
        const flagsSource = f.detail.flags !== undefined ? 'flags' : 'issues';
        return {
          severity: f.severity,
          url: f.url ?? SITE_WIDE,
          strategy: str(f.detail, 'strategy'),
          lcpMs: num(f.detail, 'lcpMs'),
          cls: num(f.detail, 'cls'),
          inpMs: num(f.detail, 'inpMs'),
          flags: joined(f.detail, flagsSource),
          metric: ruleTail(f.ruleId),
        };
      }),
  },

  // ── meta.*.template (info-severity recommendations) ────────────────────────
  {
    spec: {
      name: 'Meta Templates',
      description: 'Recommended title/description/H1 length templates (info).',
      columns: [
        { header: 'Severity', key: 'severity', width: 10 },
        { header: 'Page', key: 'url', width: 60 },
        { header: 'Element', key: 'element', width: 14 },
        { header: 'Current value', key: 'value', width: 60 },
        { header: 'Length', key: 'length', width: 10 },
        { header: 'Recommendation', key: 'recommendation', width: 16 },
      ],
    },
    ruleIds: ['meta.title.template', 'meta.description.template', 'meta.h1.template'],
    buildRows: (findings): SheetRow[] =>
      findings.map((f) => {
        // ruleId is meta.<element>.template; detail value lives under the element key.
        // title → { title }; description → { description }; h1 → { h1 }.
        const element = f.ruleId.split('.')[1] ?? ''; // 'title' | 'description' | 'h1'
        return {
          severity: f.severity,
          url: f.url ?? SITE_WIDE,
          element,
          value: str(f.detail, element),
          length: num(f.detail, 'length'),
          // detail.recommendation is 'too-short' | 'too-long'.
          recommendation: str(f.detail, 'recommendation'),
        };
      }),
  },
];

/**
 * The union of every section's `ruleIds`. The engine uses this to detect
 * findings whose `ruleId` is NOT claimed by any section and route them to the
 * catch-all "Other" sheet (so nothing is ever silently dropped). The coverage
 * test asserts this set equals the full rule registry with no duplicates.
 */
export function coveredRuleIds(): Set<string> {
  const ids = new Set<string>();
  for (const section of REPORT_SECTIONS) {
    for (const id of section.ruleIds) ids.add(id);
  }
  return ids;
}
