import {
  closePool,
  cleanupAudit,
  createAudit,
  runRule,
  seedImages,
  seedPageResources,
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

  it('flags images with a 4xx/5xx status_code (legacy images column)', async () => {
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

  it('flags broken page_resources image rows (probe-populated) and dedupes against images', async () => {
    await seedImages(auditId, [
      { pageUrl: 'https://t/a', src: 'https://t/img/dup.png', statusCode: 500 },
    ]);
    await seedPageResources(auditId, [
      // same broken status as the images row → folded to one finding by UNION+DISTINCT
      {
        pageUrl: 'https://t/a',
        src: 'https://t/img/dup.png',
        kind: 'image',
        isHttps: true,
        statusCode: 500,
      },
      // probe-only broken row (no images counterpart)
      {
        pageUrl: 'https://t/a',
        src: 'https://t/img/probe-gone.jpg',
        kind: 'image',
        isHttps: true,
        statusCode: 503,
      },
      // healthy probe row → ignored
      {
        pageUrl: 'https://t/a',
        src: 'https://t/img/ok.jpg',
        kind: 'image',
        isHttps: true,
        statusCode: 200,
      },
      // non-image resource with a broken status → ignored
      {
        pageUrl: 'https://t/a',
        src: 'https://t/app.js',
        kind: 'script',
        isHttps: true,
        statusCode: 404,
      },
    ]);

    const findings = await runRule(imageBrokenRule, auditId);

    expect(findings).toEqual([
      { url: 'https://t/a', detail: { src: 'https://t/img/dup.png', statusCode: 500 } },
      { url: 'https://t/a', detail: { src: 'https://t/img/probe-gone.jpg', statusCode: 503 } },
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
