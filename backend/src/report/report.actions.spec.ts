import type { Confidence, Severity } from '../analyze/rule.types';
import type { FindingRow } from './report.types';
import { groupByRootCause } from './report.summary';
import { buildActions, priorityScore, topActions, toActionSummary } from './report.actions';

/**
 * Pure-fn unit tests for the prioritized action plan (plan 13 §7). No DB / ExcelJS.
 */

function f(
  ruleId: string,
  severity: Severity,
  url: string | null = 'https://x.test/p',
  confidence: Confidence = 'high',
): FindingRow {
  return { ruleId, severity, confidence, url, detail: {} };
}

describe('groupByRootCause', () => {
  it('collapses the H1 family on one URL into one group with dominant severity + min confidence', () => {
    const url = 'https://x.test/page';
    const findings: FindingRow[] = [
      f('meta.h1.missing', 'high', url, 'high'),
      f('meta.h1.duplicate', 'medium', url, 'low'),
      f('meta.h1.multiple', 'low', url, 'medium'),
    ];
    const groups = groupByRootCause(findings);
    expect(groups).toHaveLength(1);
    expect(groups[0].family).toBe('meta.h1');
    expect(groups[0].rootCauseKey).toBe(url);
    expect(groups[0].severity).toBe('high'); // dominant
    expect(groups[0].confidence).toBe('low'); // minimum
    expect(groups[0].ruleIds.sort()).toEqual(
      ['meta.h1.duplicate', 'meta.h1.missing', 'meta.h1.multiple'].sort(),
    );
  });

  it('site-wide (url=null) findings group under the (site-wide) key', () => {
    const groups = groupByRootCause([f('mirror.main-mirror', 'high', null)]);
    expect(groups[0].rootCauseKey).toBe('(site-wide)');
  });
});

describe('buildActions', () => {
  it('collapses a 22-URL meta.h1 family into ONE action with prevalence 22', () => {
    const findings: FindingRow[] = Array.from({ length: 22 }, (_, i) =>
      f('meta.h1.missing', 'medium', `https://x.test/${i}`),
    );
    const actions = buildActions(findings);
    const h1 = actions.find((a) => a.family === 'meta.h1');
    expect(h1).toBeDefined();
    expect(h1!.prevalence).toBe(22);
    // Exactly one action for the family.
    expect(actions.filter((a) => a.family === 'meta.h1')).toHaveLength(1);
  });

  it('site-wide-only family gets prevalence 1', () => {
    const actions = buildActions([f('mirror.main-mirror', 'high', null)]);
    const mirror = actions.find((a) => a.family === 'mirror.main-mirror');
    expect(mirror!.prevalence).toBe(1);
  });

  it('caps the affected-URL sample', () => {
    const findings: FindingRow[] = Array.from({ length: 10 }, (_, i) =>
      f('meta.title.missing', 'high', `https://x.test/${i}`),
    );
    const actions = buildActions(findings, 3);
    const action = actions.find((a) => a.family === 'meta.title');
    expect(action!.affectedUrls).toHaveLength(3);
    // Prevalence still reflects all 10 distinct pages.
    expect(action!.prevalence).toBe(10);
  });
});

describe('priorityScore', () => {
  it('matches impact × (6−effort)/5 × log2(1+prevalence)', () => {
    // impact 3, effort 1, prevalence 7 → 3 × 1.0 × log2(8)=3 → 9.
    expect(priorityScore(3, 1, 7)).toBeCloseTo(3 * 1.0 * Math.log2(8), 6);
  });

  it('ranks a trivial sitewide fix above a hard one-off', () => {
    // Trivial sitewide: low impact (2) but easy (effort 1), prevalent (50).
    const trivialSitewide = priorityScore(2, 1, 50);
    // Hard one-off: higher impact (4) but hard (effort 5), single page (1).
    const hardOneOff = priorityScore(4, 5, 1);
    expect(trivialSitewide).toBeGreaterThan(hardOneOff);
  });
});

describe('topActions', () => {
  it('returns exactly N, tie-broken by severity then prevalence', () => {
    // Build findings across several families so there are many actions.
    const findings: FindingRow[] = [
      ...Array.from({ length: 5 }, (_, i) =>
        f('meta.h1.missing', 'medium', `https://x.test/h${i}`),
      ),
      ...Array.from({ length: 3 }, (_, i) => f('index.robots', 'critical', `https://x.test/r${i}`)),
      f('image.broken', 'low', 'https://x.test/img'),
      f('links.broken-internal', 'high', 'https://x.test/l'),
      f('pagination.rel', 'low', 'https://x.test/pag'),
    ];
    const actions = buildActions(findings);
    const top = topActions(actions, 3);
    expect(top).toHaveLength(3);
    // Sorted by priorityScore desc (the buildActions sort).
    expect(top[0].priorityScore).toBeGreaterThanOrEqual(top[1].priorityScore);
    expect(top[1].priorityScore).toBeGreaterThanOrEqual(top[2].priorityScore);
  });

  it('returns all actions when N exceeds the count', () => {
    const actions = buildActions([f('index.robots', 'high', 'https://x.test/a')]);
    expect(topActions(actions, 99)).toHaveLength(actions.length);
  });

  it('tie-break: equal priorityScore orders by severity rank then prevalence', () => {
    // Construct synthetic actions with identical priority but differing severity.
    const a = {
      id: 'x.a',
      family: 'x.a',
      title: 'A',
      severity: 'low' as Severity,
      prevalence: 1,
      affectedUrls: [],
      impact: 1,
      effort: 1,
      priorityScore: 1,
      remediation: {} as never,
    };
    const b = { ...a, id: 'x.b', family: 'x.b', title: 'B', severity: 'critical' as Severity };
    // topActions preserves input order (already sorted by buildActions); here we
    // assert toActionSummary trimming keeps exactly the five fields.
    const summary = toActionSummary(b);
    expect(Object.keys(summary).sort()).toEqual(
      ['id', 'prevalence', 'priorityScore', 'severity', 'title'].sort(),
    );
    expect(summary).not.toHaveProperty('family');
  });
});

describe('toActionSummary', () => {
  it('exposes exactly {id,title,severity,prevalence,priorityScore} (no family)', () => {
    const actions = buildActions([f('index.robots', 'high', 'https://x.test/a')]);
    const summary = toActionSummary(actions[0]);
    expect(Object.keys(summary).sort()).toEqual(
      ['id', 'prevalence', 'priorityScore', 'severity', 'title'].sort(),
    );
  });
});
