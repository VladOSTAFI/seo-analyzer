import {
  closePool,
  cleanupAudit,
  createAudit,
  runRule,
  seedLinks,
} from '../../../../test/int/rule-harness';
import { linksInternalNofollowRule } from './internal-nofollow.rule';

describe('links.internal-nofollow (int)', () => {
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

  it('flags only internal links carrying rel=nofollow; ignores external + clean internal', async () => {
    await seedLinks(auditId, [
      // trigger: internal with nofollow
      {
        sourceUrl: 'https://t/a',
        href: 'https://t/x',
        type: 'internal',
        rel: ['nofollow'],
      },
      // trigger: internal with nofollow among other tokens
      {
        sourceUrl: 'https://t/a',
        href: 'https://t/y',
        type: 'internal',
        rel: ['noopener', 'nofollow'],
      },
      // non-trigger: internal without nofollow
      {
        sourceUrl: 'https://t/b',
        href: 'https://t/clean',
        type: 'internal',
        rel: ['noopener'],
      },
      // non-trigger: internal with empty rel (default)
      { sourceUrl: 'https://t/b', href: 'https://t/empty', type: 'internal' },
      // non-trigger: EXTERNAL with nofollow → owned by external rules, not this one
      {
        sourceUrl: 'https://t/c',
        href: 'https://ext/x',
        type: 'external',
        rel: ['nofollow'],
      },
    ]);

    const findings = await runRule(linksInternalNofollowRule, auditId);
    const hrefs = findings.map((f) => f.detail?.href as string).sort();
    expect(hrefs).toEqual(['https://t/x', 'https://t/y']);

    const x = findings.find((f) => f.detail?.href === 'https://t/x');
    expect(x?.url).toBe('https://t/a');
    expect(x?.detail?.rel).toEqual(['nofollow']);
  });
});
