import type { Confidence, Severity } from '../analyze/rule.types';
import type { CoverageManifest, FindingRow } from './report.types';
import { distinctIssueCount, groupByRootCause } from './report.summary';
import { CATEGORY_KEYS, CATEGORY_LABELS, computeScore } from './report.score';

/**
 * Cross-module consistency tests (plans 12/13 §7):
 *  - The Summary's `distinctIssues` is exactly the count of IssueGroups (one
 *    helper, single-sourced).
 *  - Every score `assessed:false` category maps to a label that the Coverage
 *    sheet must render as a "NOT ASSESSED" row (the report.service builder does
 *    this from the same CATEGORY_KEYS list, so the labels line up by construction
 *    — this test pins that invariant).
 */

function f(
  ruleId: string,
  severity: Severity,
  url: string | null = 'https://x.test/p',
  confidence: Confidence = 'high',
): FindingRow {
  return { ruleId, severity, confidence, url, detail: {} };
}

function coverage(pagesCrawled: number): CoverageManifest {
  return {
    pagesCrawled,
    crawlCap: 500,
    capHit: false,
    externalLinks: { total: 0, verified: 0 },
    images: { total: 0, statusEnriched: 0 },
    cwvSource: { field: 0, originFallback: 0, lab: 0 },
    rulesInert: [],
  };
}

describe('distinctIssues / IssueGroup consistency', () => {
  it('distinctIssueCount equals the number of IssueGroups', () => {
    const findings: FindingRow[] = [
      f('meta.h1.missing', 'high', 'https://x.test/a'),
      f('meta.h1.duplicate', 'medium', 'https://x.test/a'),
      f('meta.title.missing', 'high', 'https://x.test/a'),
      f('index.robots', 'critical', 'https://x.test/b'),
      f('mirror.main-mirror', 'high', null),
    ];
    expect(distinctIssueCount(findings)).toBe(groupByRootCause(findings).length);
  });

  it('the score inputs.distinctIssues equals the IssueGroup count', () => {
    const findings: FindingRow[] = [
      f('meta.h1.missing', 'high', 'https://x.test/a'),
      f('index.robots', 'critical', 'https://x.test/b'),
    ];
    const score = computeScore(findings, 20, coverage(20));
    expect(score.inputs.distinctIssues).toBe(groupByRootCause(findings).length);
  });
});

describe('score not-assessed categories ↔ coverage NOT ASSESSED rows', () => {
  it('Structured Data is assessed:false and has a renderable label', () => {
    const score = computeScore([], 20, coverage(20));
    const notAssessed = CATEGORY_KEYS.filter((k) => !score.categories[k].assessed);
    // In Phase 1 only Structured Data is not assessed.
    expect(notAssessed).toEqual(['structuredData']);
    // Every not-assessed key has a human label the Coverage sheet renders.
    for (const k of notAssessed) {
      expect(typeof CATEGORY_LABELS[k]).toBe('string');
      expect(CATEGORY_LABELS[k].length).toBeGreaterThan(0);
    }
  });
});
