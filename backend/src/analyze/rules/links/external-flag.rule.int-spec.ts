import {
  closePool,
  cleanupAudit,
  createAudit,
  runRule,
  seedLinks,
} from '../../../../test/int/rule-harness';
import { linksExternalFlagRule } from './external-flag.rule';

describe('links.external-flag (int)', () => {
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

  it('flags external links missing nofollow/sponsored/ugc and respects @> containment', async () => {
    await seedLinks(auditId, [
      // trigger: external, rel has only noopener (none of the flagged tokens)
      {
        sourceUrl: 'https://t/a',
        href: 'https://ext/flag',
        type: 'external',
        rel: ['noopener'],
      },
      // trigger: external, empty rel
      {
        sourceUrl: 'https://t/a',
        href: 'https://ext/bare',
        type: 'external',
        rel: [],
      },
      // non-trigger: external WITH nofollow
      {
        sourceUrl: 'https://t/a',
        href: 'https://ext/nofollow',
        type: 'external',
        rel: ['nofollow'],
      },
      // non-trigger: external with sponsored among others
      {
        sourceUrl: 'https://t/a',
        href: 'https://ext/sponsored',
        type: 'external',
        rel: ['noopener', 'sponsored'],
      },
      // non-trigger: internal link (wrong type), no rel
      {
        sourceUrl: 'https://t/a',
        href: 'https://t/internal',
        type: 'internal',
        rel: [],
      },
    ]);

    const findings = await runRule(linksExternalFlagRule, auditId);

    expect(findings).toEqual(
      expect.arrayContaining([
        { url: 'https://t/a', detail: { href: 'https://ext/flag', rel: ['noopener'] } },
        { url: 'https://t/a', detail: { href: 'https://ext/bare', rel: [] } },
      ]),
    );
    expect(findings).toHaveLength(2);
  });

  it('dedupes identical (source_url, href) external links into one finding', async () => {
    await seedLinks(auditId, [
      { sourceUrl: 'https://t/a', href: 'https://ext/x', type: 'external', rel: ['noopener'] },
      { sourceUrl: 'https://t/a', href: 'https://ext/x', type: 'external', rel: ['noopener'] },
    ]);

    const findings = await runRule(linksExternalFlagRule, auditId);

    expect(findings).toHaveLength(1);
  });
});
