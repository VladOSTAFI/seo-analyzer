import type { Confidence, Severity } from '../analyze/rule.types';
import type { CoverageManifest, FindingRow } from './report.types';
import { groupByRootCause, type IssueGroup } from './report.summary';
import { RULES } from '../analyze/rule.registry';
import { ruleFamily } from './report.sections';

/**
 * SEO health score (plan 12) — a PURE, deterministic, page-count-normalized,
 * de-duplicated 0–100 score, overall + per category. No ExcelJS / db / fs: plain
 * findings + coverage in, a {@link ScoreResult} out. Unit-tested in isolation
 * (same discipline as report.summary.ts).
 *
 * The score weights over DE-DUPLICATED issue groups (not raw findings) so the
 * 66-row H1 family on one URL contributes ONE penalty. Grouping is single-
 * sourced from {@link groupByRootCause} (shared with the action plan, plan 13).
 */

// ── Constants (changing any is a `formulaVersion` bump, not an ops toggle) ──

/** Penalty points per de-duplicated issue, by dominant severity (plan §3.2). */
export const SEVERITY_WEIGHT: Record<Severity, number> = {
  critical: 10,
  high: 5,
  medium: 2,
  low: 0.5,
  info: 0, // informational; never penalizes (e.g. meta.*.template)
};

/** Confidence damping factor (plan §3.3): low-trust findings penalize less. */
export const CONFIDENCE_FACTOR: Record<Confidence, number> = {
  high: 1.0,
  medium: 0.6,
  low: 0.3,
};

/** The persisted formula version — bump when weights / K / mapping change. */
export const SCORE_FORMULA_VERSION = 1 as const;

/** The five SEO categories the score breaks down into. */
export type ScoreCategoryKey =
  | 'indexability'
  | 'content'
  | 'performance'
  | 'links'
  | 'structuredData';

/**
 * Category → its set of `ruleFamily` prefixes (plan §3.6). A family matches a
 * category iff it `===` an entry or starts with `entry + '.'` (prefix match on
 * the dotted family, so `index` matches `index.canonical` etc.). Structured
 * Data has NO families in Phase 1 (reserved) — it is always `assessed:false`.
 */
export const CATEGORY_FAMILIES: Record<ScoreCategoryKey, string[]> = {
  indexability: ['index', 'mirror', 'dupe', 'pagination', 'i18n'],
  content: ['meta', 'image'],
  performance: ['perf'],
  links: ['links'],
  structuredData: [], // reserved — Phase 2 schema.* rules; always not-assessed in Phase 1
};

/** Human labels for the five categories (Summary / Coverage cross-linking). */
export const CATEGORY_LABELS: Record<ScoreCategoryKey, string> = {
  indexability: 'Indexability',
  content: 'Content',
  performance: 'Performance',
  links: 'Links',
  structuredData: 'Structured Data',
};

/** The ordered category keys (deterministic iteration / rendering). */
export const CATEGORY_KEYS: ScoreCategoryKey[] = [
  'indexability',
  'content',
  'performance',
  'links',
  'structuredData',
];

// ── Output shape (persisted to audits.score + DTO) ──────────────────────────

export interface CategoryScore {
  assessed: boolean;
  score: number | null; // null when !assessed
  distinctIssues: number; // de-duplicated issues in this category
  bySeverity: Record<Severity, number>; // de-duplicated, for the gauge breakdown
}

export interface ScoreResult {
  overall: number; // 0–100
  formulaVersion: typeof SCORE_FORMULA_VERSION;
  categories: Record<ScoreCategoryKey, CategoryScore>;
  inputs: {
    pagesCrawled: number;
    distinctIssues: number;
    penaltyDensity: number;
    decayK: number;
  };
}

// ── Family → category reverse lookup (built once; tested for completeness) ──

/**
 * Resolve a `ruleFamily` to its category key, or `'other'` when unmapped (a
 * future rule before its category is assigned). The `other` bucket contributes
 * to the overall score but is NOT a named category — the registry-coverage test
 * asserts every live family maps to a category or explicit `other` so a new
 * rule can never silently vanish from scoring.
 */
export function categoryForFamily(family: string): ScoreCategoryKey | 'other' {
  for (const key of CATEGORY_KEYS) {
    for (const prefix of CATEGORY_FAMILIES[key]) {
      if (family === prefix || family.startsWith(`${prefix}.`)) return key;
    }
  }
  return 'other';
}

// ── Score band helper (dashboard ring color; thresholds 80 / 50) ────────────

export function scoreBand(n: number): 'good' | 'fair' | 'poor' {
  if (n >= 80) return 'good';
  if (n >= 50) return 'fair';
  return 'poor';
}

// ── Core scoring ────────────────────────────────────────────────────────────

