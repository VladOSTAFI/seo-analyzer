/**
 * Single source of truth for the SEO Audit backend contract.
 *
 * These types mirror `backend/src/api/api.types.ts` + `backend/src/auth/auth.types.ts`
 * EXACTLY. Downstream phases (4–5) import from here so a backend contract change
 * is a one-file edit. Do not add front-end-only shapes to this module.
 */

// ── Severity ────────────────────────────────────────────────────────────────

export type Severity = "critical" | "high" | "medium" | "low" | "info";

export const SEVERITIES: Severity[] = [
  "critical",
  "high",
  "medium",
  "low",
  "info",
];

export type SeverityCounts = Record<Severity, number>;

// ── Audit status ────────────────────────────────────────────────────────────

export type AuditStatus =
  | "created"
  | "crawling"
  | "enriching"
  | "analyzing"
  | "reporting"
  | "done"
  | "failed";

/** Terminal statuses stop the dashboard's polling loop (Phase 5). */
export const isTerminal = (s: AuditStatus): boolean =>
  s === "done" || s === "failed";

// ── Audit DTOs ──────────────────────────────────────────────────────────────

export interface AuditDto {
  id: string;
  startUrl: string;
  status: AuditStatus;
  failedStage: string | null;
  reportPath: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuditDetailDto extends AuditDto {
  findingsTotal: number;
  bySeverity: SeverityCounts;
}

export interface FindingDto {
  id: string;
  ruleId: string;
  severity: Severity;
  url: string | null;
  detail: Record<string, unknown>;
  createdAt: string;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

// ── Auth ────────────────────────────────────────────────────────────────────

export type Role = "user" | "admin";

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthUser {
  id: string;
  email: string;
  role: Role;
  tokenVersion: number;
}

// ── Pagination defaults (mirror backend) ────────────────────────────────────

export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 200;
