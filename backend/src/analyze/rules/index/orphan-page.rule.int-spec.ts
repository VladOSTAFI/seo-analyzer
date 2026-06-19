import {
  closePool,
  cleanupAudit,
  createAudit,
  runRule,
  seedPages,
} from '../../../../test/int/rule-harness';
import { indexOrphanPageRule } from './orphan-page.rule';

describe('index.orphan-page (int)', () => {
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

  it('flags live HTML pages with zero inlinks; excludes seed, non-html, non-2xx, and linked pages', async () => {
    await seedPages(auditId, [
      // trigger: live html, depth>0, zero inlinks
      {
        url: 'https://t/orphan',
        depth: 2,
        inlinkCount: 0,
        statusClass: '2xx',
        pageKind: 'html',
      },
      // non-trigger: has inlinks
      {
        url: 'https://t/linked',
        depth: 2,
        inlinkCount: 3,
        statusClass: '2xx',
        pageKind: 'html',
      },
      // non-trigger: seed (depth 0)
      {
        url: 'https://t/seed',
        depth: 0,
        inlinkCount: 0,
        statusClass: '2xx',
        pageKind: 'html',
      },
      // non-trigger: non-html page_kind
      {
        url: 'https://t/sitemap.xml',
        depth: 2,
        inlinkCount: 0,
        statusClass: '2xx',
        pageKind: 'sitemap',
      },
      // non-trigger: non-2xx status
      {
        url: 'https://t/notfound',
        depth: 2,
        inlinkCount: 0,
        statusClass: '4xx',
        pageKind: 'html',
      },
    ]);

    const findings = await runRule(indexOrphanPageRule, auditId);
    const urls = findings.map((f) => f.url).sort();
    expect(urls).toEqual(['https://t/orphan']);

    const orphan = findings[0];
    expect(orphan?.detail).toEqual({ depth: 2, inlinkCount: 0, inSitemap: false });
  });

  it('treats a null inlink_count as zero (orphan)', async () => {
    await seedPages(auditId, [
      {
        url: 'https://t/null-inlink',
        depth: 1,
        inlinkCount: null,
        statusClass: '2xx',
        pageKind: 'html',
      },
    ]);

    const findings = await runRule(indexOrphanPageRule, auditId);
    expect(findings.map((f) => f.url)).toEqual(['https://t/null-inlink']);
    expect(findings[0]?.detail).toEqual({ depth: 1, inlinkCount: 0, inSitemap: false });
  });
});
