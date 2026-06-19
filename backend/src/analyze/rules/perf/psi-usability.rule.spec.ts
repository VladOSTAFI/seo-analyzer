import { perfPsiUsabilityRule } from './psi-usability.rule';
import type { RuleDb } from '../../rule.types';

/**
 * Unit tests for perf.psi-usability.
 *
 * The rule issues two SQL queries sequentially (rollup, then per-page), so the
 * mock cycles through the calls in order: first call → rollup rows,
 * second call → per-page rows.
 */

const AUDIT_ID = 'audit-unit-psi';

function mockDbSequence(
  rollupRows: Record<string, unknown>[],
  perPageRows: Record<string, unknown>[],
): RuleDb {
  const execute = jest
    .fn()
    .mockResolvedValueOnce({ rows: rollupRows })
    .mockResolvedValueOnce({ rows: perPageRows });
  return { execute } as unknown as RuleDb;
}

describe('perf.psi-usability', () => {
  describe('mobile severity escalation (Item 4)', () => {
    it('sets severity=high on mobile per-page findings', async () => {
      const db = mockDbSequence(
        // rollup: nothing crosses threshold
        [],
        // per-page: one mobile row with flags
        [
          {
            page_url: 'https://t/a',
            strategy: 'mobile',
            usability_flags: ['tap-targets', 'unused-javascript'],
          },
        ],
      );

      const findings = await perfPsiUsabilityRule.run(db, AUDIT_ID);

      expect(findings).toHaveLength(1);
      expect(findings[0].severity).toBe('high');
      expect(findings[0].url).toBe('https://t/a');
      expect(findings[0].detail).toEqual({
        strategy: 'mobile',
        flags: ['tap-targets', 'unused-javascript'],
      });
    });

    it('does NOT set severity override on desktop per-page findings (falls back to medium)', async () => {
      const db = mockDbSequence(
        [],
        [
          {
            page_url: 'https://t/a',
            strategy: 'desktop',
            usability_flags: ['render-blocking-resources'],
          },
        ],
      );

      const findings = await perfPsiUsabilityRule.run(db, AUDIT_ID);

      expect(findings).toHaveLength(1);
      expect(findings[0].severity).toBeUndefined();
      expect(findings[0].detail).toEqual({
        strategy: 'desktop',
        flags: ['render-blocking-resources'],
      });
    });
  });

  describe('prevalence rollup (Item 5)', () => {
    it('collapses a flag present on all pages into one site-level finding', async () => {
      // Rollup query returns one prevalent flag for mobile strategy.
      const db = mockDbSequence(
        [{ strategy: 'mobile', flag: 'tap-targets', affected: 3, total: 3 }],
        // Per-page rows: all three pages carry 'tap-targets' (rolled up).
        [
          {
            page_url: 'https://t/a',
            strategy: 'mobile',
            usability_flags: ['tap-targets'],
          },
          {
            page_url: 'https://t/b',
            strategy: 'mobile',
            usability_flags: ['tap-targets'],
          },
          {
            page_url: 'https://t/c',
            strategy: 'mobile',
            usability_flags: ['tap-targets'],
          },
        ],
      );

      const findings = await perfPsiUsabilityRule.run(db, AUDIT_ID);

      // Should emit exactly one site-level rollup finding (url=null).
      expect(findings).toHaveLength(1);
      expect(findings[0].url).toBeNull();
      expect(findings[0].detail).toEqual({
        flag: 'tap-targets',
        strategy: 'mobile',
        affectedPages: 3,
        totalPages: 3,
      });
      // Mobile rollup also gets severity=high.
      expect(findings[0].severity).toBe('high');
    });

    it('suppresses per-page rows only for rolled-up flags, keeps below-threshold flags per-page', async () => {
      // 'tap-targets' is rolled up; 'unused-javascript' is NOT.
      const db = mockDbSequence(
        [{ strategy: 'mobile', flag: 'tap-targets', affected: 3, total: 3 }],
        [
          {
            page_url: 'https://t/a',
            strategy: 'mobile',
            usability_flags: ['tap-targets', 'unused-javascript'],
          },
          {
            page_url: 'https://t/b',
            strategy: 'mobile',
            usability_flags: ['tap-targets'],
          },
          {
            page_url: 'https://t/c',
            strategy: 'mobile',
            usability_flags: ['tap-targets', 'unused-javascript'],
          },
        ],
      );

      const findings = await perfPsiUsabilityRule.run(db, AUDIT_ID);

      // One site-level rollup for tap-targets + two per-page for unused-javascript.
      expect(findings).toHaveLength(3);

      const siteLevel = findings.filter((f) => f.url === null);
      expect(siteLevel).toHaveLength(1);
      expect(siteLevel[0].detail?.flag).toBe('tap-targets');

      const perPage = findings.filter((f) => f.url !== null);
      expect(perPage).toHaveLength(2);
      for (const f of perPage) {
        expect(f.detail?.flags).toEqual(['unused-javascript']);
        expect(f.severity).toBe('high'); // mobile escalation
      }
    });

    it('emits no findings when all per-page flags are rolled up and no other flags remain', async () => {
      const db = mockDbSequence(
        [{ strategy: 'desktop', flag: 'render-blocking-resources', affected: 5, total: 5 }],
        [
          {
            page_url: 'https://t/a',
            strategy: 'desktop',
            usability_flags: ['render-blocking-resources'],
          },
          {
            page_url: 'https://t/b',
            strategy: 'desktop',
            usability_flags: ['render-blocking-resources'],
          },
        ],
      );

      const findings = await perfPsiUsabilityRule.run(db, AUDIT_ID);

      // Only the one site-level rollup (desktop: no severity override).
      expect(findings).toHaveLength(1);
      expect(findings[0].url).toBeNull();
      expect(findings[0].severity).toBeUndefined();
    });
  });

  it('has correct rule metadata', () => {
    expect(perfPsiUsabilityRule.id).toBe('perf.psi-usability');
    expect(perfPsiUsabilityRule.severity).toBe('medium');
  });
});
