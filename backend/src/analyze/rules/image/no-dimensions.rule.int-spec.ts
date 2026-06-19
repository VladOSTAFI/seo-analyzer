import {
  closePool,
  cleanupAudit,
  createAudit,
  runRule,
  seedImages,
} from '../../../../test/int/rule-harness';
import { imageNoDimensionsRule } from './no-dimensions.rule';

describe('image.no-dimensions (int)', () => {
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

  it('flags images missing width and/or height, ignores fully-sized images', async () => {
    await seedImages(auditId, [
      // trigger: both absent
      { pageUrl: 'https://t/a', src: 'https://t/img/a.jpg' },
      // trigger: width only
      { pageUrl: 'https://t/a', src: 'https://t/img/b.jpg', width: 800 },
      // trigger: height only
      { pageUrl: 'https://t/a', src: 'https://t/img/c.jpg', height: 600 },
      // non-trigger: both present
      { pageUrl: 'https://t/a', src: 'https://t/img/sized.jpg', width: 800, height: 600 },
    ]);

    const findings = await runRule(imageNoDimensionsRule, auditId);

    expect(findings).toEqual([
      { url: 'https://t/a', detail: { src: 'https://t/img/a.jpg', width: null, height: null } },
      { url: 'https://t/a', detail: { src: 'https://t/img/b.jpg', width: 800, height: null } },
      { url: 'https://t/a', detail: { src: 'https://t/img/c.jpg', width: null, height: 600 } },
    ]);
  });
});
