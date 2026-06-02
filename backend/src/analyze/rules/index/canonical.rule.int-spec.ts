import {
  cleanupAudit,
  closePool,
  createAudit,
  runRule,
  seedPages,
} from '../../../../test/int/rule-harness';
import { indexCanonicalRule } from './canonical.rule';

/**
 * `index.canonical` integration test. Covers the two issue classes (missing,
 * non-self), the healthy self-canonical (no finding), and a non-2xx page with a
 * missing canonical to prove the status filter.
 */
describe('index.canonical (integration)', () => {
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

  it('flags missing and non-self canonicals, skips self-canonical and non-2xx', async () => {
    await seedPages(auditId, [
      { url: 'https://t/missing', statusClass: '2xx', canonicalUrl: null },
      {
        url: 'https://t/nonself',
        statusClass: '2xx',
        isSelfCanonical: false,
        canonicalUrl: 'https://other/page',
      },
      {
        url: 'https://t/healthy',
        statusClass: '2xx',
        isSelfCanonical: true,
        canonicalUrl: 'https://t/healthy',
      },
      // missing canonical but a 404 — should be ignored
      { url: 'https://t/404', statusClass: '4xx', canonicalUrl: null },
    ]);

    const findings = await runRule(indexCanonicalRule, auditId);

    expect(findings).toHaveLength(2);
    const byUrl = Object.fromEntries(findings.map((f) => [f.url, f.detail]));
    expect(byUrl['https://t/missing']).toEqual({ issue: 'missing', canonicalUrl: null });
    expect(byUrl['https://t/nonself']).toEqual({
      issue: 'non-self',
      canonicalUrl: 'https://other/page',
    });
  });

  it('emits nothing when every page is self-canonical', async () => {
    await seedPages(auditId, [
      {
        url: 'https://t/ok',
        statusClass: '2xx',
        isSelfCanonical: true,
        canonicalUrl: 'https://t/ok',
      },
    ]);

    const findings = await runRule(indexCanonicalRule, auditId);
    expect(findings).toEqual([]);
  });
});
