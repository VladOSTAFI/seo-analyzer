import type { Confidence } from '../analyze/rule.types';
import type { Cell, FindingRow, ReportSection, SheetRow } from './report.types';

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
 * also carries `severity` (so the engine can color-code) immediately followed
 * by `confidence` (so the reader can see how trustworthy each row is).
 * Builders MAY emit extra keys not declared here — the engine overflows them
 * into a `details` column (no data loss), so columns list the PRIMARY fields
 * only.
 *
 * Conditional sections:
 *   - `links.external-flag` / "External Links" sheet — only included when
 *     `RULE_EXTERNAL_FLAG_ENABLED` is truthy (mirrors rule.registry.ts exactly).
 *
 * ── coverage check (30 ruleIds when external-flag is OFF, 31 when ON) ────────
 *   Redirects        : links.internal-redirect, links.redirect-chain
 *   Broken Links     : links.broken-internal, links.broken-external
 *   External Links   : links.external-flag (conditional)
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
 *   Performance      : perf.lcp, perf.cls-inp, perf.psi-usability, perf.lab-score
 *   Meta Templates   : meta.title.template, meta.description.template, meta.h1.template
 * ────────────────────────────────────────────────────────────────────────────
 */

// Mirrors rule.registry.ts: external-flag is opt-in (very noisy at low severity).
const _externalFlagRaw = (process.env.RULE_EXTERNAL_FLAG_ENABLED ?? '').toLowerCase().trim();
const externalFlagEnabled =
  _externalFlagRaw === 'true' ||
  _externalFlagRaw === '1' ||
  _externalFlagRaw === 'yes' ||
  _externalFlagRaw === 'on';

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

// ── confidence helpers ─────────────────────────────────────────────────────

/**
 * Confidence rank: lower number = lower confidence (less trustworthy).
 * Used to pick the WEAKEST (minimum) confidence across a group of findings.
 * A group is only as trustworthy as its weakest member.
 */
const CONFIDENCE_RANK: Record<Confidence, number> = {
  high: 2,
  medium: 1,
  low: 0,
};

/**
 * Return the minimum (least trustworthy) confidence in a group of findings.
 * Falls back to `'high'` for an empty group (defensive; callers always pass
 * non-empty groups).
 */
function minConfidence(findings: FindingRow[]): Confidence {
  let min: Confidence = 'high';
  for (const f of findings) {
    if (CONFIDENCE_RANK[f.confidence] < CONFIDENCE_RANK[min]) {
      min = f.confidence;
    }
  }
  return min;
}

// ── H1 family rollup helper (Item 3) ──────────────────────────────────────

/**
 * Rule family = first two dotted segments (e.g. 'meta.h1', 'perf.psi').
 * Used for both the H1 report-layer rollup (Item 3) and the distinctIssues
 * tally in report.summary.ts (Item 13).
 */
export function ruleFamily(ruleId: string): string {
  const parts = ruleId.split('.');
  return parts.slice(0, 2).join('.');
}

/**
 * Build consolidated H1 rows (Item 3): when multiple meta.h1.* rules fire on
 * the SAME url, fold them into ONE "H1 structure" row per url. Each url gets at
 * most one output row. The `issue` cell is the original ruleTail for
 * single-firing urls, or `'structure'` for multi-firing ones; the `notes` cell
 * collects the sub-reasons.
 *
 * Single-rule urls (the common case) produce exactly 1:1 rows. Two or more H1
 * rules on the same url produce 1 consolidated row — this is purely a
 * display-layer grouping; the raw findings table is UNCHANGED.
 *
 * For grouped rows `confidence` is the MINIMUM confidence across all findings
 * in the group: a group is only as trustworthy as its weakest member.
 */
