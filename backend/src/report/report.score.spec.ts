import type { Confidence, Severity } from '../analyze/rule.types';
import { RULES } from '../analyze/rule.registry';
import { ruleFamily } from './report.sections';
import type { CoverageManifest, FindingRow } from './report.types';
import { CATEGORY_KEYS, categoryForFamily, computeScore, scoreBand } from './report.score';

/**
 * Pure-fn unit tests for the SEO health score (plan 12 §7). No DB, no ExcelJS.
 */

function f(
  ruleId: string,
  severity: Severity,
  url: string | null = 'https://x.test/p',
  confidence: Confidence = 'high',
): FindingRow {
  return { ruleId, severity, confidence, url, detail: {} };
}

/** A coverage manifest with no inert rules (so every category is assessable). */
function coverage(pagesCrawled: number, rulesInert: string[] = []): CoverageManifest {
  return {
    pagesCrawled,
    scanProfile: 'standard',
    crawlCap: 500,
    capHit: false,
    externalLinks: { total: 0, verified: 0, probed: false },
    images: { total: 0, statusEnriched: 0, probed: false },
    cwvSource: { field: 0, originFallback: 0, lab: 0 },
    rulesInert,
  };
}

describe('report.score computeScore', () => {
  it('empty findings + pagesCrawled=20 → overall 100, every assessed category 100 (incl. Structured Data in Phase 2)', () => {
    const result = computeScore([], 20, coverage(20));
    expect(result.overall).toBe(100);
    expect(result.formulaVersion).toBe(1);
    // Phase 2: schema.* rules make Structured Data assessable like every other category.
    for (const key of CATEGORY_KEYS) {
      expect(result.categories[key].assessed).toBe(true);
      expect(result.categories[key].score).toBe(100);
    }
  });

  it('Structured Data is now an assessable category (Phase 2): a schema finding penalizes it', () => {
    const clean = computeScore([], 20, coverage(20));
    expect(clean.categories.structuredData).toEqual(
      expect.objectContaining({ assessed: true, score: 100 }),
    );

    const withIssue = computeScore(
      [f('schema.missing', 'medium', 'https://x.test/p')],
      20,
      coverage(20),
    );
    expect(withIssue.categories.structuredData.assessed).toBe(true);
    expect(withIssue.categories.structuredData.score).toBeLessThan(100);
  });

  it('one critical on a 10-page crawl scores strictly lower than on a 1000-page crawl (normalization)', () => {
    const finding = [f('index.robots', 'critical')];
    const small = computeScore(finding, 10, coverage(10));
    const large = computeScore(finding, 1000, coverage(1000));
    expect(small.overall).toBeLessThan(large.overall);
  });

  it('the 66-row H1 family on one URL contributes exactly one medium penalty', () => {
    const url = 'https://x.test/page';
    // 66 raw meta.h1.* findings on one URL.
    const h1Findings: FindingRow[] = Array.from({ length: 66 }, (_, i) =>
      f(i % 2 === 0 ? 'meta.h1.missing' : 'meta.h1.duplicate', 'medium', url),
    );
    const h1Score = computeScore(h1Findings, 20, coverage(20));

    // A single medium finding fixture (same family, same url) → one medium penalty.
    const single = computeScore([f('meta.h1.missing', 'medium', url)], 20, coverage(20));

    expect(h1Score.overall).toBe(single.overall);
    expect(h1Score.categories.content.distinctIssues).toBe(1);
  });

  it('confidence damping: a low-confidence high finding penalizes less than a high-confidence one', () => {
    const high = computeScore(
      [f('index.robots', 'high', 'https://x.test/a', 'high')],
      20,
      coverage(20),
    );
    const low = computeScore(
      [f('index.robots', 'high', 'https://x.test/a', 'low')],
      20,
      coverage(20),
    );
    // Lower penalty → higher (better) score.
    expect(low.overall).toBeGreaterThan(high.overall);
  });

  it('info findings (templates) leave the score at 100', () => {
    const result = computeScore(
      [
        f('meta.title.template', 'info', 'https://x.test/a'),
        f('meta.h1.template', 'info', 'https://x.test/b'),
      ],
      20,
      coverage(20),
    );
    expect(result.overall).toBe(100);
    expect(result.categories.content.score).toBe(100);
  });

  it('overall equals scoring over the union of category groups (not the mean of category scores)', () => {
    // Mix of categories so a mean would diverge from the union score.
    const findings = [
      f('index.robots', 'critical', 'https://x.test/a'), // indexability
      f('meta.title.missing', 'high', 'https://x.test/b'), // content
      f('perf.lcp', 'high', 'https://x.test/c'), // performance
    ];
    const result = computeScore(findings, 50, coverage(50));

    // Mean of assessed category scores.
    const assessed = CATEGORY_KEYS.map((k) => result.categories[k]).filter((c) => c.assessed);
    const mean = assessed.reduce((s, c) => s + (c.score ?? 0), 0) / assessed.length;
    // The union-based overall should NOT equal the simple mean here.
    expect(result.overall).not.toBe(Math.round(mean));
    // And it must be within [0,100].
    expect(result.overall).toBeGreaterThanOrEqual(0);
    expect(result.overall).toBeLessThanOrEqual(100);
  });

  it('score is never < 0 or > 100 and is monotonic in penalty', () => {
    const clean = computeScore([], 20, coverage(20));
    const oneIssue = computeScore([f('index.robots', 'medium')], 20, coverage(20));
    const manyIssues = computeScore(
      Array.from({ length: 30 }, (_, i) => f('index.robots', 'critical', `https://x.test/${i}`)),
      20,
      coverage(20),
    );
    expect(clean.overall).toBe(100);
    expect(oneIssue.overall).toBeLessThan(clean.overall);
    expect(manyIssues.overall).toBeLessThan(oneIssue.overall);
    expect(manyIssues.overall).toBeGreaterThanOrEqual(0);
  });

  it('falls back to distinct crawled URLs when coverage is null', () => {
    const findings = [
      f('index.robots', 'high', 'https://x.test/a'),
      f('meta.title.missing', 'high', 'https://x.test/b'),
    ];
    const result = computeScore(findings, 0, null);
    // pagesCrawled fell back to the 2 distinct urls.
    expect(result.inputs.pagesCrawled).toBeGreaterThanOrEqual(2);
  });
});

describe('scoreBand', () => {
  it('maps thresholds 80 / 50 to good / fair / poor', () => {
    expect(scoreBand(100)).toBe('good');
    expect(scoreBand(80)).toBe('good');
    expect(scoreBand(79)).toBe('fair');
    expect(scoreBand(50)).toBe('fair');
    expect(scoreBand(49)).toBe('poor');
    expect(scoreBand(0)).toBe('poor');
  });
});

describe('registry → category coverage invariant', () => {
  it('every live registry rule family maps to a category or the explicit other bucket', () => {
    const families = new Set(RULES.map((r) => ruleFamily(r.id)));
    const allowed = new Set([...CATEGORY_KEYS, 'other']);
    for (const family of families) {
      const cat = categoryForFamily(family);
      expect(allowed.has(cat)).toBe(true);
    }
  });

  it('no live registry rule family lands in the other bucket (all are categorized in Phase 1)', () => {
    // Loud-fail invariant: a new rule family without a category mapping is a bug.
    const families = [...new Set(RULES.map((r) => ruleFamily(r.id)))];
    const orphaned = families.filter((fam) => categoryForFamily(fam) === 'other');
    expect(orphaned).toEqual([]);
  });
});
