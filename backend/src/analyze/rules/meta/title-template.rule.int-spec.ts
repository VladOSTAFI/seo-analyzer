import {
  closePool,
  cleanupAudit,
  createAudit,
  runRule,
  seedPages,
} from '../../../../test/int/rule-harness';
import { metaTitleTemplateRule } from './title-template.rule';

// Feature-08 refinement: bounds are SERP PIXEL WIDTH (title_px), not char count.
// Defaults: SEO_TITLE_PX_MIN=200, SEO_TITLE_PX_MAX=580.

describe('meta.title.template (int) — pixel-width refined', () => {
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

  it('flags 2xx titles whose title_px is outside 200–580 with too-short/too-long', async () => {
    await seedPages(auditId, [
      // trigger: too narrow (< 200px)
      { url: 'https://t/short', statusClass: '2xx', title: ['Short'], titlePx: 120 },
      // trigger: too wide (> 580px) — a wide-glyph title that char-count would PASS
      { url: 'https://t/wide', statusClass: '2xx', title: ['WWW Mortgage Marketing'], titlePx: 610 },
      // non-trigger: in range
      { url: 'https://t/ok', statusClass: '2xx', title: ['A good title here'], titlePx: 420 },
      // non-trigger: no title
      { url: 'https://t/none', statusClass: '2xx', title: [], titlePx: null },
      // non-trigger: titlePx null (un-backfilled row)
      { url: 'https://t/nopx', statusClass: '2xx', title: ['Whatever'], titlePx: null },
      // non-trigger: non-2xx (status filter)
      { url: 'https://t/404', statusClass: '4xx', title: ['Short'], titlePx: 120 },
    ]);

    const findings = await runRule(metaTitleTemplateRule, auditId);

    expect(findings).toEqual([
      {
        url: 'https://t/short',
        detail: { title: 'Short', length: 120, pixelWidth: 120, recommendation: 'too-short' },
      },
      {
        url: 'https://t/wide',
        detail: {
          title: 'WWW Mortgage Marketing',
          length: 610,
          pixelWidth: 610,
          recommendation: 'too-long',
        },
      },
    ]);
  });
});
