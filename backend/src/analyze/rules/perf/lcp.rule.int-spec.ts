import {
  closePool,
  cleanupAudit,
  createAudit,
  runRule,
  seedPerformance,
} from '../../../../test/int/rule-harness';
import { perfLcpRule } from './lcp.rule';

describe('perf.lcp (int)', () => {
  let auditId: string;

  beforeEach(async () => {
    auditId = await createAudit();
  });
  afterEach(async () => {
    await cleanupAudit(auditId);
  });
  afterAll(async () => {
    await closePool();
  });

  it('flags pages with LCP above 2500ms (good threshold)', async () => {
    await seedPerformance(auditId, [{ pageUrl: 'https://t/a', strategy: 'mobile', lcpMs: 4000 }]);

    const findings = await runRule(perfLcpRule, auditId);

    expect(findings).toEqual([
      {
        url: 'https://t/a',
        detail: { strategy: 'mobile', lcpMs: 4000 },
      },
    ]);
  });

  it('does not flag a good (<=2500ms) or absent (null) LCP', async () => {
    await seedPerformance(auditId, [
      { pageUrl: 'https://t/a', strategy: 'mobile', lcpMs: 2000 },
      { pageUrl: 'https://t/b', strategy: 'desktop', lcpMs: undefined },
    ]);

    const findings = await runRule(perfLcpRule, auditId);

    expect(findings).toEqual([]);
  });

  it('emits ONE site-level finding (url=null, confidence=low) when all rows are origin-fallback', async () => {
    // Two sampled pages, both returned origin-level aggregates → same LCP.
    await seedPerformance(auditId, [
      {
        pageUrl: 'https://t/page1',
        strategy: 'mobile',
        lcpMs: 3800,
        isOriginFallback: true,
      },
      {
        pageUrl: 'https://t/page2',
        strategy: 'mobile',
        lcpMs: 3800,
        isOriginFallback: true,
      },
    ]);

    const findings = await runRule(perfLcpRule, auditId);

    // Must collapse to exactly ONE site-level finding, not one per page.
    expect(findings).toHaveLength(1);
    expect(findings[0].url).toBeNull();
    expect(findings[0].confidence).toBe('low');
    expect(findings[0].detail).toMatchObject({
      scope: 'origin',
      strategy: 'mobile',
      lcpMs: 3800,
    });
  });

  it('keeps per-page findings for non-fallback rows and one site-level for origin-fallback rows', async () => {
    // One real page-level row plus two origin-fallback rows for a different strategy.
    await seedPerformance(auditId, [
      {
        pageUrl: 'https://t/real',
        strategy: 'desktop',
        lcpMs: 5000,
        isOriginFallback: false,
      },
      {
        pageUrl: 'https://t/page1',
        strategy: 'mobile',
        lcpMs: 4200,
        isOriginFallback: true,
      },
      {
        pageUrl: 'https://t/page2',
        strategy: 'mobile',
        lcpMs: 3900,
        isOriginFallback: true,
      },
    ]);

    const findings = await runRule(perfLcpRule, auditId);

    // Expect two findings: one per-page (desktop) + one site-level (mobile).
    expect(findings).toHaveLength(2);

    const perPage = findings.find((f) => f.url !== null);
    expect(perPage).toBeDefined();
    expect(perPage!.url).toBe('https://t/real');
    expect(perPage!.detail).toMatchObject({ strategy: 'desktop', lcpMs: 5000 });
    expect(perPage!.confidence).toBeUndefined(); // default confidence

    const siteLevelFinding = findings.find((f) => f.url === null);
    expect(siteLevelFinding).toBeDefined();
    expect(siteLevelFinding!.confidence).toBe('low');
    expect(siteLevelFinding!.detail).toMatchObject({
      scope: 'origin',
      strategy: 'mobile',
      lcpMs: 4200, // max of 4200 and 3900
    });
  });
});
