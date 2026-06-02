import {
  closePool,
  cleanupAudit,
  createAudit,
  runRule,
  seedLinks,
} from '../../../../test/int/rule-harness';
import { linksInternalRedirectRule } from './internal-redirect.rule';

describe('links.internal-redirect (int)', () => {
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

  it('flags internal links whose target is a 3xx and ignores non-redirect / external', async () => {
    await seedLinks(auditId, [
      // trigger: internal redirect
      {
        sourceUrl: 'https://t/a',
        href: 'https://t/r',
        type: 'internal',
        isRedirect: true,
        targetStatusCode: 301,
      },
      // non-trigger: internal, not a redirect
      {
        sourceUrl: 'https://t/a',
        href: 'https://t/ok',
        type: 'internal',
        isRedirect: false,
        targetStatusCode: 200,
      },
      // non-trigger: external redirect (wrong type)
      {
        sourceUrl: 'https://t/a',
        href: 'https://ext/r',
        type: 'external',
        isRedirect: true,
        targetStatusCode: 302,
      },
    ]);

    const findings = await runRule(linksInternalRedirectRule, auditId);

    expect(findings).toEqual([
      {
        url: 'https://t/a',
        detail: { href: 'https://t/r', targetStatusCode: 301 },
      },
    ]);
  });

  it('dedupes identical (source_url, href) redirect links into one finding', async () => {
    await seedLinks(auditId, [
      {
        sourceUrl: 'https://t/a',
        href: 'https://t/r',
        type: 'internal',
        isRedirect: true,
        targetStatusCode: 301,
      },
      {
        sourceUrl: 'https://t/a',
        href: 'https://t/r',
        type: 'internal',
        isRedirect: true,
        targetStatusCode: 301,
      },
    ]);

    const findings = await runRule(linksInternalRedirectRule, auditId);

    expect(findings).toHaveLength(1);
  });
});
