import {
  closePool,
  cleanupAudit,
  createAudit,
  runRule,
  seedImages,
} from '../../../../test/int/rule-harness';
import { imageBrokenRule } from './broken.rule';

describe('image.broken (int)', () => {
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

  it('flags images with a 4xx/5xx status_code', async () => {
    await seedImages(auditId, [
      { pageUrl: 'https://t/a', src: 'https://t/img/gone.png', statusCode: 404 },
    ]);

    const findings = await runRule(imageBrokenRule, auditId);

    expect(findings).toEqual([
      {
        url: 'https://t/a',
        detail: { src: 'https://t/img/gone.png', statusCode: 404 },
      },
    ]);
  });

  it('does not flag a healthy (2xx) or unresolved (null) image', async () => {
    await seedImages(auditId, [
      { pageUrl: 'https://t/a', src: 'https://t/img/ok.png', statusCode: 200 },
      { pageUrl: 'https://t/a', src: 'https://t/img/unknown.png', alt: 'x' },
    ]);

    const findings = await runRule(imageBrokenRule, auditId);

    expect(findings).toEqual([]);
  });
});
