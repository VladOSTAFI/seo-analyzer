import {
  cleanupAudit,
  closePool,
  createAudit,
  runRule,
  seedPages,
} from '../../../../test/int/rule-harness';
import { contentThinRule } from './thin.rule';

// Defaults: SEO_THIN_WORDS=200, SEO_THIN_RATIO=0.1.

describe('content.thin (int)', () => {
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

  it('flags low-word / low-ratio 2xx html pages and composes reason[]', async () => {
    await seedPages(auditId, [
      // low words only (well above ratio: 50*6/1000 = 0.3 ratio is fine)
      { url: 'https://t/thin', statusClass: '2xx', pageKind: 'html', wordCount: 50, htmlBytes: 1000 },
      // low ratio only: 400 words but huge HTML → 400*6/40000 = 0.06 < 0.1
      {
        url: 'https://t/bloated',
        statusClass: '2xx',
        pageKind: 'html',
        wordCount: 400,
        htmlBytes: 40000,
      },
      // healthy: 400 words, modest HTML → above both thresholds
      {
        url: 'https://t/ok',
        statusClass: '2xx',
        pageKind: 'html',
        wordCount: 400,
        htmlBytes: 8000,
      },
      // word_count null → excluded
      { url: 'https://t/null', statusClass: '2xx', pageKind: 'html', wordCount: null, htmlBytes: 100 },
      // non-2xx → excluded
      { url: 'https://t/404', statusClass: '4xx', pageKind: 'html', wordCount: 10, htmlBytes: 1000 },
      // non-html → excluded
      {
        url: 'https://t/feed',
        statusClass: '2xx',
        pageKind: 'feed',
        wordCount: 10,
        htmlBytes: 1000,
      },
    ]);

    const findings = await runRule(contentThinRule, auditId);
    const byUrl = Object.fromEntries(findings.map((f) => [f.url, f.detail]));

    expect(findings.map((f) => f.url).sort()).toEqual(['https://t/bloated', 'https://t/thin']);
    expect(byUrl['https://t/thin']).toMatchObject({ wordCount: 50, reason: ['low-words'] });
    expect(byUrl['https://t/bloated']).toMatchObject({ wordCount: 400, reason: ['low-ratio'] });
  });
});
