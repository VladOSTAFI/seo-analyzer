import {
  closePool,
  cleanupAudit,
  createAudit,
  runRule,
  seedPerformance,
} from '../../../../test/int/rule-harness';
import { perfMobileIndexingRule } from './mobile-indexing.rule';

describe('perf.mobile-indexing (int)', () => {
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

  it('flags a mobile page carrying usability flags', async () => {
    await seedPerformance(auditId, [
      {
        pageUrl: 'https://t/a',
        strategy: 'mobile',
        usabilityFlags: ['tap-targets'],
      },
    ]);

    const findings = await runRule(perfMobileIndexingRule, auditId);

    expect(findings).toEqual([
      {
        url: 'https://t/a',
        detail: { strategy: 'mobile', flags: ['tap-targets'] },
      },
    ]);
  });

  it('does not flag a desktop page with flags, nor a mobile page with no flags', async () => {
    await seedPerformance(auditId, [
      {
        pageUrl: 'https://t/a',
        strategy: 'desktop',
        usabilityFlags: ['tap-targets'],
      },
      { pageUrl: 'https://t/b', strategy: 'mobile', usabilityFlags: [] },
    ]);

    const findings = await runRule(perfMobileIndexingRule, auditId);

    expect(findings).toEqual([]);
  });
});
