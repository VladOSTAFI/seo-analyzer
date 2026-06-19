import {
  closePool,
  cleanupAudit,
  createAudit,
  runRule,
  seedPerformance,
} from '../../../../test/int/rule-harness';
import { perfPsiUsabilityRule } from './psi-usability.rule';

describe('perf.psi-usability (int)', () => {
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

  // Prevalence rollup (default PERF_FLAG_ROLLUP_PCT=0.6, Item 5): a (flag, strategy)
  // pair appearing on >= 60% of that strategy's sampled pages collapses into ONE
  // site-level finding (url=null) with { flag, strategy, affectedPages, totalPages }
  // and suppresses the per-page rows; below-threshold flags remain per-page.
  it('rolls up a flag present on >=60% of pages into one site-level finding (mobile escalated to high)', async () => {
    await seedPerformance(auditId, [
      { pageUrl: 'https://t/a', strategy: 'mobile', usabilityFlags: ['render-blocking-resources'] },
      { pageUrl: 'https://t/b', strategy: 'mobile', usabilityFlags: ['render-blocking-resources'] },
    ]);

    const findings = await runRule(perfPsiUsabilityRule, auditId);

    // 2/2 pages carry the flag -> rolled up to one site-level finding; mobile -> high.
    expect(findings).toEqual([
      {
        url: null,
        detail: {
          flag: 'render-blocking-resources',
          strategy: 'mobile',
          affectedPages: 2,
          totalPages: 2,
        },
        severity: 'high',
      },
    ]);
  });

  it('emits a per-page finding for a flag below the rollup threshold', async () => {
    // unused-javascript on 1 of 3 mobile pages (33% < 60%) -> stays per-page.
    await seedPerformance(auditId, [
      { pageUrl: 'https://t/a', strategy: 'mobile', usabilityFlags: ['unused-javascript'] },
      { pageUrl: 'https://t/b', strategy: 'mobile', usabilityFlags: [] },
      { pageUrl: 'https://t/c', strategy: 'mobile', usabilityFlags: [] },
    ]);

    const findings = await runRule(perfPsiUsabilityRule, auditId);

    expect(findings).toEqual([
      {
        url: 'https://t/a',
        detail: { strategy: 'mobile', flags: ['unused-javascript'] },
        severity: 'high',
      },
    ]);
  });

  it('does not escalate desktop findings to high severity', async () => {
    await seedPerformance(auditId, [
      { pageUrl: 'https://t/a', strategy: 'desktop', usabilityFlags: ['unused-javascript'] },
      { pageUrl: 'https://t/b', strategy: 'desktop', usabilityFlags: [] },
      { pageUrl: 'https://t/c', strategy: 'desktop', usabilityFlags: [] },
    ]);

    const findings = await runRule(perfPsiUsabilityRule, auditId);

    // No `severity` override for desktop -> the rule's static `medium` applies later.
    expect(findings).toEqual([
      {
        url: 'https://t/a',
        detail: { strategy: 'desktop', flags: ['unused-javascript'] },
      },
    ]);
  });

  it('does not flag a page with an empty flags array', async () => {
    await seedPerformance(auditId, [
      { pageUrl: 'https://t/a', strategy: 'mobile', usabilityFlags: [] },
    ]);

    const findings = await runRule(perfPsiUsabilityRule, auditId);

    expect(findings).toEqual([]);
  });
});
