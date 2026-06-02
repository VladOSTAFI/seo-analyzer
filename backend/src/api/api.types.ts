import type { Severity } from '../analyze/rule.types';
import type { AuditStatus } from '../audit/audit.repository';

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

/** `GET /audits/:id` — an audit plus its finding rollups. */
export interface AuditDetailDto extends AuditDto {
  findingsTotal: number;
  bySeverity: SeverityCounts;
}

/** One finding as returned by `GET /audits/:id/findings`. */
export interface FindingDto {
  id: string;
  ruleId: string;
  severity: Severity;
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
