import {
  cleanupAudit,
  closePool,
  createAudit,
  runRule,
  seedSitemapEntries,
} from '../../../../test/int/rule-harness';
import { sitemapNoindexUrlRule } from './noindex-url.rule';

/**
 * `sitemap.noindex-url` integration test. A listed URL that is noindex OR
 * canonicalizes elsewhere is a contradiction; an indexable 200 self-canonical
 * loc fires nothing. The reason detail folds both causes.
 */
describe('sitemap.noindex-url (int)', () => {
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

  it('flags noindex and non-self-canonical locs with a folded reason', async () => {
    await seedSitemapEntries(auditId, [
      {
        loc: 'https://e.com/indexable',
        inCrawl: true,
        statusCode: 200,
        isNoindex: false,
        isSelfCanonical: true,
      },
      {
        loc: 'https://e.com/noindex',
        inCrawl: true,
        statusCode: 200,
        isNoindex: true,
        isSelfCanonical: true,
      },
      {
        loc: 'https://e.com/canon-elsewhere',
        inCrawl: true,
        statusCode: 200,
        isNoindex: false,
        isSelfCanonical: false,
      },
      {
        loc: 'https://e.com/both',
        inCrawl: true,
        statusCode: 200,
        isNoindex: true,
        isSelfCanonical: false,
      },
    ]);

    const findings = await runRule(sitemapNoindexUrlRule, auditId);
    const byUrl = Object.fromEntries(findings.map((f) => [f.url, f.detail]));
    expect(Object.keys(byUrl).sort()).toEqual([
      'https://e.com/both',
      'https://e.com/canon-elsewhere',
      'https://e.com/noindex',
    ]);
    expect(byUrl['https://e.com/noindex']).toMatchObject({ reason: ['noindex'] });
    expect(byUrl['https://e.com/canon-elsewhere']).toMatchObject({
      reason: ['non-self-canonical'],
    });
    expect(byUrl['https://e.com/both']).toMatchObject({
      reason: ['noindex', 'non-self-canonical'],
    });
  });

  it('emits nothing when every listed crawled URL is indexable + self-canonical', async () => {
    await seedSitemapEntries(auditId, [
      {
        loc: 'https://e.com/a',
        inCrawl: true,
        statusCode: 200,
        isNoindex: false,
        isSelfCanonical: true,
      },
    ]);
    expect(await runRule(sitemapNoindexUrlRule, auditId)).toEqual([]);
  });
});
