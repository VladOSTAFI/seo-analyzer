import {
  closePool,
  cleanupAudit,
  createAudit,
  runRule,
  seedLinks,
} from '../../../../test/int/rule-harness';
import { linksBrokenInternalRule } from './broken-internal.rule';

describe('links.broken-internal (int)', () => {
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

  it('flags internal links whose target is 4xx/5xx and ignores healthy / external', async () => {
    await seedLinks(auditId, [
      // trigger: internal broken
      {
        sourceUrl: 'https://t/a',
        href: 'https://t/404',
        type: 'internal',
        isBroken: true,
        targetStatusCode: 404,
      },
      // non-trigger: internal, not broken
      {
        sourceUrl: 'https://t/a',
        href: 'https://t/ok',
        type: 'internal',
        isBroken: false,
        targetStatusCode: 200,
      },
      // non-trigger: external broken (wrong type)
      {
        sourceUrl: 'https://t/a',
        href: 'https://ext/500',
        type: 'external',
        isBroken: true,
        targetStatusCode: 500,
      },
    ]);

    const findings = await runRule(linksBrokenInternalRule, auditId);

    expect(findings).toEqual([
      {
        url: 'https://t/a',
        detail: { href: 'https://t/404', targetStatusCode: 404 },
      },
    ]);
  });

  it('dedupes identical (source_url, href) broken links into one finding', async () => {
    await seedLinks(auditId, [
      {
        sourceUrl: 'https://t/a',
        href: 'https://t/404',
        type: 'internal',
        isBroken: true,
        targetStatusCode: 404,
      },
      {
        sourceUrl: 'https://t/a',
        href: 'https://t/404',
        type: 'internal',
        isBroken: true,
        targetStatusCode: 404,
      },
    ]);

    const findings = await runRule(linksBrokenInternalRule, auditId);

    expect(findings).toHaveLength(1);
  });
});
