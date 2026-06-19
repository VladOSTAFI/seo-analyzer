import {
  cleanupAudit,
  closePool,
  createAudit,
  runRule,
  seedPages,
} from '../../../../test/int/rule-harness';
import { mobileUsabilityRule } from './usability.rule';

describe('mobile.usability (int)', () => {
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

  it('flags pages with static heuristic hits; ignores empty / null issue lists and non-2xx', async () => {
    await seedPages(auditId, [
      {
        url: 'https://t/tiny',
        statusClass: '2xx',
        pageKind: 'html',
        mobileUsabilityIssues: ['tiny-font'],
      },
      {
        url: 'https://t/wide',
        statusClass: '2xx',
        pageKind: 'html',
        mobileUsabilityIssues: ['fixed-width-overflow'],
      },
      // empty list → not flagged
      { url: 'https://t/clean', statusClass: '2xx', pageKind: 'html', mobileUsabilityIssues: [] },
      // non-2xx → excluded
      {
        url: 'https://t/404',
        statusClass: '4xx',
        pageKind: 'html',
        mobileUsabilityIssues: ['tiny-font'],
      },
    ]);

    const findings = await runRule(mobileUsabilityRule, auditId);
    const byUrl = Object.fromEntries(findings.map((f) => [f.url, f.detail]));

    expect(findings.map((f) => f.url).sort()).toEqual(['https://t/tiny', 'https://t/wide']);
    expect(byUrl['https://t/tiny']).toMatchObject({ issues: ['tiny-font'] });
  });
});
