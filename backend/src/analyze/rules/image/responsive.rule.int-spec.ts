import {
  closePool,
  cleanupAudit,
  createAudit,
  runRule,
  seedImages,
} from '../../../../test/int/rule-harness';
import { imageResponsiveRule } from './responsive.rule';

// Default IMAGE_RESPONSIVE_MIN_WIDTH is 640.
describe('image.responsive (int)', () => {
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

  it('flags large or unknown-width images without srcset; ignores small or srcset images', async () => {
    await seedImages(auditId, [
      // trigger: large, no srcset
      { pageUrl: 'https://t/a', src: 'https://t/img/big.jpg', width: 1200, hasSrcset: false },
      // trigger boundary: width exactly the floor, no srcset
      { pageUrl: 'https://t/a', src: 'https://t/img/edge.jpg', width: 640, hasSrcset: false },
      // trigger: unknown width (null), no srcset
      { pageUrl: 'https://t/a', src: 'https://t/img/unknown.jpg', hasSrcset: false },
      // non-trigger: small, no srcset
      { pageUrl: 'https://t/a', src: 'https://t/img/small.jpg', width: 320, hasSrcset: false },
      // non-trigger: large but has srcset
      { pageUrl: 'https://t/a', src: 'https://t/img/resp.jpg', width: 1600, hasSrcset: true },
    ]);

    const findings = await runRule(imageResponsiveRule, auditId);

    expect(findings).toEqual([
      {
        url: 'https://t/a',
        confidence: 'medium',
        detail: { src: 'https://t/img/big.jpg', width: 1200, hasSrcset: false },
      },
      {
        url: 'https://t/a',
        confidence: 'medium',
        detail: { src: 'https://t/img/edge.jpg', width: 640, hasSrcset: false },
      },
      {
        url: 'https://t/a',
        confidence: 'medium',
        detail: { src: 'https://t/img/unknown.jpg', width: null, hasSrcset: false },
      },
    ]);
  });
});
