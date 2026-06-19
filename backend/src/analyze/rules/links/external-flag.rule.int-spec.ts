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

  // The rule is narrowed (Item 6) to MONETIZED-looking external hrefs only
  // (utm_/?ref=/&ref=//aff//go///recommends/) that lack a nofollow/sponsored/ugc
  // rel token. Plain external links without monetization markers are ignored.
  it('flags monetized external links missing nofollow/sponsored/ugc and respects @> containment', async () => {
    await seedLinks(auditId, [
      // trigger: monetized (/go/) external, rel has only noopener (no flagged token)
      {
        sourceUrl: 'https://t/a',
        href: 'https://ext/go/deal',
        type: 'external',
        rel: ['noopener'],
      },
      // trigger: monetized (utm_) external, empty rel
      {
        sourceUrl: 'https://t/a',
        href: 'https://ext/landing?utm_source=x',
        type: 'external',
        rel: [],
      },
      // non-trigger: monetized external WITH nofollow
      {
        sourceUrl: 'https://t/a',
        href: 'https://ext/go/nofollow?utm_source=x',
        type: 'external',
        rel: ['nofollow'],
      },
      // non-trigger: monetized external with sponsored among others
      {
        sourceUrl: 'https://t/a',
        href: 'https://ext/go/sponsored',
        type: 'external',
        rel: ['noopener', 'sponsored'],
      },
      // non-trigger: NON-monetized external (Item 6 narrowing) — plain link is ignored
      {
        sourceUrl: 'https://t/a',
        href: 'https://ext/plain',
        type: 'external',
        rel: [],
      },
      // non-trigger: internal link (wrong type), even though href looks monetized
      {
        sourceUrl: 'https://t/a',
        href: 'https://t/go/internal',
        type: 'internal',
        rel: [],
      },
    ]);

    const findings = await runRule(linksExternalFlagRule, auditId);

    expect(findings).toEqual(
      expect.arrayContaining([
        { url: 'https://t/a', detail: { href: 'https://ext/go/deal', rel: ['noopener'] } },
        { url: 'https://t/a', detail: { href: 'https://ext/landing?utm_source=x', rel: [] } },
      ]),
    );
    expect(findings).toHaveLength(2);
  });

  it('dedupes identical (source_url, href) monetized external links into one finding', async () => {
    await seedLinks(auditId, [
      { sourceUrl: 'https://t/a', href: 'https://ext/go/x', type: 'external', rel: ['noopener'] },
      { sourceUrl: 'https://t/a', href: 'https://ext/go/x', type: 'external', rel: ['noopener'] },
    ]);

    const findings = await runRule(linksExternalFlagRule, auditId);

    expect(findings).toHaveLength(1);
  });
});
