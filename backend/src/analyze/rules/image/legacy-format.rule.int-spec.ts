import {
  closePool,
  cleanupAudit,
  createAudit,
  runRule,
  seedPageResources,
} from '../../../../test/int/rule-harness';
import { imageLegacyFormatRule } from './legacy-format.rule';

// Default IMAGE_LEGACY_MIN_BYTES is 50_000.
describe('image.legacy-format (int)', () => {
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

  it('flags large jpeg/png/gif and ignores next-gen / tiny / non-image rows', async () => {
    await seedPageResources(auditId, [
      // trigger: large jpeg
      {
        pageUrl: 'https://t/a',
        src: 'https://t/img/photo.jpg',
        kind: 'image',
        isHttps: true,
        bytes: 120_000,
        format: 'jpeg',
      },
      // trigger boundary: png exactly at the floor (>= fires)
      {
        pageUrl: 'https://t/a',
        src: 'https://t/img/banner.png',
        kind: 'image',
        isHttps: true,
        bytes: 50_000,
        format: 'png',
      },
      // non-trigger: next-gen format (webp)
      {
        pageUrl: 'https://t/a',
        src: 'https://t/img/hero.webp',
        kind: 'image',
        isHttps: true,
        bytes: 300_000,
        format: 'webp',
      },
      // non-trigger: tiny legacy icon below the floor
      {
        pageUrl: 'https://t/a',
        src: 'https://t/img/icon.png',
        kind: 'image',
        isHttps: true,
        bytes: 1_200,
        format: 'png',
      },
      // non-trigger: svg (vector, not a legacy raster)
      {
        pageUrl: 'https://t/a',
        src: 'https://t/img/logo.svg',
        kind: 'image',
        isHttps: true,
        bytes: 80_000,
        format: 'svg',
      },
    ]);

    const findings = await runRule(imageLegacyFormatRule, auditId);

    expect(findings).toEqual([
      {
        url: 'https://t/a',
        detail: { src: 'https://t/img/banner.png', bytes: 50_000, format: 'png' },
      },
      {
        url: 'https://t/a',
        detail: { src: 'https://t/img/photo.jpg', bytes: 120_000, format: 'jpeg' },
      },
    ]);
  });
});
