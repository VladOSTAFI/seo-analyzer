import { RULES } from '../analyze/rule.registry';
import { ruleFamily } from './report.sections';
import { REMEDIATION, remediationFor, remediationForFamily } from './report.remediation';

/**
 * Catalogue coverage test (plan 13 §7): every ruleFamily in the live registry
 * has a complete REMEDIATION entry. A new rule cannot ship without guidance.
 */
describe('report.remediation catalogue coverage', () => {
  const liveFamilies = [...new Set(RULES.map((r) => ruleFamily(r.id)))].sort();

  it('every live registry family has a REMEDIATION entry', () => {
    const missing = liveFamilies.filter((fam) => !(fam in REMEDIATION));
    expect(missing).toEqual([]);
  });

  it('every entry has non-empty whyItMatters/howToFix/docLink and impact/effort in 1..5', () => {
    for (const fam of liveFamilies) {
      const entry = REMEDIATION[fam];
      expect(entry).toBeDefined();
      expect(typeof entry.whyItMatters).toBe('string');
      expect(entry.whyItMatters.trim().length).toBeGreaterThan(0);
      expect(typeof entry.howToFix).toBe('string');
      expect(entry.howToFix.trim().length).toBeGreaterThan(0);
      expect(typeof entry.docLink).toBe('string');
      expect(entry.docLink.trim().length).toBeGreaterThan(0);
      expect(entry.docLink).toMatch(/^https?:\/\//);
      expect(Number.isInteger(entry.impact)).toBe(true);
      expect(entry.impact).toBeGreaterThanOrEqual(1);
      expect(entry.impact).toBeLessThanOrEqual(5);
      expect(Number.isInteger(entry.effort)).toBe(true);
      expect(entry.effort).toBeGreaterThanOrEqual(1);
      expect(entry.effort).toBeLessThanOrEqual(5);
    }
  });

  it('includes the six Phase-1 rules-bundle families', () => {
    for (const fam of [
      'index.orphan-page',
      'index.click-depth',
      'index.signal-conflict',
      'index.soft-404',
      'links.anchor-quality',
      'links.internal-nofollow',
    ]) {
      expect(REMEDIATION[fam]).toBeDefined();
    }
  });

  it('remediationFor resolves a ruleId to its family entry', () => {
    const r = remediationFor('meta.h1.missing');
    expect(r).toBeDefined();
    expect(r).toBe(REMEDIATION['meta.h1']);
  });

  it('remediationForFamily returns undefined for an unmapped family', () => {
    expect(remediationForFamily('totally.unknown')).toBeUndefined();
  });

  it('every live registry rule resolves a remediation via remediationFor', () => {
    for (const rule of RULES) {
      expect(remediationFor(rule.id)).toBeDefined();
    }
  });
});
