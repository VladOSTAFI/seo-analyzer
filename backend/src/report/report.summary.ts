import type { Confidence, Severity } from '../analyze/rule.types';
import type {
  ColumnSpec,
  FindingRow,
  ReportContext,
  ReportSection,
  SheetRow,
} from './report.types';
import { ruleFamily } from './report.sections';
import type { ScoreResult } from './report.score';
import type { ActionSummary } from './report.actions';

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

// ── Severity / confidence ranking (single-sourced for the dedup grouping) ───

/** Severity rank: lower = more severe. Used to pick the DOMINANT severity. */
const SEVERITY_RANK: Record<Severity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

/** Confidence rank: lower = less trustworthy. Used to pick the MINIMUM confidence. */
const CONFIDENCE_RANK: Record<Confidence, number> = {
  high: 2,
  medium: 1,
  low: 0,
};

/** The site-wide root-cause placeholder key (matches report.sections SITE_WIDE). */
export const SITE_WIDE_KEY = '(site-wide)';

/**
 * One de-duplicated issue: a `(ruleFamily, rootCauseKey)` group of findings that
 * share a single root cause. This is the canonical "what is one issue" unit
 * consumed by BOTH the distinct-issue count / score (plan 12) and the action
 * plan (plan 13) — single-sourced so the headline numbers are provably
 * consistent.
 *
 * - `family` = `ruleFamily(ruleId)` (first two dotted segments).
 * - `rootCauseKey` = `url ?? '(site-wide)'`.
 * - `severity` = the DOMINANT (max) severity across the group's members.
 * - `confidence` = the MINIMUM (weakest) confidence across the group's members
 *   (a group is only as trustworthy as its weakest member).
 */
export interface IssueGroup {
  family: string;
  rootCauseKey: string;
  ruleIds: string[];
  severity: Severity;
  confidence: Confidence;
  findings: FindingRow[];
}

/**
 * Group findings by `(ruleFamily, rootCauseKey)` into de-duplicated issue
 * groups (TD-3 / TD-13). This is the SINGLE SOURCE OF TRUTH for "what is one
 * issue": the H1 family (66 raw findings on one URL) collapses into ONE group,
 * per-page perf rollups collapse per family, and site-wide findings group under
 * the `(site-wide)` key.
 *
 * For each group the dominant (max) severity and minimum (weakest) confidence
 * are precomputed so downstream consumers (score, actions) never re-derive
 * them. Group insertion order follows first-seen finding order, keeping output
 * deterministic for byte-stable snapshots. PURE.
 */
export function groupByRootCause(findings: FindingRow[]): IssueGroup[] {
  const groups = new Map<string, IssueGroup>();
  for (const f of findings) {
    const family = ruleFamily(f.ruleId);
    const rootCauseKey = f.url ?? SITE_WIDE_KEY;
    const key = `${family}\0${rootCauseKey}`;
    const existing = groups.get(key);
    if (existing) {
      existing.findings.push(f);
      if (!existing.ruleIds.includes(f.ruleId)) existing.ruleIds.push(f.ruleId);
      if (SEVERITY_RANK[f.severity] < SEVERITY_RANK[existing.severity]) {
        existing.severity = f.severity;
      }
      if (CONFIDENCE_RANK[f.confidence] < CONFIDENCE_RANK[existing.confidence]) {
        existing.confidence = f.confidence;
      }
    } else {
      groups.set(key, {
        family,
        rootCauseKey,
        ruleIds: [f.ruleId],
        severity: f.severity,
        confidence: f.confidence,
        findings: [f],
      });
    }
  }
  return [...groups.values()];
}

/**
 * Compute the de-duplicated issue count (Item 13). Thin wrapper over
 * {@link groupByRootCause} — the count is simply the number of distinct
 * `(ruleFamily, rootCauseKey)` groups. Kept as a named export so existing
 * callers (Summary sheet, API) need no change.
 */
export function distinctIssueCount(findings: FindingRow[]): number {
  return groupByRootCause(findings).length;
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
 * Extra inputs that let the Summary sheet lead with an executive narrative
 * (plan 13 §3.4): the computed score, the Top-N actions (top-3 wins), and the
 * not-assessed category list. All optional so existing callers/tests that don't
 * pass them keep the original three-block layout.
 */
export interface SummaryExtras {
  score?: ScoreResult | null;
  topActions?: ActionSummary[];
  /** Human labels of score categories that are `assessed:false`. */
  notAssessed?: string[];
}

/**
 * Build the Summary sheet rows from the loaded findings + section registry +
 * context. Stacked blocks, separated by blank rows:
 *
 *  0. (optional) Executive summary narrative: SEO health headline, the
 *     "N distinct issues across M findings" phrasing, the top-3 wins, and the
 *     not-assessed one-liner (plan 13 §3.4). Rendered ONLY when `extras` is
 *     supplied — keeps the legacy three-block layout for callers that omit it.
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
  extras?: SummaryExtras,
): SheetRow[] {
  const rows: SheetRow[] = [];
  const bySeverity = countBySeverity(findings);
  const distinctIssues = distinctIssueCount(findings);
  const lowConfidenceCount = countLowConfidence(findings);

  // ── Block 0: executive summary narrative (optional) ───────────────────────
  if (extras) {
    rows.push({ field: 'Executive summary', value: '', count: null });
    if (extras.score) {
      const band = scoreBandLabel(extras.score.overall);
      rows.push({
        field: 'SEO health score',
        value: `${extras.score.overall} / 100 (${band})`,
        count: null,
      });
    }
    rows.push({
      field: 'Issues',
      value: `${distinctIssues} distinct issues across ${findings.length} findings`,
      count: null,
    });
    const wins = (extras.topActions ?? []).slice(0, 3);
    if (wins.length > 0) {
      rows.push({ field: 'Top wins', value: '', count: null });
      wins.forEach((a, i) => {
        rows.push({ field: `  #${i + 1}`, value: a.title, count: null });
      });
    }
    if (extras.notAssessed && extras.notAssessed.length > 0) {
      rows.push({
        field: 'Not assessed',
        value: extras.notAssessed.join(', '),
        count: null,
      });
    }
    rows.push(blankRow());
  }

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

/** Score-band label for the Summary headline (mirrors report.score.scoreBand). */
function scoreBandLabel(n: number): string {
  if (n >= 80) return 'good';
  if (n >= 50) return 'fair';
  return 'poor';
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
