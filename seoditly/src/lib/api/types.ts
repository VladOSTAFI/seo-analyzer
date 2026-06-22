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

// ── Confidence ──────────────────────────────────────────────────────────────

/**
 * How directly a finding's signal was measured (mirrors the backend pgEnum):
 * `high` = directly observed; `medium`/`low` = estimated or unverified
 * (origin-level CrUX, un-probed external links).
 */
export type Confidence = "high" | "medium" | "low";

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

// ── Audit profile ─────────────────────────────────────────────────────────────

/**
 * Audit depth for `POST /audits`: `standard` (fast, the default) or `full`
 * (slower — also checks image weight & external links). Mirrors the backend's
 * optional `profile` field; absent → backend defaults to `standard`.
 */
export type AuditProfile = "standard" | "full";

// ── Coverage manifest (Item 12) ──────────────────────────────────────────────

/**
 * Coverage manifest assembled at the end of the pipeline (Item 12). Documents
 * what was assessed vs. skipped/absent so silent gaps become explicit. Mirrors
 * `CoverageManifest` in `backend/src/report/report.types.ts`. Persisted to
 * `audits.coverage` (jsonb) and surfaced on the detail DTO.
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
   * Rule IDs from the full registry that produced ZERO findings — meaning the
   * site is clean for that rule, or the rule lacked sufficient data to fire.
   */
  rulesInert: string[];
}

// ── Health score (Item 12 — new_features/12-seo-health-score.md §3.8) ─────────

/**
 * Overall 0–100 SEO health score plus per-category breakdown. Mirrors
 * `ScoreResult` from `backend/src/report/report.score.ts` (spec §3.8).
 * Persisted to `audits.score` (jsonb) and surfaced on the detail DTO; `null`
 * for older audits / audits not yet scored.
 */
export interface ScoreResult {
  /** Overall health score, 0–100. */
  overall: number;
  /** Bumps when weights / decay constant change (trend comparability). */
  formulaVersion: 1;
  categories: {
    indexability: CategoryScore;
    content: CategoryScore;
    performance: CategoryScore;
    links: CategoryScore;
    /** `{ assessed:false, score:null }` in Phase 1 (no `schema.*` rules yet). */
    structuredData: CategoryScore;
  };
  /** Transparency inputs for gauge tooltips ("X issues across N pages"). */
  inputs: {
    pagesCrawled: number;
    distinctIssues: number;
    penaltyDensity: number;
    decayK: number;
  };
}

/**
 * One category's score. A category whose rules are all inert/absent reads
 * `{ assessed:false, score:null }` — NEVER `0` or `100` (spec §3.7).
 */
export interface CategoryScore {
  assessed: boolean;
  /** `null` when `!assessed`. */
  score: number | null;
  /** De-duplicated issues in this category. */
  distinctIssues: number;
  /** De-duplicated severity tally, for the gauge breakdown. */
  bySeverity: SeverityCounts;
}

/** The five named categories on {@link ScoreResult.categories}. */
export type ScoreCategoryKey =
  | "indexability"
  | "content"
  | "performance"
  | "links"
  | "structuredData";

/** Ordered category keys for stable rendering of the category bars. */
export const SCORE_CATEGORY_KEYS: ScoreCategoryKey[] = [
  "indexability",
  "content",
  "performance",
  "links",
  "structuredData",
];

/** Discrete band for a 0–100 score: good ≥ 80, fair ≥ 50, poor < 50 (spec §3.9). */
export type ScoreBand = "good" | "fair" | "poor";

/**
 * Maps a 0–100 score to its band, matching the plan's thresholds (§3.9) so the
 * dashboard never re-derives the cutoffs. Mirrors backend `scoreBand`.
 */
export const scoreBand = (n: number): ScoreBand =>
  n >= 80 ? "good" : n >= 50 ? "fair" : "poor";

// ── Prioritized action plan (Item 13 — §3.7 topActions) ───────────────────────

/**
 * One entry of the prioritized "Top 10 fixes" list. The trimmed
 * `ActionSummary` carried on `AuditDetailDto.topActions` (spec §3.7): just
 * enough to render the action list without parsing the workbook.
 */
export interface ActionSummary {
  /** Stable action id (family or family + ruleTail). */
  id: string;
  /** Human action title, e.g. "Fix sitewide H1 structure". */
  title: string;
  /** Dominant severity across the action's issue groups. */
  severity: Severity;
  /** Distinct affected pages (site-wide actions = 1). */
  prevalence: number;
  /** impact × effort × prevalence ranking score (higher = fix first). */
  priorityScore: number;
}

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

/**
 * `GET /audits/:id` — an audit plus its finding rollups.
 *
 * `progress` (Item 14) surfaces the live pipeline stage so polling clients can
 * display the current stage rather than a generic spinner while status stays at
 * `analyzing`. `coverage` (Item 12) surfaces what was assessed vs. skipped.
 * `distinctIssues` (Item 13) is the de-duplicated issue headline count.
 *
 * `score` (Item 12) and `topActions` (Item 13) are the Phase-1 report-layer
 * additions: the overall/per-category health score and the prioritized
 * "Top 10 fixes". `score` is `null` for audits not yet scored.
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
  /** Overall + per-category health score, null until the report stage scores it. */
  score: ScoreResult | null;
  /** Prioritized "Top 10 fixes", ordered by priorityScore desc. */
  topActions: ActionSummary[];
}

export interface FindingDto {
  id: string;
  ruleId: string;
  severity: Severity;
  confidence: Confidence;
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
