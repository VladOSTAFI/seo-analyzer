import {
  cleanupAudit,
  closePool,
  createAudit,
  runRule,
  seedRobotsAudit,
} from '../../../../test/int/rule-harness';
import { robotsBlocksImportantRule } from './blocks-important.rule';

/**
 * `robots.blocks-important` integration test. The rule is a pure read of the
 * persisted `audits.robots_audit` jsonb, so we seed a known `issues[]` array and
 * assert one site-wide finding per issue with the per-row severity carried
 * through; an audit with no issues yields nothing.
 */
describe('robots.blocks-important (int)', () => {
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

  it('emits one site-wide finding per issue with the per-row severity', async () => {
    await seedRobotsAudit(auditId, {
      present: true,
      reachable: true,
      statusCode: 200,
      sitemapUrls: [],
      groups: [{ userAgent: '*', disallow: ['/'], allow: [] }],
      issues: [
        { kind: 'disallow-all', detail: 'whole site blocked', severity: 'critical' },
        { kind: 'disallow-important', detail: 'blocks /private', severity: 'high' },
        { kind: 'disallow-assets', detail: 'blocks /assets', severity: 'medium' },
        { kind: 'no-sitemap-directive', detail: 'no Sitemap:', severity: 'info' },
      ],
    });

    const findings = await runRule(robotsBlocksImportantRule, auditId);
    expect(findings).toHaveLength(4);
    // All site-wide.
    expect(findings.every((f) => f.url === null)).toBe(true);

    const byKind = Object.fromEntries(
      findings.map((f) => [(f.detail as { kind: string }).kind, f]),
    );
    expect(byKind['disallow-all'].severity).toBe('critical');
    expect(byKind['disallow-important'].severity).toBe('high');
    expect(byKind['disallow-assets'].severity).toBe('medium');
    expect(byKind['no-sitemap-directive'].severity).toBe('info');
    expect(byKind['disallow-important'].detail).toMatchObject({
      kind: 'disallow-important',
      detail: 'blocks /private',
    });
  });

  it('emits nothing when robots_audit has no issues', async () => {
    await seedRobotsAudit(auditId, {
      present: true,
      reachable: true,
      statusCode: 200,
      sitemapUrls: ['https://e.com/sitemap.xml'],
      groups: [{ userAgent: '*', disallow: [], allow: [] }],
      issues: [],
    });
    expect(await runRule(robotsBlocksImportantRule, auditId)).toEqual([]);
  });

  it('emits nothing when robots_audit is null (not assessed)', async () => {
    expect(await runRule(robotsBlocksImportantRule, auditId)).toEqual([]);
  });
});
