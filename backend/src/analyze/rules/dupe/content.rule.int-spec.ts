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
 * status filter. Each duplicate group emits ONE finding — origin URL (shortest)
 * plus `duplicateUrls` (the rest). Also asserts that non-HTML pages (sitemaps,
 * feeds) sharing a hash are excluded by the content-type gate, and that a
 * redirecting URL (non-empty redirect_chain, persisted with the FINAL page's
 * 2xx status + body hash) is never flagged.
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

  it('emits one finding per duplicate group: origin URL + the URLs that duplicate it', async () => {
    await seedPages(auditId, [
      { url: 'https://t/a', statusClass: '2xx', contentHash: 'dup' },
      { url: 'https://t/b', statusClass: '2xx', contentHash: 'dup' },
      { url: 'https://t/unique', statusClass: '2xx', contentHash: 'solo' },
      { url: 'https://t/nohash', statusClass: '2xx', contentHash: null },
      // shares the dup hash but is a redirect — must not count toward the group
      { url: 'https://t/redirect', statusClass: '3xx', contentHash: 'dup' },
    ]);

    const findings = await runRule(dupeContentRule, auditId);

    // One finding for the whole group; origin = shortest URL (both same length
    // here, so alphabetical: /a), and /b is listed as the duplicate.
    expect(findings).toHaveLength(1);
    expect(findings[0].url).toBe('https://t/a');
    expect(findings[0].detail).toEqual({
      contentHash: 'dup',
      duplicateCount: 2,
      duplicateUrls: ['https://t/b'],
    });
  });

  it('picks the shortest URL as origin and lists all the rest as duplicates', async () => {
    await seedPages(auditId, [
      { url: 'https://t/uk/page', statusClass: '2xx', contentHash: 'shared' },
      { url: 'https://t/x', statusClass: '2xx', contentHash: 'shared' },
      { url: 'https://t/ru/page', statusClass: '2xx', contentHash: 'shared' },
    ]);

    const findings = await runRule(dupeContentRule, auditId);

    expect(findings).toHaveLength(1);
    expect(findings[0].url).toBe('https://t/x'); // shortest
    expect(findings[0].detail).toEqual({
      contentHash: 'shared',
      duplicateCount: 3,
      duplicateUrls: ['https://t/ru/page', 'https://t/uk/page'],
    });
  });

  // Regression: audit 497c5cdc reported `https://streamtele.com/en/gsm-gateway/`
  // (a 301 → `/gsm-gateway-en/`) as duplicate content. `got` follows the redirect
  // transparently, so the requested URL is persisted with status_class='2xx' and
  // the FINAL page's content_hash — making it falsely collide with its own
  // redirect target. A redirecting URL has no content of its own and must be
  // excluded; the non-empty redirect_chain is what marks it as a redirect.
  it('does not flag a redirecting URL (2xx status, non-empty redirect_chain) as duplicate', async () => {
    await seedPages(auditId, [
      // the real destination page — genuine content, no redirect
      {
        url: 'https://streamtele.com/en/gsm-gateway-en/',
        statusClass: '2xx',
        contentHash: 'gsm-body',
        redirectChain: [],
      },
      // the requested URL that 301s to the destination: persisted as 2xx (got
      // followed the redirect) with the SAME body hash, but a redirect_chain
      // recording the hop. Must NOT be flagged, and must NOT pull the
      // destination into a dup group of its own.
      {
        url: 'https://streamtele.com/en/gsm-gateway/',
        statusClass: '2xx',
        contentHash: 'gsm-body',
        redirectChain: [
          { url: 'https://streamtele.com/en/gsm-gateway/', statusCode: 301 },
          { url: 'https://streamtele.com/en/gsm-gateway-en/', statusCode: 200 },
        ],
      },
    ]);

    const findings = await runRule(dupeContentRule, auditId);
    expect(findings).toEqual([]);
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

    expect(findings).toHaveLength(1);
    expect(findings[0].url).toBe('https://t/html-a'); // shortest, alphabetical
    // duplicateCount reflects only the 2 HTML pages, not the XML page
    expect(findings[0].detail).toEqual({
      contentHash: 'shared',
      duplicateCount: 2,
      duplicateUrls: ['https://t/html-b'],
    });
  });
});
