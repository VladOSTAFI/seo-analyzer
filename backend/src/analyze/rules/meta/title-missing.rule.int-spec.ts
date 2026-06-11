import {
  closePool,
  cleanupAudit,
  createAudit,
  runRule,
  seedPages,
} from '../../../../test/int/rule-harness';
import { metaTitleMissingRule } from './title-missing.rule';

describe('meta.title.missing (int)', () => {
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

  it('flags 2xx pages with no title, ignoring non-2xx and titled pages', async () => {
    await seedPages(auditId, [
      // trigger: 2xx, empty title
      { url: 'https://t/missing', statusClass: '2xx', title: [] },
      // non-trigger: 2xx WITH a title
      { url: 'https://t/has', statusClass: '2xx', title: ['Home'] },
      // non-trigger: non-2xx with empty title (status filter)
      { url: 'https://t/404', statusClass: '4xx', title: [] },
    ]);

    const findings = await runRule(metaTitleMissingRule, auditId);

    expect(findings).toEqual([{ url: 'https://t/missing', detail: {} }]);
  });

  it('produces zero findings for non-HTML content types even when title is empty', async () => {
    await seedPages(auditId, [
      // XML sitemap with empty title — must be ignored
      {
        url: 'https://t/sitemap.xml',
        statusClass: '2xx',
        contentType: 'application/xml',
        title: [],
      },
      // RSS feed with empty title — must be ignored
      { url: 'https://t/feed', statusClass: '2xx', contentType: 'application/rss+xml', title: [] },
      // plain-text with empty title — must be ignored
      { url: 'https://t/robots.txt', statusClass: '2xx', contentType: 'text/plain', title: [] },
      // text/html with empty title — must still fire
      {
        url: 'https://t/html-missing',
        statusClass: '2xx',
        contentType: 'text/html; charset=utf-8',
        title: [],
      },
      // null content_type treated as HTML — must still fire
      { url: 'https://t/null-ct', statusClass: '2xx', contentType: null, title: [] },
    ]);

    const findings = await runRule(metaTitleMissingRule, auditId);

    const urls = findings.map((f) => f.url).sort();
    expect(urls).toEqual(['https://t/html-missing', 'https://t/null-ct']);
  });
});
