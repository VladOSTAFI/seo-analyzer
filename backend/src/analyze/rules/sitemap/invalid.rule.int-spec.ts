import {
  cleanupAudit,
  closePool,
  createAudit,
  runRule,
  seedSitemapAudit,
} from '../../../../test/int/rule-harness';
import { sitemapInvalidRule } from './invalid.rule';

/**
 * `sitemap.invalid` integration test. Pure read of `audits.sitemap_audit`: seed
 * a mix of valid + invalid files and assert one finding per INVALID file, keyed
 * on the file URL, with the error list projected into the detail.
 */
describe('sitemap.invalid (int)', () => {
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

  it('flags only invalid files, keyed on the file URL', async () => {
    await seedSitemapAudit(auditId, {
      totalUrls: 3,
      files: [
        { url: 'https://e.com/good.xml', valid: true, urlCount: 3, bytes: 1024, errors: [] },
        {
          url: 'https://e.com/bad.xml',
          valid: false,
          urlCount: 0,
          bytes: 200,
          errors: ['malformed-xml'],
        },
        {
          url: 'https://e.com/huge.xml',
          valid: false,
          urlCount: 50000,
          bytes: 60000000,
          errors: ['limit-exceeded:urls'],
        },
      ],
    });

    const findings = await runRule(sitemapInvalidRule, auditId);
    expect(findings).toHaveLength(2);
    const byUrl = Object.fromEntries(findings.map((f) => [f.url, f.detail]));
    expect(byUrl['https://e.com/bad.xml']).toMatchObject({ errors: ['malformed-xml'] });
    expect(byUrl['https://e.com/huge.xml']).toMatchObject({
      errors: ['limit-exceeded:urls'],
      urlCount: 50000,
    });
    expect(byUrl['https://e.com/good.xml']).toBeUndefined();
  });

  it('emits nothing when every file is valid', async () => {
    await seedSitemapAudit(auditId, {
      totalUrls: 1,
      files: [{ url: 'https://e.com/s.xml', valid: true, urlCount: 1, bytes: 512, errors: [] }],
    });
    expect(await runRule(sitemapInvalidRule, auditId)).toEqual([]);
  });

  it('emits nothing when sitemap_audit is null (not assessed)', async () => {
    expect(await runRule(sitemapInvalidRule, auditId)).toEqual([]);
  });
});
