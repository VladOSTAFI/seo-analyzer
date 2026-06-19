import {
  cleanupAudit,
  closePool,
  createAudit,
  runRule,
  seedPages,
  seedPageResources,
} from '../../../../test/int/rule-harness';
import { pageWeightRule } from './weight.rule';

// Defaults: PAGE_WEIGHT_MAX_BYTES=3_000_000, PAGE_REQUEST_MAX=80.

describe('page.weight (int)', () => {
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

  it('flags pages over the byte and/or request budget; ignores light pages', async () => {
    await seedPages(auditId, [
      { url: 'https://t/heavy', statusClass: '2xx', pageKind: 'html' },
      { url: 'https://t/many', statusClass: '2xx', pageKind: 'html' },
      { url: 'https://t/light', statusClass: '2xx', pageKind: 'html' },
    ]);

    // heavy: one 4MB resource → over bytes
    await seedPageResources(auditId, [
      { pageUrl: 'https://t/heavy', src: 'https://cdn/big.js', kind: 'script', isHttps: true, bytes: 4_000_000 },
    ]);
    // many: 81 small resources → over request count
    await seedPageResources(
      auditId,
      Array.from({ length: 81 }, (_, i) => ({
        pageUrl: 'https://t/many',
        src: `https://cdn/r${i}.js`,
        kind: 'script' as const,
        isHttps: true,
        bytes: 100,
      })),
    );
    // light: a couple of small resources → under both
    await seedPageResources(auditId, [
      { pageUrl: 'https://t/light', src: 'https://cdn/a.js', kind: 'script', isHttps: true, bytes: 1000 },
    ]);

    const findings = await runRule(pageWeightRule, auditId);
    const byUrl = Object.fromEntries(findings.map((f) => [f.url, f.detail]));

    expect(findings.map((f) => f.url).sort()).toEqual(['https://t/heavy', 'https://t/many']);
    expect(byUrl['https://t/heavy']).toMatchObject({ reason: ['over-bytes'] });
    expect(byUrl['https://t/many']).toMatchObject({ reason: ['over-requests'] });
  });
});