function buildH1Rows(findings: Parameters<ReportSection['buildRows']>[0]): SheetRow[] {
  const rows: SheetRow[] = [];
  // Group by url — null-url findings use the SITE_WIDE placeholder as the key.
  const byUrl = new Map<string, typeof findings>();
  for (const f of findings) {
    const key = f.url ?? SITE_WIDE;
    const bucket = byUrl.get(key);
    if (bucket) {
      bucket.push(f);
    } else {
      byUrl.set(key, [f]);
    }
  }

  for (const [urlKey, group] of byUrl) {
    // Single finding for this url → straightforward 1:1 projection.
    if (group.length === 1) {
      const f = group[0]!;
      const issue = ruleTail(f.ruleId);
      const h1 = issue === 'multiple' ? joined(f.detail, 'h1s') : str(f.detail, 'h1');
      const count =
        issue === 'duplicate' ? num(f.detail, 'duplicateCount') : num(f.detail, 'count');
      rows.push({
        severity: f.severity,
        confidence: f.confidence,
        url: urlKey,
        issue,
        h1,
        count,
        recommendation:
          issue === 'missing'
            ? 'Add a single <h1>'
            : issue === 'duplicate'
              ? 'Make the H1 unique per page'
              : issue === 'template'
                ? 'Adjust H1 length'
                : 'Keep a single <h1>',
      });
      continue;
    }

    // Multiple H1 rules fired on the same url → consolidated "structure" row.
    // Dominant severity = highest-ranked among the group.
    const SEVERITY_RANK: Record<string, number> = {
      critical: 0,
      high: 1,
      medium: 2,
      low: 3,
      info: 4,
    };
    const dominantSeverity = group.reduce((best, f) => {
      const rank = SEVERITY_RANK[f.severity] ?? 5;
      return rank < (SEVERITY_RANK[best] ?? 5) ? f.severity : best;
    }, group[0]!.severity);

    // Minimum confidence: the group is only as trustworthy as its weakest member.
    const groupConfidence = minConfidence(group);

    // Collect sub-reasons (one per finding).
    const subReasons = group.map((f) => {
      const tail = ruleTail(f.ruleId);
      if (tail === 'multiple') {
        const count = num(f.detail, 'count');
        return count !== null ? `multiple (${count})` : 'multiple';
      }
      if (tail === 'duplicate') {
        const n = num(f.detail, 'duplicateCount');
        return n !== null ? `duplicate (${n} pages)` : 'duplicate';
      }
      return tail; // 'missing', 'template', etc.
    });

    // Best h1 value from the group (first non-null wins).
    let h1: Cell = null;
    for (const f of group) {
      const tail = ruleTail(f.ruleId);
      const candidate = tail === 'multiple' ? joined(f.detail, 'h1s') : str(f.detail, 'h1');
      if (candidate !== null) {
        h1 = candidate;
        break;
      }
    }

    rows.push({
      severity: dominantSeverity,
      confidence: groupConfidence,
      url: urlKey,
      issue: 'structure',
      h1,
      count: null,
      notes: subReasons.join('; '),
      recommendation: 'Fix H1 structure: ensure exactly one unique H1 per page',
    });
  }

  return rows;
}

// ── The EXTERNAL_LINKS section (conditional — matches RULE_EXTERNAL_FLAG_ENABLED) ──

const EXTERNAL_LINKS_SECTION: ReportSection = {
  spec: {
    name: 'External Links',
    description: 'External links missing a nofollow/sponsored/ugc rel token.',
    columns: [
      { header: 'Severity', key: 'severity', width: 10 },
      { header: 'Confidence', key: 'confidence', width: 12 },
      { header: 'Page (source)', key: 'url', width: 60 },
      { header: 'Link href', key: 'href', width: 60 },
      { header: 'rel', key: 'rel', width: 30 },
    ],
  },
  ruleIds: ['links.external-flag'],
  buildRows: (findings): SheetRow[] =>
    findings.map((f) => ({
      severity: f.severity,
      confidence: f.confidence,
      url: f.url ?? SITE_WIDE,
      href: str(f.detail, 'href'),
      rel: joined(f.detail, 'rel'),
    })),
};

