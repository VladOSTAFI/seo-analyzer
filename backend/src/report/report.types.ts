import type { Confidence, Severity } from '../analyze/rule.types';

/**
 * Phase 5 report contract — the FROZEN seam between the rendering engine
 * (Wave 2A) and the section mappers (Wave 2B).
 *
 * This file is intentionally dependency-free (no ExcelJS import): both Wave-2
 * agents import these types cheaply, and the section builders stay PURE (plain
 * data in → display rows out), with all ExcelJS/formatting/IO owned by the
 * engine. Re-exported `Severity` keeps the severity vocabulary single-sourced
 * from the rule layer.
 */

/** A cell value ExcelJS can write directly (string/number/boolean/blank). */
export type Cell = string | number | boolean | null;

/**
 * One column in a report sheet. `key` is how a {@link SheetRow} addresses this
 * cell; `header` is the rendered column title; `width` (optional) is the column
 * width in Excel character units (the engine applies a default when omitted).
 */
export interface ColumnSpec {
  header: string;
  key: string;
  width?: number;
}

/**
 * Declarative spec for one worksheet (tab).
 *
 * `name` MUST be <=31 chars (the hard Excel sheet-name limit) and unique across
 * all sections — the {@link import('./report.sections').REPORT_SECTIONS}
 * coverage test enforces both. `description` (optional) is a human-readable
 * subtitle the engine MAY render under the sheet title.
 */
export interface SheetSpec {
  name: string;
  /** Optional human-readable description shown under the title (engine may render it). */
  description?: string;
  columns: ColumnSpec[];
}

/**
 * A finding as loaded from the DB for reporting. `detail` is the jsonb column
 * already parsed into a plain object; the section builders read the rule-family
 * specific keys out of it (see each rule's `run` projection).
 *
 * `confidence` reflects how directly the signal was measured: `high` = directly
 * observed (default); `medium`/`low` = estimated or unverified (origin-level
 * CrUX, un-probed external links). Defaults to `'high'` when the DB column is
 * NULL (pre-migration rows).
 */
export interface FindingRow {
  ruleId: string;
  severity: Severity;
  confidence: Confidence;
  url: string | null;
  detail: Record<string, unknown>;
}

/**
 * Lightweight run context handed to every section builder: the audit metadata
 * plus the single generation timestamp (so all sheets stamp the same instant).
 */
export interface ReportContext {
  audit: { id: string; startUrl: string; status: string };
  generatedAt: Date;
}

/**
 * A display row keyed by {@link ColumnSpec.key} → cell value. Keys present here
 * but NOT declared in the sheet's columns are overflowed by the engine into a
 * catch-all `details` column (no data loss), so builders may emit extra context
 * without widening the column spec.
 */
export type SheetRow = Record<string, Cell>;

/**
 * One report section = one worksheet. Mirrors the {@link import('../analyze/rule.registry').RULES}
 * registry: declarative, data-driven, additive.
 *
 * `ruleIds` are the `findings.ruleId` values this sheet renders — the catalogue
 * guarantees each ruleId maps to exactly ONE section (enforced by the coverage
 * test). `buildRows` is PURE: given the already-filtered findings for this
 * section's `ruleIds` (plus context), it returns the display rows. The engine
 * owns ALL ExcelJS: worksheet creation, header/freeze/autofilter/width
 * formatting, severity color coding, the Summary sheet, the catch-all "Other"
 * sheet, and writing the `.xlsx` file.
 */
export interface ReportSection {
  spec: SheetSpec;
  ruleIds: string[];
  buildRows(findings: FindingRow[], ctx: ReportContext): SheetRow[];
}

/**
 * Coverage manifest assembled at the end of runAll (Item 12). Documents what
 * was assessed vs. skipped/absent so silent gaps become explicit statements.
 *
 * Persisted to `audits.coverage` (jsonb) and surfaced on the API detail DTO.
 */
export interface CoverageManifest {
  /** Total pages crawled in this run. */
  pagesCrawled: number;
  /** The configured crawl page cap. */
  crawlCap: number;
  /** Whether the crawl hit the cap (pages === crawlCap). */
  capHit: boolean;
  /** External link counts (crawled vs. verified by live HTTP probe). */
  externalLinks: { total: number; verified: number };
  /** Image counts (total crawled vs. status-enriched). */
  images: { total: number; statusEnriched: number };
  /** How many CWV data points came from each source. */
  cwvSource: { field: number; originFallback: number; lab: number };
  /**
   * Rule IDs from the full registry that produced ZERO findings — meaning either
   * the site is clean for that rule, or the rule did not have sufficient data
   * to fire (e.g. hreflang on a monolingual site).
   */
  rulesInert: string[];
}

/**
 * Result of one {@link import('./report.service').ReportService.generate} run —
 * surfaced for structured logging and the `audit:report` CLI summary line.
 *
 * `reportPath` is the written `.xlsx` path (also persisted to
 * `audits.reportPath`); `sheets` counts the worksheets emitted; `totalFindings`
 * is the number of findings rendered; `bySeverity` is zero-filled across every
 * severity key so the summary always has every key present; `distinctIssues`
 * is the de-duplicated issue count (Item 13) that collapses H1 sub-rules and
 * site-level perf rollups.
 */
export interface ReportSummary {
  reportPath: string;
  sheets: number;
  totalFindings: number;
  bySeverity: Record<Severity, number>;
  /** De-duplicated issue count (unique ruleFamily × url pairs). */
  distinctIssues: number;
}
