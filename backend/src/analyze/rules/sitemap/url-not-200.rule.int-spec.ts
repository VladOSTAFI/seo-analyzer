import {
  cleanupAudit,
  closePool,
  createAudit,
  runRule,
  seedSitemapEntries,
} from '../../../../test/int/rule-harness';
import { sitemapUrlNot200Rule } from './url-not-200.rule';

/**
 * `sitemap.url-not-200` integration test. Seeds `sitemap_entries` rows with the
 * diff columns already joined (the set-based UPDATE the SitemapService runs is
 * exercised in the discovery int-spec; here we assert the rule's read SQL):
 * a 404 in-crawl loc fires; a 200 in-crawl loc does not; a non-crawled loc does
 * not (that gap belongs to the orphan diff, #04).
 */
describe('sitemap.url-not-200 (int)', () => {
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

  it('flags in-crawl non-2xx locs, skips 200 and non-crawled', async () => {
    await seedSitemapEntries(auditId, [
      { loc: 'https://e.com/ok', inCrawl: true, statusCode: 200 },
      { loc: 'https://e.com/gone', inCrawl: true, statusCode: 404 },
      { loc: 'https://e.com/redir', inCrawl: true, statusCode: 301 },
      // listed but never crawled — owned by #04's orphan diff, not this rule
      { loc: 'https://e.com/never', inCrawl: false, statusCode: null },
    ]);

    const findings = await runRule(sitemapUrlNot200Rule, auditId);
    const byUrl = Object.fromEntries(findings.map((f) => [f.url, f.detail]));
    expect(Object.keys(byUrl).sort()).toEqual([
      'https://e.com/gone',
      'https://e.com/redir',
    ]);
    expect(byUrl['https://e.com/gone']).toMatchObject({ statusCode: 404 });
  });

  it('emits nothing when every listed crawled URL is 200', async () => {
    await seedSitemapEntries(auditId, [
      { loc: 'https://e.com/a', inCrawl: true, statusCode: 200 },
      { loc: 'https://e.com/b', inCrawl: true, statusCode: 204 },
    ]);
    expect(await runRule(sitemapUrlNot200Rule, auditId)).toEqual([]);
  });
});
