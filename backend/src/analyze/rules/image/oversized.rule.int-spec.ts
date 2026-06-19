import {
  closePool,
  cleanupAudit,
  createAudit,
  runRule,
  seedPageResources,
} from '../../../../test/int/rule-harness';
import { imageOversizedRule } from './oversized.rule';

// Default IMAGE_MAX_BYTES is 200_000 (read at module-load in image-thresholds.ts).
describe('image.oversized (int)', () => {
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

  it('flags images at or above the byte budget and ignores smaller / unprobed', async () => {
    await seedPageResources(auditId, [
      // trigger: well over the 200KB budget
      {
        pageUrl: 'https://t/a',
        src: 'https://t/img/big.jpg',
        kind: 'image',
        isHttps: true,
        bytes: 1_800_000,
        format: 'jpeg',
      },
      // boundary: exactly the budget (>= fires)
      {
        pageUrl: 'https://t/a',
        src: 'https://t/img/edge.jpg',
        kind: 'image',
        isHttps: true,
        bytes: 200_000,
        format: 'jpeg',
      },
      // non-trigger: just under the budget
      {
        pageUrl: 'https://t/a',
        src: 'https://t/img/small.jpg',
        kind: 'image',
        isHttps: true,
        bytes: 199_999,
        format: 'jpeg',
      },
      // non-trigger: not probed (bytes null)
      { pageUrl: 'https://t/a', src: 'https://t/img/unprobed.jpg', kind: 'image', isHttps: true },
      // non-trigger: not an image resource
      {
        pageUrl: 'https://t/a',
        src: 'https://t/app.js',
        kind: 'script',
        isHttps: true,
        bytes: 999_999,
      },
    ]);

    const findings = await runRule(imageOversizedRule, auditId);

    expect(findings).toEqual([
      {
        url: 'https://t/a',
        detail: { src: 'https://t/img/big.jpg', bytes: 1_800_000, format: 'jpeg' },
      },
      {
        url: 'https://t/a',
        detail: { src: 'https://t/img/edge.jpg', bytes: 200_000, format: 'jpeg' },
      },
    ]);
  });
});
