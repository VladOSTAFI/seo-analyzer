import {
  closePool,
  cleanupAudit,
  createAudit,
  runRule,
  seedImages,
} from '../../../../test/int/rule-harness';
import { imageAltQualityRule } from './alt-quality.rule';

// Defaults: IMAGE_ALT_MAX_LEN=125, IMAGE_ALT_MAX_COMMAS=4.
describe('image.alt-quality (int)', () => {
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

  it('classifies filename-as-alt / too-long / keyword-stuffed; ignores good and empty alt', async () => {
    const longAlt = 'x'.repeat(126); // > 125
    await seedImages(auditId, [
      // filename-as-alt: alt equals the basename without extension
      { pageUrl: 'https://t/a', src: 'https://t/img/hero-banner.jpg', alt: 'hero-banner' },
      // filename-as-alt: alt equals the full basename with extension
      { pageUrl: 'https://t/a', src: 'https://t/img/logo.png', alt: 'logo.png' },
      // too-long
      { pageUrl: 'https://t/a', src: 'https://t/img/long.jpg', alt: longAlt },
      // keyword-stuffed: 4 commas (>= threshold)
      { pageUrl: 'https://t/a', src: 'https://t/img/stuffed.jpg', alt: 'a,b,c,d,e' },
      // good descriptive alt → not flagged
      {
        pageUrl: 'https://t/a',
        src: 'https://t/img/good.jpg',
        alt: 'Olimp Strong main training floor',
      },
      // empty / missing alt → owned by image.alt-title, not flagged here
      { pageUrl: 'https://t/a', src: 'https://t/img/empty.jpg', alt: '' },
      { pageUrl: 'https://t/a', src: 'https://t/img/none.jpg' },
    ]);

    const findings = await runRule(imageAltQualityRule, auditId);

    expect(findings).toEqual([
      {
        url: 'https://t/a',
        confidence: 'medium',
        detail: {
          src: 'https://t/img/hero-banner.jpg',
          alt: 'hero-banner',
          qualityIssue: 'filename-as-alt',
        },
      },
      {
        url: 'https://t/a',
        confidence: 'medium',
        detail: { src: 'https://t/img/logo.png', alt: 'logo.png', qualityIssue: 'filename-as-alt' },
      },
      {
        url: 'https://t/a',
        confidence: 'medium',
        detail: { src: 'https://t/img/long.jpg', alt: longAlt, qualityIssue: 'too-long' },
      },
      {
        url: 'https://t/a',
        confidence: 'medium',
        detail: {
          src: 'https://t/img/stuffed.jpg',
          alt: 'a,b,c,d,e',
          qualityIssue: 'keyword-stuffed',
        },
      },
    ]);
  });
});
