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

  it('flags a page carrying usability/opportunity flags', async () => {
    await seedPerformance(auditId, [
      {
        pageUrl: 'https://t/a',
        strategy: 'mobile',
        usabilityFlags: ['unused-javascript', 'render-blocking-resources'],
      },
    ]);

    const findings = await runRule(perfPsiUsabilityRule, auditId);

    expect(findings).toEqual([
      {
        url: 'https://t/a',
        detail: {
          strategy: 'mobile',
          flags: ['unused-javascript', 'render-blocking-resources'],
        },
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
