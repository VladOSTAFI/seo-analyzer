import {
  closePool,
  cleanupAudit,
  createAudit,
  runRule,
  seedLinks,
} from '../../../../test/int/rule-harness';
import { linksAnchorQualityRule } from './anchor-quality.rule';

describe('links.anchor-quality (int)', () => {
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

  it('flags empty (medium) and generic (low) internal anchors; ignores good + external anchors', async () => {
    await seedLinks(auditId, [
      // empty anchor (null) → medium
      { sourceUrl: 'https://t/a', href: 'https://t/x', type: 'internal', anchorText: null },
      // empty anchor ('') → medium
      { sourceUrl: 'https://t/a', href: 'https://t/y', type: 'internal', anchorText: '' },
      // generic anchor (EN) → low
      {
        sourceUrl: 'https://t/b',
        href: 'https://t/z',
        type: 'internal',
        anchorText: 'Click here',
      },
      // generic anchor (RU, with surrounding whitespace → btrim) → low
      {
        sourceUrl: 'https://t/b',
        href: 'https://t/ru',
        type: 'internal',
        anchorText: '  подробнее ',
      },
      // good descriptive anchor → no finding
      {
        sourceUrl: 'https://t/c',
        href: 'https://t/good',
        type: 'internal',
        anchorText: 'Our pricing plans',
      },
      // external empty anchor → ignored (rule is internal-only)
      { sourceUrl: 'https://t/c', href: 'https://ext/x', type: 'external', anchorText: null },
      // external generic anchor → ignored
      {
        sourceUrl: 'https://t/c',
        href: 'https://ext/y',
        type: 'external',
        anchorText: 'read more',
      },
    ]);

    const findings = await runRule(linksAnchorQualityRule, auditId);

    const byHref = new Map(findings.map((f) => [f.detail?.href as string, f]));

    // empty anchors → medium
    expect(byHref.get('https://t/x')).toMatchObject({
      url: 'https://t/a',
      severity: 'medium',
      detail: { anchorIssue: 'empty', anchorText: null },
    });
    expect(byHref.get('https://t/y')).toMatchObject({
      severity: 'medium',
      detail: { anchorIssue: 'empty' },
    });

    // generic anchors → low
    expect(byHref.get('https://t/z')).toMatchObject({
      url: 'https://t/b',
      severity: 'low',
      detail: { anchorIssue: 'generic', anchorText: 'Click here' },
    });
    expect(byHref.get('https://t/ru')).toMatchObject({
      severity: 'low',
      detail: { anchorIssue: 'generic' },
    });

    // good + external anchors produce nothing
    const hrefs = [...byHref.keys()].sort();
    expect(hrefs).toEqual(['https://t/ru', 'https://t/x', 'https://t/y', 'https://t/z']);
  });
});