export const REPORT_SECTIONS: ReportSection[] = [
  // ── links.* (redirects + broken + conditional external) ───────────────────
  {
    spec: {
      name: 'Redirects',
      description:
        'Internal links pointing to 3xx, and pages resolving through >1 redirect hop / loops.',
      columns: [
        { header: 'Severity', key: 'severity', width: 10 },
        { header: 'Confidence', key: 'confidence', width: 12 },
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
          confidence: f.confidence,
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
        { header: 'Confidence', key: 'confidence', width: 12 },
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
        confidence: f.confidence,
        url: f.url ?? SITE_WIDE,
        href: str(f.detail, 'href'),
        targetStatusCode: num(f.detail, 'targetStatusCode'),
        // 'links.broken-internal' → 'internal'; 'links.broken-external' → 'external'
        linkType: ruleTail(f.ruleId).replace(/^broken-/, ''),
        recommendation: 'Remove or fix link',
      })),
  },
  // Conditional: only when RULE_EXTERNAL_FLAG_ENABLED is truthy (mirrors rule.registry.ts).
  ...(externalFlagEnabled ? [EXTERNAL_LINKS_SECTION] : []),

  // ── meta.* (titles / descriptions / h1) ────────────────────────────────────
  {
    spec: {
      name: 'Titles',
      description: 'Missing, duplicate, or multiple <title> elements.',
      columns: [
        { header: 'Severity', key: 'severity', width: 10 },
        { header: 'Confidence', key: 'confidence', width: 12 },
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
          confidence: f.confidence,
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
        { header: 'Confidence', key: 'confidence', width: 12 },
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
          confidence: f.confidence,
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
      description: 'Missing, duplicate, or multiple <h1> elements — consolidated per page.',
      columns: [
        { header: 'Severity', key: 'severity', width: 10 },
        { header: 'Confidence', key: 'confidence', width: 12 },
        { header: 'Page', key: 'url', width: 60 },
        { header: 'Issue', key: 'issue', width: 14 },
        { header: 'H1', key: 'h1', width: 60 },
        { header: 'Count', key: 'count', width: 10 },
        { header: 'Notes', key: 'notes', width: 50 },
      ],
    },
    ruleIds: ['meta.h1.missing', 'meta.h1.duplicate', 'meta.h1.multiple'],
    // Item 3: H1 rules that fire on the SAME url are consolidated into one row.
    // Different urls each get their own row (still one row per distinct url).
    buildRows: buildH1Rows,
  },

  // ── dupe.* ─────────────────────────────────────────────────────────────────
  {
    spec: {
      name: 'Duplicate Pages',
      description: 'Pages sharing an identical content hash (duplicate bodies).',
      columns: [
        { header: 'Severity', key: 'severity', width: 10 },
        { header: 'Confidence', key: 'confidence', width: 12 },
        { header: 'Page', key: 'url', width: 60 },
        { header: 'Content hash', key: 'contentHash', width: 40 },
        { header: 'Group size', key: 'duplicateCount', width: 12 },
      ],
    },
    ruleIds: ['dupe.content'],
    buildRows: (findings): SheetRow[] =>
      findings.map((f) => ({
        severity: f.severity,
        confidence: f.confidence,
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
        { header: 'Confidence', key: 'confidence', width: 12 },
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
          confidence: f.confidence,
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
        { header: 'Confidence', key: 'confidence', width: 12 },
        { header: 'Page', key: 'url', width: 70 },
        { header: 'Issues', key: 'issues', width: 50 },
      ],
    },
    ruleIds: ['index.url-heuristics'],
    buildRows: (findings): SheetRow[] =>
      findings.map((f) => ({
        severity: f.severity,
        confidence: f.confidence,
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
        { header: 'Confidence', key: 'confidence', width: 12 },
        { header: 'Page', key: 'url', width: 60 },
        { header: 'rel=next', key: 'relNext', width: 60 },
        { header: 'Issue', key: 'issue', width: 24 },
      ],
    },
    ruleIds: ['pagination.rel'],
    buildRows: (findings): SheetRow[] =>
      findings.map((f) => ({
        severity: f.severity,
        confidence: f.confidence,
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
        { header: 'Confidence', key: 'confidence', width: 12 },
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
        confidence: f.confidence,
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
        { header: 'Confidence', key: 'confidence', width: 12 },
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
          confidence: f.confidence,
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
        { header: 'Confidence', key: 'confidence', width: 12 },
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
          confidence: f.confidence,
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
      description: 'Core Web Vitals (LCP/CLS/INP), PSI usability flags, and Lighthouse lab score.',
      columns: [
        { header: 'Severity', key: 'severity', width: 10 },
        { header: 'Confidence', key: 'confidence', width: 12 },
        { header: 'Page', key: 'url', width: 60 },
        { header: 'Strategy', key: 'strategy', width: 10 },
        { header: 'LCP (ms)', key: 'lcpMs', width: 12 },
        { header: 'CLS', key: 'cls', width: 10 },
        { header: 'INP (ms)', key: 'inpMs', width: 12 },
        { header: 'Score', key: 'score', width: 8 },
        { header: 'Flags', key: 'flags', width: 50 },
      ],
    },
    ruleIds: ['perf.lcp', 'perf.cls-inp', 'perf.psi-usability', 'perf.lab-score'],
    buildRows: (findings): SheetRow[] =>
      findings.map((f) => {
        // lcp: { strategy, lcpMs }; cls-inp: { strategy, cls, inpMs, issues[] };
        // psi-usability: { strategy, flags[] }; lab-score: { strategy, score }.
        // 'flags' column carries usability flags OR the cls-inp tripped-metric list.
        const flagsSource = f.detail.flags !== undefined ? 'flags' : 'issues';
        const isLabScore = f.ruleId === 'perf.lab-score';
        return {
          severity: f.severity,
          confidence: f.confidence,
          url: f.url ?? SITE_WIDE,
          strategy: str(f.detail, 'strategy'),
          lcpMs: num(f.detail, 'lcpMs'),
          cls: num(f.detail, 'cls'),
          inpMs: num(f.detail, 'inpMs'),
          score: num(f.detail, 'score'),
          flags: joined(f.detail, flagsSource),
          metric: ruleTail(f.ruleId),
          recommendation: isLabScore
            ? 'Improve Lighthouse performance score: reduce render-blocking resources, optimize images and JavaScript'
            : null,
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
        { header: 'Confidence', key: 'confidence', width: 12 },
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
          confidence: f.confidence,
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
