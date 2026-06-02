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
});
