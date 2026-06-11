/**
 * Registry guard tests — pure unit, no DB required.
 *
 * Guards enforced:
 *   1. No duplicate `id` values across the RULES array.
 *   2. Default rule count (RULE_EXTERNAL_FLAG_ENABLED off) matches the expected
 *      baseline so accidental additions/removals are caught at CI time.
 *   3. `links.external-flag` is excluded from RULES when the env var is off and
 *      included when it is on.
 */

describe('rule.registry', () => {
  // Jest module isolation: re-require after mutating env so the conditional
  // at module load-time is re-evaluated.
  function loadRegistry(envValue: string | undefined): { RULES: import('./rule.types').Rule[] } {
    jest.resetModules();
    if (envValue === undefined) {
      delete process.env.RULE_EXTERNAL_FLAG_ENABLED;
    } else {
      process.env.RULE_EXTERNAL_FLAG_ENABLED = envValue;
    }
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('./rule.registry') as { RULES: import('./rule.types').Rule[] };
  }

  afterAll(() => {
    delete process.env.RULE_EXTERNAL_FLAG_ENABLED;
  });

  describe('duplicate-id guard', () => {
    it('has no duplicate rule ids', () => {
      const { RULES } = loadRegistry(undefined);
      const ids = RULES.map((r) => r.id);
      const duplicates = ids.filter((id, i) => ids.indexOf(id) !== i);
      expect(duplicates).toEqual([]);
    });
  });

  describe('baseline rule count', () => {
    it('has 30 rules by default (RULE_EXTERNAL_FLAG_ENABLED off)', () => {
      const { RULES } = loadRegistry(undefined);
      expect(RULES).toHaveLength(30);
    });

    it('has 31 rules when RULE_EXTERNAL_FLAG_ENABLED=true', () => {
      const { RULES } = loadRegistry('true');
      expect(RULES).toHaveLength(31);
    });
  });

  describe('conditional links.external-flag', () => {
    it('excludes links.external-flag when env var is absent (default OFF)', () => {
      const { RULES } = loadRegistry(undefined);
      const ids = RULES.map((r) => r.id);
      expect(ids).not.toContain('links.external-flag');
    });

    it('excludes links.external-flag when env var is empty string', () => {
      const { RULES } = loadRegistry('');
      const ids = RULES.map((r) => r.id);
      expect(ids).not.toContain('links.external-flag');
    });

    it('includes links.external-flag when RULE_EXTERNAL_FLAG_ENABLED=true', () => {
      const { RULES } = loadRegistry('true');
      const ids = RULES.map((r) => r.id);
      expect(ids).toContain('links.external-flag');
    });

    it('includes links.external-flag when RULE_EXTERNAL_FLAG_ENABLED=1', () => {
      const { RULES } = loadRegistry('1');
      const ids = RULES.map((r) => r.id);
      expect(ids).toContain('links.external-flag');
    });

    it('includes links.external-flag when RULE_EXTERNAL_FLAG_ENABLED=yes', () => {
      const { RULES } = loadRegistry('yes');
      const ids = RULES.map((r) => r.id);
      expect(ids).toContain('links.external-flag');
    });

    it('includes links.external-flag when RULE_EXTERNAL_FLAG_ENABLED=on', () => {
      const { RULES } = loadRegistry('on');
      const ids = RULES.map((r) => r.id);
      expect(ids).toContain('links.external-flag');
    });

    it('includes links.external-flag for mixed-case TRUE', () => {
      const { RULES } = loadRegistry('TRUE');
      const ids = RULES.map((r) => r.id);
      expect(ids).toContain('links.external-flag');
    });
  });

  describe('key rule presence', () => {
    it('includes perf.lab-score', () => {
      const { RULES } = loadRegistry(undefined);
      const ids = RULES.map((r) => r.id);
      expect(ids).toContain('perf.lab-score');
    });

    it('does NOT include perf.mobile-indexing (replaced by per-finding severity in perf.psi-usability)', () => {
      const { RULES } = loadRegistry(undefined);
      const ids = RULES.map((r) => r.id);
      expect(ids).not.toContain('perf.mobile-indexing');
    });
  });
});
