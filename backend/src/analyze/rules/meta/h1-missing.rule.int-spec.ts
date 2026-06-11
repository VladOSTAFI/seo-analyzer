import {
  closePool,
  cleanupAudit,
  createAudit,
  runRule,
  seedPages,
} from '../../../../test/int/rule-harness';
import { metaH1MissingRule } from './h1-missing.rule';

describe('meta.h1.missing (int)', () => {
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

  it('flags 2xx pages with no h1, ignoring non-2xx and pages with an h1', async () => {
    await seedPages(auditId, [
      { url: 'https://t/missing', statusClass: '2xx', h1: [] },
      { url: 'https://t/has', statusClass: '2xx', h1: ['Heading'] },
      { url: 'https://t/404', statusClass: '4xx', h1: [] },
    ]);

    const findings = await runRule(metaH1MissingRule, auditId);

    expect(findings).toEqual([{ url: 'https://t/missing', detail: {} }]);
  });

  it('produces zero findings for non-HTML content types even when h1 is empty', async () => {
    await seedPages(auditId, [
      // XML sitemap with empty h1 — must be ignored
      { url: 'https://t/sitemap.xml', statusClass: '2xx', contentType: 'application/xml', h1: [] },
      // Atom feed with empty h1 — must be ignored
      {
        url: 'https://t/feed.atom',
        statusClass: '2xx',
        contentType: 'application/atom+xml',
        h1: [],
      },
      // text/html with empty h1 — must still fire
      {
        url: 'https://t/html-missing',
        statusClass: '2xx',
        contentType: 'text/html; charset=utf-8',
        h1: [],
      },
      // null content_type treated as HTML — must still fire
      { url: 'https://t/null-ct', statusClass: '2xx', contentType: null, h1: [] },
    ]);

    const findings = await runRule(metaH1MissingRule, auditId);

    const urls = findings.map((f) => f.url).sort();
    expect(urls).toEqual(['https://t/html-missing', 'https://t/null-ct']);
  });
});
