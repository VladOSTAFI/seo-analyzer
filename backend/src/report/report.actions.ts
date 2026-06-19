import type { Severity } from '../analyze/rule.types';
import type { FindingRow } from './report.types';
import { groupByRootCause, type IssueGroup } from './report.summary';
import type { Remediation } from './report.remediation';
import { remediationForFamily } from './report.remediation';

/**
 * Prioritized action plan (plan 13 §3.1–3.2) — PURE: no ExcelJS / db / fs.
 *
 * An ACTION is one level above an {@link IssueGroup}: all groups of the SAME
 * `ruleFamily` collapse into ONE action whose `prevalence` is the count of
 * distinct affected root causes (pages, or 1 for a site-wide-only family). So
 * `meta.h1.*` firing on 22 URLs is ONE action with prevalence 22, not 22 rows.
 * Actions are ranked by `impact × effortMultiplier × log2(1 + prevalence)`.
 */

/** Human action title per family, falling back to a generic phrasing. */
const ACTION_TITLES: Record<string, string> = {
  'mirror.main-mirror': 'Redirect host/scheme mirrors to one canonical origin',
  'mirror.trailing-slash': 'Standardize trailing-slash URLs to one form',
  'links.internal-redirect': 'Point internal links directly at final URLs',
  'links.redirect-chain': 'Collapse internal redirect chains',
  'links.broken-internal': 'Fix broken internal links',
  'links.broken-external': 'Fix or remove broken external links',
  'links.external-flag': 'Add rel hints to unqualified external links',
  'links.anchor-quality': 'Improve weak/generic internal anchor text',
  'links.internal-nofollow': 'Remove nofollow from internal links',
  'meta.title': 'Fix page <title> tags (missing/duplicate/multiple)',
  'meta.description': 'Fix meta descriptions (missing/duplicate/multiple)',
  'meta.h1': 'Fix sitewide H1 structure',
  'dupe.content': 'Consolidate duplicate-content pages',
  'index.canonical': 'Add self-referential canonical tags',
  'index.robots': 'Remove unintended noindex/robots blocks',
  'index.url-heuristics': 'Clean up non-SEO-friendly URLs',
  'index.orphan-page': 'Add internal links to orphan pages',
  'index.click-depth': 'Surface deep pages closer to the homepage',
  'index.signal-conflict': 'Resolve conflicting indexation signals',
  'index.soft-404': 'Return real 404s for not-found pages',
  'pagination.rel': 'Fix rel=next/prev pagination reciprocity',
  'i18n.hreflang': 'Fix hreflang reciprocity and language codes',
  'image.alt-title': 'Add descriptive alt text to images',
  'image.broken': 'Fix or remove broken images',
  'perf.lcp': 'Improve Largest Contentful Paint (LCP)',
  'perf.cls-inp': 'Improve layout stability (CLS) and responsiveness (INP)',
  'perf.psi-usability': 'Address PageSpeed usability/best-practice flags',
  'perf.lab-score': 'Improve Lighthouse performance score',
};

/** Severity rank for tie-breaking (lower = more severe). */
const SEVERITY_RANK: Record<Severity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

export interface Action {
  id: string; // stable: the ruleFamily
  family: string;
  title: string;
  severity: Severity; // dominant across the action's groups
  prevalence: number; // distinct affected root causes (site-wide → 1)
  affectedUrls: string[]; // capped sample for the sheet
  impact: number; // 1..5 (from remediation catalogue)
  effort: number; // 1..5, lower = easier (from catalogue)
  priorityScore: number; // see priorityScore()
  remediation: Remediation;
}

/**
 * The trimmed Top-N action shape surfaced on the API (plan 13 §3.7). EXACTLY
 * these five fields — a parallel frontend mirror depends on this shape (NO
 * `family` field).
 */
export interface ActionSummary {
  id: string;
  title: string;
  severity: Severity;
  prevalence: number;
  priorityScore: number;
}

