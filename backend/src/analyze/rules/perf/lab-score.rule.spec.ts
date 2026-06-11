import { perfLabScoreRule } from './lab-score.rule';
import type { RuleDb } from '../../rule.types';

/** Build a mock RuleDb that resolves `execute` with the given rows. */
function mockDb(rows: Record<string, unknown>[]): RuleDb {
  return {
    execute: jest.fn().mockResolvedValue({ rows }),
  } as unknown as RuleDb;
}

describe('perf.lab-score', () => {
  const AUDIT_ID = 'audit-unit-test';

  it('returns no findings when all scores are at or above the threshold (95)', async () => {
    // The SQL query uses WHERE performance_score < threshold — the mock returns
    // whatever rows we give it, so empty rows represent a passing site (every
    // page scored at/above the threshold and was filtered out by the query).
    const passingDb = mockDb([]);
    const findings = await perfLabScoreRule.run(passingDb, AUDIT_ID);

    expect(findings).toEqual([]);
  });

  it('emits a medium-severity finding for a below-threshold score (80)', async () => {
    const db = mockDb([{ page_url: 'https://t/a', strategy: 'mobile', performance_score: 80 }]);

    const findings = await perfLabScoreRule.run(db, AUDIT_ID);

    expect(findings).toHaveLength(1);
    expect(findings[0]).toEqual({
      url: 'https://t/a',
      detail: { strategy: 'mobile', score: 80 },
      // No per-finding severity override → falls back to rule's static 'medium'
    });
    // Ensure no severity override is set (score 80 >= 50).
    expect(findings[0].severity).toBeUndefined();
  });

  it('escalates to high severity for a critically-low score (40)', async () => {
    const db = mockDb([{ page_url: 'https://t/b', strategy: 'desktop', performance_score: 40 }]);

    const findings = await perfLabScoreRule.run(db, AUDIT_ID);

    expect(findings).toHaveLength(1);
    expect(findings[0]).toEqual({
      url: 'https://t/b',
      detail: { strategy: 'desktop', score: 40 },
      severity: 'high',
    });
  });

  it('emits high for score < 50 and no override for score >= 50 in the same batch', async () => {
    const db = mockDb([
      { page_url: 'https://t/a', strategy: 'mobile', performance_score: 40 },
      { page_url: 'https://t/b', strategy: 'mobile', performance_score: 70 },
    ]);

    const findings = await perfLabScoreRule.run(db, AUDIT_ID);

    expect(findings).toHaveLength(2);

    const critical = findings.find((f) => f.url === 'https://t/a');
    expect(critical?.severity).toBe('high');

    const medium = findings.find((f) => f.url === 'https://t/b');
    expect(medium?.severity).toBeUndefined();
  });

  it('has correct rule metadata', () => {
    expect(perfLabScoreRule.id).toBe('perf.lab-score');
    expect(perfLabScoreRule.severity).toBe('medium');
    expect(typeof perfLabScoreRule.description).toBe('string');
  });
});
