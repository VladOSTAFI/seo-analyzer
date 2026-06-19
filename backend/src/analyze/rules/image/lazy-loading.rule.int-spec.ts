import {
  closePool,
  cleanupAudit,
  createAudit,
  runRule,
  seedImages,
} from '../../../../test/int/rule-harness';
import { imageLazyLoadingRule } from './lazy-loading.rule';

describe('image.lazy-loading (int)', () => {
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

  it('flags images that are not loading="lazy" (null or other) and ignores lazy ones', async () => {
    await seedImages(auditId, [
      // trigger: no loading attr
      { pageUrl: 'https://t/a', src: 'https://t/img/a.jpg' },
      // trigger: eager
      { pageUrl: 'https://t/a', src: 'https://t/img/b.jpg', loading: 'eager' },
      // non-trigger: lazy
      { pageUrl: 'https://t/a', src: 'https://t/img/c.jpg', loading: 'lazy' },
    ]);

    const findings = await runRule(imageLazyLoadingRule, auditId);

    expect(findings).toEqual([
      {
        url: 'https://t/a',
        confidence: 'medium',
        detail: { src: 'https://t/img/a.jpg', loading: null },
      },
      {
        url: 'https://t/a',
        confidence: 'medium',
        detail: { src: 'https://t/img/b.jpg', loading: 'eager' },
      },
    ]);
  });
});