/**
 * Priority formula (plan §3.2):
 *   prevalenceWeight = log2(1 + prevalence)   // diminishing returns
 *   effortMultiplier = (6 − effort) / 5        // effort 1 → 1.0, effort 5 → 0.2
 *   priorityScore    = impact × effortMultiplier × prevalenceWeight
 */
export function priorityScore(impact: number, effort: number, prevalence: number): number {
  const prevalenceWeight = Math.log2(1 + Math.max(0, prevalence));
  const effortMultiplier = (6 - effort) / 5;
  return impact * effortMultiplier * prevalenceWeight;
}

/** Dominant (max) severity across a set of issue groups. */
function dominantSeverity(groups: IssueGroup[]): Severity {
  let best: Severity = 'info';
  for (const g of groups) {
    if (SEVERITY_RANK[g.severity] < SEVERITY_RANK[best]) best = g.severity;
  }
  return best;
}

/**
 * Build the prioritized action list from raw findings. Groups by root cause
 * (shared helper, single-sourced), then collapses groups of the same family
 * into one action with a prevalence = distinct affected root causes. PURE.
 *
 * Families with no remediation entry are skipped (the coverage test guarantees
 * every live family has one, so this only guards against synthetic test input).
 *
 * @param affectedUrlsSample max affected-URL sample retained per action.
 */
export function buildActions(findings: FindingRow[], affectedUrlsSample = 50): Action[] {
  const groups = groupByRootCause(findings);

  // Collapse groups by family into one action each, preserving first-seen order.
  const byFamily = new Map<string, IssueGroup[]>();
  for (const g of groups) {
    const bucket = byFamily.get(g.family);
    if (bucket) bucket.push(g);
    else byFamily.set(g.family, [g]);
  }

  const actions: Action[] = [];
  for (const [family, familyGroups] of byFamily) {
    const remediation = remediationForFamily(family);
    if (!remediation) continue; // synthetic/unmapped family — skip (real ones always map)

    // Prevalence = distinct affected root causes (urls + the site-wide bucket).
    const rootCauses = new Set(familyGroups.map((g) => g.rootCauseKey));
    const prevalence = rootCauses.size;

    // Affected-URL sample (capped): real urls in first-seen order, deduped.
    const urls: string[] = [];
    const seenUrls = new Set<string>();
    for (const g of familyGroups) {
      for (const f of g.findings) {
        if (f.url && !seenUrls.has(f.url)) {
          seenUrls.add(f.url);
          if (urls.length < affectedUrlsSample) urls.push(f.url);
        }
      }
    }

    const severity = dominantSeverity(familyGroups);
    const score = priorityScore(remediation.impact, remediation.effort, prevalence);

    actions.push({
      id: family,
      family,
      title: ACTION_TITLES[family] ?? `Fix ${family} issues`,
      severity,
      prevalence,
      affectedUrls: urls,
      impact: remediation.impact,
      effort: remediation.effort,
      priorityScore: score,
      remediation,
    });
  }

  // Sort by priorityScore desc, ties broken by severity rank then prevalence.
  return sortActions(actions);
}

/** Sort actions by priorityScore desc, tie-broken by severity then prevalence desc. */
function sortActions(actions: Action[]): Action[] {
  return [...actions].sort((a, b) => {
    if (b.priorityScore !== a.priorityScore) return b.priorityScore - a.priorityScore;
    if (SEVERITY_RANK[a.severity] !== SEVERITY_RANK[b.severity]) {
      return SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    }
    return b.prevalence - a.prevalence;
  });
}

/**
 * The top `n` actions (the "Top fixes" list), already sorted by buildActions.
 * Returns at most `n`, tie-broken by severity then prevalence (the input sort).
 */
export function topActions(actions: Action[], n: number): Action[] {
  return actions.slice(0, Math.max(0, n));
}

/** Trim an Action to the API {@link ActionSummary} shape (exactly five fields). */
export function toActionSummary(a: Action): ActionSummary {
  return {
    id: a.id,
    title: a.title,
    severity: a.severity,
    prevalence: a.prevalence,
    priorityScore: a.priorityScore,
  };
}
