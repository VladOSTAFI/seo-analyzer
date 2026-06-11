import type { Severity } from '../analyze/rule.types';
import type {
  ColumnSpec,
  FindingRow,
  ReportContext,
  ReportSection,
  SheetRow,
} from './report.types';
import { ruleFamily } from './report.sections';

/**
 * Phase 5 Summary + catch-all builders (engine-owned, Wave 2A). PURE: plain
 * findings/sections/context in → display rows out. No ExcelJS, no IO — the
 * engine renders these rows into the leftmost "Summary" tab and (when present)
 * an "Other" catch-all tab. Kept pure so the counting logic is unit-tested
 * without a DB or a file.
 */

/** All severities, severity-rank order, zero-filled so every key is always present. */
export const SEVERITY_KEYS: Severity[] = ['critical', 'high', 'medium', 'low', 'info'];

/** A fresh zero-filled per-severity counter. */
export function zeroBySeverity(): Record<Severity, number> {
  return Object.fromEntries(SEVERITY_KEYS.map((s) => [s, 0])) as Record<Severity, number>;
}

/** Tally findings into a zero-filled per-severity map (engine's primary count). */
export function countBySeverity(findings: FindingRow[]): Record<Severity, number> {
  const counts = zeroBySeverity();
  for (const f of findings) {
    if (f.severity in counts) counts[f.severity] += 1;
  }
  return counts;
}

/**
 * Count findings whose confidence is not 'high' (i.e. estimated / unverified).
 * This includes both 'medium' and 'low' confidence findings. Surfaced on the
 * Summary sheet so a reader can see how much of the report is estimated data.
 */
export function countLowConfidence(findings: FindingRow[]): number {
  return findings.filter((f) => f.confidence !== 'high').length;
}

/**
 * Compute the de-duplicated issue count (Item 13).
 *
 * Groups findings by (ruleFamily, rootCauseKey) to collapse:
 *  - H1 family (meta.h1.*): for a given URL all meta.h1.* findings count as ONE
 *    issue (one page has an H1 problem, regardless of how many sub-rules fired).
 *  - Perf rollups (perf.*): each page+strategy combination counts as ONE issue
 *    per rule family, collapsing perf.lcp + perf.cls-inp + perf.lab-score etc. on
 *    the same page into a single "page has a perf issue" entry per URL.
 *  - All other rules: each (ruleFamily, url) pair is ONE distinct issue.
 *
 * "root-cause key" = `url ?? '(site-wide)'`. This ensures two pages with
 * different URLs that both trigger `meta.title.duplicate` count as 2 distinct
 * issues (different pages have different duplicate-title issues).
 *
 * Returns the count of unique (family, rootCauseKey) pairs.
 */
export function distinctIssueCount(findings: FindingRow[]): number {
  const seen = new Set<string>();
  for (const f of findings) {
    const family = ruleFamily(f.ruleId);
    const rootKey = f.url ?? '(site-wide)';
    seen.add(`${family}\0${rootKey}`);
  }
  return seen.size;
}

/** The fixed column spec for the Summary sheet's key/value + table layout. */
export const SUMMARY_COLUMNS: ColumnSpec[] = [
  { header: 'Field', key: 'field', width: 28 },
  { header: 'Value', key: 'value', width: 70 },
  { header: 'Count', key: 'count', width: 12 },
];

/**
 * The fixed column spec for the catch-all "Other" sheet: any finding whose
 * `ruleId` is not claimed by a section lands here verbatim (no data loss).
 */
export const OTHER_COLUMNS: ColumnSpec[] = [
  { header: 'Severity', key: 'severity', width: 10 },
  { header: 'Rule ID', key: 'ruleId', width: 32 },
  { header: 'URL', key: 'url', width: 70 },
  { header: 'Detail', key: 'detail', width: 80 },
];

/** The engine-reserved sheet name for the leftmost summary tab. */
export const SUMMARY_SHEET_NAME = 'Summary';
/** The engine-reserved sheet name for the uncovered-findings catch-all tab. */
export const OTHER_SHEET_NAME = 'Other';

