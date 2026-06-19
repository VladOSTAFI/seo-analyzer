import {
  closePool,
  cleanupAudit,
  createAudit,
  runRule,
  seedPages,
} from '../../../../test/int/rule-harness';
import { metaDescriptionTemplateRule } from './description-template.rule';

// Feature-08 refinement: bounds are SERP PIXEL WIDTH (desc_px), not char count.
// Defaults: SEO_DESC_PX_MIN=430, SEO_DESC_PX_MAX=920.

describe('meta.description.template (int) — pixel-width refined', () => {
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

  it('flags 2xx descriptions whose desc_px is outside 430–920 with too-short/too-long', async () => {
    await seedPages(auditId, [
      { url: 'https://t/short', statusClass: '2xx', metaDescription: ['Short'], descPx: 200 },
      { url: 'https://t/long', statusClass: '2xx', metaDescription: ['A very wide one'], descPx: 980 },
      { url: 'https://t/ok', statusClass: '2xx', metaDescription: ['A good description'], descPx: 600 },
      { url: 'https://t/none', statusClass: '2xx', metaDescription: [], descPx: null },
      { url: 'https://t/nopx', statusClass: '2xx', metaDescription: ['Whatever'], descPx: null },
      { url: 'https://t/404', statusClass: '4xx', metaDescription: ['Short'], descPx: 200 },
    ]);

    const findings = await runRule(metaDescriptionTemplateRule, auditId);

    expect(findings).toEqual([
      {
        url: 'https://t/long',
        detail: {
          description: 'A very wide one',
          length: 980,
          pixelWidth: 980,
          recommendation: 'too-long',
        },
      },
      {
        url: 'https://t/short',
        detail: { description: 'Short', length: 200, pixelWidth: 200, recommendation: 'too-short' },
      },
    ]);
  });
});
