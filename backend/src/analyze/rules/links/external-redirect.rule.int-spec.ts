import {
  closePool,
  cleanupAudit,
  createAudit,
  runRule,
  seedLinks,
} from '../../../../test/int/rule-harness';
import { linksExternalRedirectRule } from './external-redirect.rule';

describe('links.external-redirect (int)', () => {
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

  it('flags external links whose probed target is 3xx; ignores internal / 2xx / 4xx / NULL', async () => {
    await seedLinks(auditId, [
      // trigger: external 301
      {
        sourceUrl: 'https://t/a',
        href: 'https://ext/301',
        type: 'external',
        targetStatusCode: 301,
      },
      // trigger boundary: external 399
      {
        sourceUrl: 'https://t/a',
        href: 'https://ext/399',
        type: 'external',
        targetStatusCode: 399,
      },
      // non-trigger: external 200
      {
        sourceUrl: 'https://t/a',
        href: 'https://ext/200',
        type: 'external',
        targetStatusCode: 200,
      },
      // non-trigger: external 404
      {
        sourceUrl: 'https://t/a',
        href: 'https://ext/404',
        type: 'external',
        targetStatusCode: 404,
      },
      // non-trigger: external not probed (NULL)
      { sourceUrl: 'https://t/a', href: 'https://ext/null', type: 'external' },
      // non-trigger: internal 301 (wrong type)
      {
        sourceUrl: 'https://t/a',
        href: 'https://t/301',
        type: 'internal',
        targetStatusCode: 301,
      },
    ]);

    const findings = await runRule(linksExternalRedirectRule, auditId);

    expect(findings).toEqual([
      {
        url: 'https://t/a',
        confidence: 'medium',
        detail: { href: 'https://ext/301', targetStatusCode: 301 },
      },
      {
        url: 'https://t/a',
        confidence: 'medium',
        detail: { href: 'https://ext/399', targetStatusCode: 399 },
      },
    ]);
  });
});
