import {
  cleanupAudit,
  closePool,
  createAudit,
  runRule,
  seedPages,
} from '../../../../test/int/rule-harness';
import { indexCanonicalRule } from './canonical.rule';

/**
 * `index.canonical` integration test. Covers the two issue classes (missing,
 * non-self), the healthy self-canonical (no finding), and a non-2xx page with a
 * missing canonical to prove the status filter. Also asserts that non-HTML pages
 * (sitemaps, feeds) are excluded by the content-type gate.
 */
describe('index.canonical (integration)', () => {
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

  it('flags missing and non-self canonicals, skips self-canonical and non-2xx', async () => {
    await seedPages(auditId, [
      { url: 'https://t/missing', statusClass: '2xx', canonicalUrl: null },
      {
        url: 'https://t/nonself',
        statusClass: '2xx',
        isSelfCanonical: false,
        canonicalUrl: 'https://other/page',
      },
      {
        url: 'https://t/healthy',
        statusClass: '2xx',
        isSelfCanonical: true,
        canonicalUrl: 'https://t/healthy',
      },
      // missing canonical but a 404 — should be ignored
      { url: 'https://t/404', statusClass: '4xx', canonicalUrl: null },
    ]);

    const findings = await runRule(indexCanonicalRule, auditId);

    expect(findings).toHaveLength(2);
    const byUrl = Object.fromEntries(findings.map((f) => [f.url, f.detail]));
    expect(byUrl['https://t/missing']).toEqual({ issue: 'missing', canonicalUrl: null });
    expect(byUrl['https://t/nonself']).toEqual({
      issue: 'non-self',
      canonicalUrl: 'https://other/page',
    });
  });

  it('emits nothing when every page is self-canonical', async () => {
    await seedPages(auditId, [
      {
        url: 'https://t/ok',
        statusClass: '2xx',
        isSelfCanonical: true,
        canonicalUrl: 'https://t/ok',
      },
    ]);

    const findings = await runRule(indexCanonicalRule, auditId);
    expect(findings).toEqual([]);
  });

  it('produces zero findings for non-HTML pages with missing canonical', async () => {
    await seedPages(auditId, [
      // XML sitemap — 2xx, no canonical; must not trigger the rule
      {
        url: 'https://t/sitemap.xml',
        statusClass: '2xx',
        contentType: 'application/xml',
        canonicalUrl: null,
      },
      // RSS feed — 2xx, non-self canonical; must not trigger the rule
      {
        url: 'https://t/feed',
        statusClass: '2xx',
        contentType: 'application/rss+xml',
        isSelfCanonical: false,
        canonicalUrl: 'https://other/page',
      },
      // text/html with missing canonical — must still fire
      {
        url: 'https://t/html-missing',
        statusClass: '2xx',
        contentType: 'text/html',
        canonicalUrl: null,
      },
      // null content_type treated as HTML — must still fire
      { url: 'https://t/null-ct', statusClass: '2xx', contentType: null, canonicalUrl: null },
    ]);

    const findings = await runRule(indexCanonicalRule, auditId);

    const urls = findings.map((f) => f.url).sort();
    expect(urls).toEqual(['https://t/html-missing', 'https://t/null-ct']);
  });
});
