import {
  cleanupAudit,
  closePool,
  createAudit,
  runRule,
  seedPages,
} from '../../../../test/int/rule-harness';
import { indexLangViewportRule } from './lang-viewport.rule';

describe('index.lang-viewport (int)', () => {
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

  it('flags pages missing lang/charset/viewport and composes reason[]', async () => {
    await seedPages(auditId, [
      // healthy: all three present
      {
        url: 'https://t/ok',
        statusClass: '2xx',
        pageKind: 'html',
        htmlLang: 'en',
        charset: 'utf-8',
        hasViewport: true,
      },
      // missing lang only
      {
        url: 'https://t/nolang',
        statusClass: '2xx',
        pageKind: 'html',
        htmlLang: null,
        charset: 'utf-8',
        hasViewport: true,
      },
      // missing all three
      {
        url: 'https://t/none',
        statusClass: '2xx',
        pageKind: 'html',
        htmlLang: null,
        charset: null,
        hasViewport: false,
      },
      // non-2xx → excluded
      {
        url: 'https://t/404',
        statusClass: '4xx',
        pageKind: 'html',
        htmlLang: null,
        charset: null,
        hasViewport: false,
      },
    ]);

    const findings = await runRule(indexLangViewportRule, auditId);
    const byUrl = Object.fromEntries(findings.map((f) => [f.url, f.detail]));

    expect(findings.map((f) => f.url).sort()).toEqual(['https://t/nolang', 'https://t/none']);
    expect(byUrl['https://t/nolang']).toMatchObject({ reason: ['missing-lang'] });
    expect(byUrl['https://t/none']).toMatchObject({
      reason: ['missing-lang', 'missing-charset', 'missing-viewport'],
    });
  });
});
