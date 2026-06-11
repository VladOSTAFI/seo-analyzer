import type { Confidence, Severity } from '../analyze/rule.types';
import type { AuditStatus } from '../audit/audit.repository';
import type { CoverageManifest } from '../report/report.types';

/**
 * Phase 7 REST contract — the FROZEN seam between the read layer
 * (AuditQueryService, Wave 2A) and the HTTP layer (AuditsController, Wave 2B).
 *
 * Dependency-light on purpose: only the severity + status vocabularies are
 * re-used (single-sourced from the rule/repository layers). These are the exact
 * JSON shapes the API serializes — keep them stable so the controller and the
 * query service agree without importing each other.
 */

/** Re-exported so the API layer references one severity vocabulary. */
export type { Severity } from '../analyze/rule.types';
/** Re-exported so the API layer references one confidence vocabulary. */
export type { Confidence } from '../analyze/rule.types';
/** Re-exported so the API layer references one audit-status vocabulary. */
export type { AuditStatus } from '../audit/audit.repository';

/** Zero-filled count of findings per severity (every key always present). */
export type SeverityCounts = Record<Severity, number>;

/**
 * One audit as returned by the list/detail endpoints. Dates are ISO-8601
 * strings (JSON-safe); `failedStage`/`reportPath` are null until set.
 */
export interface AuditDto {
  id: string;
  startUrl: string;
  status: AuditStatus;
  failedStage: string | null;
  reportPath: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * `GET /audits/:id` — an audit plus its finding rollups.
 *
 * `progress` (Item 14) surfaces the live pipeline stage so polling clients can
 * display "Fetching PSI data…" rather than a generic spinner while status stays
 * at `analyzing`.
 *
 * `coverage` (Item 12) surfaces what was assessed vs. skipped.
 *
 * `distinctIssues` (Item 13) is the de-duplicated issue headline count that
 * collapses H1 sub-rules and site-wide perf rollups into unique (ruleFamily,
 * url) pairs so the headline reads "6 issues across 305 findings".
 */
export interface AuditDetailDto extends AuditDto {
  findingsTotal: number;
  bySeverity: SeverityCounts;
  /** Live pipeline stage progress, null until the first stage starts. */
  progress: { stage: string; startedAt: string } | null;
  /** Coverage manifest, null until the pipeline completes. */
  coverage: CoverageManifest | null;
  /** De-duplicated issue count (unique ruleFamily × url pairs). */
  distinctIssues: number;
}

/**
 * One finding as returned by `GET /audits/:id/findings`.
 *
 * `confidence` reflects how directly the signal was measured: `high` = directly
 * observed; `medium`/`low` = estimated or unverified (origin-level CrUX,
 * un-probed external links). Defaults to `'high'` for pre-migration rows.
 */
export interface FindingDto {
  id: string;
  ruleId: string;
  severity: Severity;
  confidence: Confidence;
  url: string | null;
  detail: Record<string, unknown>;
  createdAt: string;
}

/** Generic offset-paginated envelope: the page plus the unfiltered-by-page total. */
export interface Paginated<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

/** Normalized pagination input (validated/clamped before it reaches the query layer). */
export interface PageParams {
  limit: number;
  offset: number;
}

/** Pagination + optional filters for `GET /audits/:id/findings`. */
export interface FindingsQuery extends PageParams {
  severity?: Severity;
  ruleId?: string;
}

/** Default page size when the client omits `limit`. */
export const DEFAULT_LIMIT = 50;
/** Hard ceiling on page size so a client cannot request an unbounded page. */
export const MAX_LIMIT = 200;