/**
 * Build the Summary sheet rows from the loaded findings + section registry +
 * context. Three stacked blocks, separated by blank rows:
 *
 *  1. Audit metadata: start URL, audit id, status, generated-at, total findings,
 *     the de-duplicated issue count (Item 13), and the low-confidence findings
 *     count (findings where confidence !== 'high').
 *  2. Per-severity table: one row per severity (critical→info) with its count.
 *  3. Per-category table: one row per section (`spec.name`) with its finding
 *     count and dominant severity (highest severity present, blank if none).
 *
 * The `total-findings` value (block 1) is the engine-owned, Agent-B-independent
 * data point the int-spec asserts against. PURE — no IO.
 */
export function buildSummaryRows(
  findings: FindingRow[],
  sections: ReportSection[],
  ctx: ReportContext,
): SheetRow[] {
  const rows: SheetRow[] = [];
  const bySeverity = countBySeverity(findings);
  const distinctIssues = distinctIssueCount(findings);
  const lowConfidenceCount = countLowConfidence(findings);

  // ── Block 1: audit metadata ───────────────────────────────────────────────
  rows.push({ field: 'Start URL', value: ctx.audit.startUrl, count: null });
  rows.push({ field: 'Audit ID', value: ctx.audit.id, count: null });
  rows.push({ field: 'Status', value: ctx.audit.status, count: null });
  rows.push({ field: 'Generated at', value: ctx.generatedAt.toISOString(), count: null });
  rows.push({ field: 'Total findings', value: '', count: findings.length });
  // Item 13: distinct issues = unique (ruleFamily, rootCauseKey) pairs.
  rows.push({ field: 'Distinct issues', value: '', count: distinctIssues });
  // Low-confidence findings: findings where confidence !== 'high' (estimated/unverified).
  rows.push({ field: 'Low-confidence findings', value: '', count: lowConfidenceCount });

  // ── Block 2: per-severity table ───────────────────────────────────────────
  rows.push(blankRow());
  rows.push({ field: 'Severity', value: 'Findings by severity', count: null });
  for (const s of SEVERITY_KEYS) {
    rows.push({ field: s, value: '', count: bySeverity[s] });
  }

  // ── Block 3: per-category table ───────────────────────────────────────────
  rows.push(blankRow());
  rows.push({ field: 'Category', value: 'Findings by category (dominant severity)', count: null });
  const covered = new Set<string>();
  for (const section of sections) {
    const ruleIds = new Set(section.ruleIds);
    for (const id of section.ruleIds) covered.add(id);
    const sectionFindings = findings.filter((f) => ruleIds.has(f.ruleId));
    rows.push({
      field: section.spec.name,
      value: dominantSeverity(sectionFindings) ?? '',
      count: sectionFindings.length,
    });
  }

  // Uncovered findings get their own summary line so the catch-all is visible.
  const uncovered = findings.filter((f) => !covered.has(f.ruleId));
  if (uncovered.length > 0) {
    rows.push({
      field: OTHER_SHEET_NAME,
      value: dominantSeverity(uncovered) ?? '',
      count: uncovered.length,
    });
  }

  return rows;
}

/**
 * Build the catch-all "Other" rows: every finding whose `ruleId` is NOT in
 * `covered`, rendered verbatim (severity, ruleId, url, detail-json). Returns []
 * when everything is covered (the engine then omits the sheet). PURE.
 */
export function buildOtherRows(findings: FindingRow[], covered: Set<string>): SheetRow[] {
  return findings
    .filter((f) => !covered.has(f.ruleId))
    .map((f) => ({
      severity: f.severity,
      ruleId: f.ruleId,
      url: f.url,
      detail: stableJson(f.detail),
    }));
}

/** The highest-rank severity present in `findings`, or `null` when empty. */
function dominantSeverity(findings: FindingRow[]): Severity | null {
  for (const s of SEVERITY_KEYS) {
    if (findings.some((f) => f.severity === s)) return s;
  }
  return null;
}

/** A fully-blank summary row (visual separator between blocks). */
function blankRow(): SheetRow {
  return { field: '', value: '', count: null };
}

/** Deterministic JSON for a detail object (sorted keys → byte-stable output). */
function stableJson(detail: Record<string, unknown>): string {
  const keys = Object.keys(detail).sort();
  const ordered: Record<string, unknown> = {};
  for (const k of keys) ordered[k] = detail[k];
  return JSON.stringify(ordered);
}
