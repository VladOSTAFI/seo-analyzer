import {
  closePool,
  cleanupAudit,
  createAudit,
  runRule,
  seedPerformance,
} from '../../../../test/int/rule-harness';
import { perfClsInpRule } from './cls-inp.rule';

describe('perf.cls-inp (int)', () => {
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

  it('flags a high CLS (>0.1) naming the cls issue', async () => {
    await seedPerformance(auditId, [
      { pageUrl: 'https://t/a', strategy: 'mobile', cls: 0.25, inpMs: 100 },
    ]);

    const findings = await runRule(perfClsInpRule, auditId);

    expect(findings).toEqual([
      {
        url: 'https://t/a',
        detail: { strategy: 'mobile', cls: 0.25, inpMs: 100, issues: ['cls'] },
      },
    ]);
  });

  it('flags a high INP (>200ms) naming the inp issue', async () => {
    await seedPerformance(auditId, [
      { pageUrl: 'https://t/a', strategy: 'mobile', cls: 0.05, inpMs: 350 },
    ]);

    const findings = await runRule(perfClsInpRule, auditId);

    expect(findings).toEqual([
      {
        url: 'https://t/a',
        detail: { strategy: 'mobile', cls: 0.05, inpMs: 350, issues: ['inp'] },
      },
    ]);
  });

  it('does not flag good (cls<=0.1 & inp<=200) or absent (null) metrics', async () => {
    await seedPerformance(auditId, [
      { pageUrl: 'https://t/a', strategy: 'mobile', cls: 0.05, inpMs: 100 },
      {
        pageUrl: 'https://t/b',
        strategy: 'desktop',
        cls: undefined,
        inpMs: undefined,
      },
    ]);

    const findings = await runRule(perfClsInpRule, auditId);

    expect(findings).toEqual([]);
  });

  it('emits ONE site-level finding (url=null, confidence=low) when all rows are origin-fallback', async () => {
    // Two sampled pages, both returned origin-level aggregates → same CLS/INP.
    await seedPerformance(auditId, [
      {
        pageUrl: 'https://t/page1',
        strategy: 'mobile',
        cls: 0.22,
        inpMs: 310,
        isOriginFallback: true,
      },
      {
        pageUrl: 'https://t/page2',
        strategy: 'mobile',
        cls: 0.22,
        inpMs: 310,
        isOriginFallback: true,
      },
    ]);

    const findings = await runRule(perfClsInpRule, auditId);

    // Must collapse to exactly ONE site-level finding, not one per page.
    expect(findings).toHaveLength(1);
    expect(findings[0].url).toBeNull();
    expect(findings[0].confidence).toBe('low');
    expect(findings[0].detail).toMatchObject({
      scope: 'origin',
      strategy: 'mobile',
      cls: 0.22,
      inpMs: 310,
      issues: ['cls', 'inp'],
    });
  });

  it('keeps per-page findings for non-fallback rows and one site-level for origin-fallback rows', async () => {
    // One real page-level CLS finding plus origin-fallback INP finding for another strategy.
    await seedPerformance(auditId, [
      {
        pageUrl: 'https://t/real',
        strategy: 'desktop',
        cls: 0.3,
        inpMs: 80,
        isOriginFallback: false,
      },
      {
        pageUrl: 'https://t/page1',
        strategy: 'mobile',
        cls: 0.05,
        inpMs: 450,
        isOriginFallback: true,
      },
      {
        pageUrl: 'https://t/page2',
        strategy: 'mobile',
        cls: 0.05,
        inpMs: 380,
        isOriginFallback: true,
      },
    ]);

    const findings = await runRule(perfClsInpRule, auditId);

    // Expect two findings: one per-page (desktop) + one site-level (mobile).
    expect(findings).toHaveLength(2);

    const perPage = findings.find((f) => f.url !== null);
    expect(perPage).toBeDefined();
    expect(perPage!.url).toBe('https://t/real');
    expect(perPage!.detail).toMatchObject({
      strategy: 'desktop',
      cls: 0.3,
      inpMs: 80,
      issues: ['cls'],
    });
    expect(perPage!.confidence).toBeUndefined(); // default confidence

    const siteLevelFinding = findings.find((f) => f.url === null);
    expect(siteLevelFinding).toBeDefined();
    expect(siteLevelFinding!.confidence).toBe('low');
    expect(siteLevelFinding!.detail).toMatchObject({
      scope: 'origin',
      strategy: 'mobile',
      cls: 0.05,
      inpMs: 450, // max of 450 and 380
      issues: ['inp'],
    });
  });
});
