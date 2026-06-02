import {
  closePool,
  cleanupAudit,
  createAudit,
  runRule,
  seedLinks,
} from '../../../../test/int/rule-harness';
import { linksBrokenExternalRule } from './broken-external.rule';

describe('links.broken-external (int)', () => {
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

  it('flags external links whose (crawled) target is 4xx/5xx and ignores internal / NULL', async () => {
    await seedLinks(auditId, [
      // trigger: external broken (target happened to be crawled)
      {
        sourceUrl: 'https://t/a',
        href: 'https://ext/500',
        type: 'external',
        isBroken: true,
        targetStatusCode: 500,
      },
      // non-trigger: external, target not crawled → flags NULL
      {
        sourceUrl: 'https://t/a',
        href: 'https://ext/unknown',
        type: 'external',
      },
      // non-trigger: internal broken (wrong type)
      {
        sourceUrl: 'https://t/a',
        href: 'https://t/404',
        type: 'internal',
        isBroken: true,
        targetStatusCode: 404,
      },
    ]);

    const findings = await runRule(linksBrokenExternalRule, auditId);

    expect(findings).toEqual([
      {
        url: 'https://t/a',
        detail: { href: 'https://ext/500', targetStatusCode: 500 },
      },
    ]);
  });

  it('dedupes identical (source_url, href) broken external links into one finding', async () => {
    await seedLinks(auditId, [
      {
        sourceUrl: 'https://t/a',
        href: 'https://ext/500',
        type: 'external',
        isBroken: true,
        targetStatusCode: 500,
      },
      {
        sourceUrl: 'https://t/a',
        href: 'https://ext/500',
        type: 'external',
        isBroken: true,
        targetStatusCode: 500,
      },
    ]);

    const findings = await runRule(linksBrokenExternalRule, auditId);

    expect(findings).toHaveLength(1);
  });
});
