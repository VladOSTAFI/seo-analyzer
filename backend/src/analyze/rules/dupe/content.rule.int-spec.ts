import {
  cleanupAudit,
  closePool,
  createAudit,
  runRule,
  seedPages,
} from '../../../../test/int/rule-harness';
import { dupeContentRule } from './content.rule';

/**
 * `dupe.content` integration test. Seeds a duplicate-hash group, a unique-hash
 * page, a null-hash page, and a non-2xx page sharing the dup hash to prove the
 * status filter. Only the two members of the 2xx dup group should be flagged.
 * Also asserts that non-HTML pages (sitemaps, feeds) sharing a hash are excluded
 * by the content-type gate.
 */
describe('dupe.content (integration)', () => {
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

  it('flags every 2xx page sharing a content hash and ignores unique/null/non-2xx pages', async () => {
    await seedPages(auditId, [
      { url: 'https://t/a', statusClass: '2xx', contentHash: 'dup' },
      { url: 'https://t/b', statusClass: '2xx', contentHash: 'dup' },
      { url: 'https://t/unique', statusClass: '2xx', contentHash: 'solo' },
      { url: 'https://t/nohash', statusClass: '2xx', contentHash: null },
      // shares the dup hash but is a redirect — must not count toward the group
      { url: 'https://t/redirect', statusClass: '3xx', contentHash: 'dup' },
    ]);

    const findings = await runRule(dupeContentRule, auditId);

    expect(findings).toHaveLength(2);
    expect(findings.map((f) => f.url).sort()).toEqual(['https://t/a', 'https://t/b']);
    for (const f of findings) {
      expect(f.detail).toEqual({ contentHash: 'dup', duplicateCount: 2 });
    }
  });

  it('emits nothing when every hash is unique', async () => {
    await seedPages(auditId, [
      { url: 'https://t/x', statusClass: '2xx', contentHash: 'h1' },
      { url: 'https://t/y', statusClass: '2xx', contentHash: 'h2' },
    ]);

    const findings = await runRule(dupeContentRule, auditId);
    expect(findings).toEqual([]);
  });

  it('does not flag non-HTML pages even when they share a content hash with an HTML page', async () => {
    await seedPages(auditId, [
      // two XML sitemaps sharing a hash — must not fire (content_type gate)
      {
        url: 'https://t/sitemap-a.xml',
        statusClass: '2xx',
        contentType: 'application/xml',
        contentHash: 'xml-dup',
      },
      {
        url: 'https://t/sitemap-b.xml',
        statusClass: '2xx',
        contentType: 'application/xml',
        contentHash: 'xml-dup',
      },
      // an HTML page with a unique hash — must not fire (not a dup)
      {
        url: 'https://t/html-unique',
        statusClass: '2xx',
        contentType: 'text/html',
        contentHash: 'unique-html',
      },
    ]);

    const findings = await runRule(dupeContentRule, auditId);
    expect(findings).toEqual([]);
  });

  it('only counts HTML pages toward duplicate groups, ignoring XML siblings with same hash', async () => {
    await seedPages(auditId, [
      // two HTML pages sharing a hash — must fire
      {
        url: 'https://t/html-a',
        statusClass: '2xx',
        contentType: 'text/html',
        contentHash: 'shared',
      },
      {
        url: 'https://t/html-b',
        statusClass: '2xx',
        contentType: 'text/html',
        contentHash: 'shared',
      },
      // XML page with same hash — must NOT be counted or flagged
      {
        url: 'https://t/feed.xml',
        statusClass: '2xx',
        contentType: 'application/xml',
        contentHash: 'shared',
      },
    ]);

    const findings = await runRule(dupeContentRule, auditId);

    expect(findings).toHaveLength(2);
    const urls = findings.map((f) => f.url).sort();
    expect(urls).toEqual(['https://t/html-a', 'https://t/html-b']);
    for (const f of findings) {
      // duplicateCount reflects only the 2 HTML pages, not the XML page
      expect(f.detail).toEqual({ contentHash: 'shared', duplicateCount: 2 });
    }
  });
});