/** Penalty contributed by one de-duplicated issue group (severity × confidence). */
function groupPenalty(group: IssueGroup): number {
  return SEVERITY_WEIGHT[group.severity] * CONFIDENCE_FACTOR[group.confidence];
}

/**
 * Map a raw penalty total + crawl size to a 0–100 score with the saturating
 * exponential-decay curve (plan §3.5): `100 × exp(−K × penaltyDensity)`. Never
 * negative, never > 100, monotonic. `pagesCrawled` is clamped to >= 1.
 */
function scoreFor(groups: IssueGroup[], pagesCrawled: number, decayK: number): number {
  const rawPenalty = groups.reduce((sum, g) => sum + groupPenalty(g), 0);
  const denom = Math.max(1, pagesCrawled);
  const penaltyDensity = rawPenalty / denom;
  return Math.round(100 * Math.exp(-decayK * penaltyDensity));
}

/** Zero-filled per-severity tally over de-duplicated GROUPS (dominant severity). */
function bySeverityOfGroups(groups: IssueGroup[]): Record<Severity, number> {
  const counts: Record<Severity, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    info: 0,
  };
  for (const g of groups) counts[g.severity] += 1;
  return counts;
}

/**
 * Which category keys are "assessable": at least one rule in the category's
 * families exists in the live registry AND was not entirely inert (plan §3.7).
 * Structured Data has no families → never assessable in Phase 1.
 */
function assessableCategories(coverage: CoverageManifest | null): Set<ScoreCategoryKey> {
  const inert = new Set(coverage?.rulesInert ?? []);
  const assessable = new Set<ScoreCategoryKey>();
  for (const rule of RULES) {
    const cat = categoryForFamily(ruleFamily(rule.id));
    if (cat === 'other') continue;
    // A rule counts toward assessability unless it is listed inert. If coverage
    // is null we cannot prove inertness, so any existing rule makes its category
    // assessable (best-effort, never under-reports a real assessment).
    if (coverage === null || !inert.has(rule.id)) {
      assessable.add(cat);
    }
  }
  return assessable;
}

/**
 * Compute the SEO health score (plan 12). `pagesCrawled` is the normalization
 * denominator — when `coverage` is null (older audits) it falls back to the
 * distinct crawled-URL count from the findings (best-effort, §8). PURE.
 */
export function computeScore(
  findings: FindingRow[],
  pagesCrawled: number,
  coverage: CoverageManifest | null,
): ScoreResult {
  const decayK = readDecayK();

  // Best-effort page count: prefer the explicit pagesCrawled, but never let it
  // fall below the distinct crawled-URL count we can observe in the findings.
  const distinctUrls = new Set<string>();
  for (const f of findings) if (f.url) distinctUrls.add(f.url);
  const effectivePages = Math.max(1, pagesCrawled, distinctUrls.size);

  const allGroups = groupByRootCause(findings);

  // Partition groups by category (the `other` bucket counts toward overall but
  // is not a named category).
  const byCategory = new Map<ScoreCategoryKey, IssueGroup[]>();
  for (const key of CATEGORY_KEYS) byCategory.set(key, []);
  for (const g of allGroups) {
    const cat = categoryForFamily(g.family);
    if (cat !== 'other') byCategory.get(cat)!.push(g);
  }

  const assessable = assessableCategories(coverage);

  const categories = {} as Record<ScoreCategoryKey, CategoryScore>;
  for (const key of CATEGORY_KEYS) {
    const groups = byCategory.get(key)!;
    const assessed = assessable.has(key);
    categories[key] = {
      assessed,
      score: assessed ? scoreFor(groups, effectivePages, decayK) : null,
      distinctIssues: groups.length,
      bySeverity: bySeverityOfGroups(groups),
    };
  }

  // Overall is computed over ALL issue groups (NOT a mean of categories) so it
  // reflects true total penalty density (plan §3.6).
  const rawPenalty = allGroups.reduce((sum, g) => sum + groupPenalty(g), 0);
  const penaltyDensity = rawPenalty / effectivePages;
  const overall = scoreFor(allGroups, effectivePages, decayK);

  return {
    overall,
    formulaVersion: SCORE_FORMULA_VERSION,
    categories,
    inputs: {
      pagesCrawled: effectivePages,
      distinctIssues: allGroups.length,
      penaltyDensity,
      decayK,
    },
  };
}

/** The default decay constant K (plan §3.5); env override read at call time. */
export const DEFAULT_DECAY_K = 0.35;

/**
 * Read `SCORE_DECAY_K` from the environment, falling back to the default. Read
 * here (not injected) so the module stays a pure function of its arguments + a
 * single env knob, matching the discipline of the other report-layer constants.
 * Invalid / non-positive values fall back to the default rather than throwing.
 */
function readDecayK(): number {
  const raw = process.env.SCORE_DECAY_K;
  if (raw === undefined || raw === '') return DEFAULT_DECAY_K;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_DECAY_K;
}
