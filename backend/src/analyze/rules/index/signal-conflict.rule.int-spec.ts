import {
  closePool,
  cleanupAudit,
  createAudit,
  runRule,
  seedPages,
} from '../../../../test/int/rule-harness';
import { indexSignalConflictRule } from './signal-conflict.rule';

describe('index.signal-conflict (int)', () => {
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

  /** Find the (url, conflict) finding, asserting at most one. */
  function conflictsFor(
    findings: Awaited<ReturnType<typeof runRule>>,
    url: string,
  ): { conflict: string; target: string | null; confidence?: string }[] {
    return findings
      .filter((f) => f.url === url)
      .map((f) => ({
        conflict: f.detail?.conflict as string,
        target: (f.detail?.target as string | null) ?? null,
        confidence: f.confidence,
      }));
  }

  it('detects each of the 5 sub-checks and ignores healthy pages', async () => {
    await seedPages(auditId, [
      // 1) noindex AND discovered via sitemap → noindex-in-sitemap (confidence medium)
      {
        url: 'https://t/noindex-sitemap',
        statusClass: '2xx',
        pageKind: 'html',
        crawlSource: 'sitemap',
        metaRobots: 'noindex,follow',
      },
      // 2) canonical -> noindex target
      {
        url: 'https://t/can-to-noindex',
        statusClass: '2xx',
        pageKind: 'html',
        isSelfCanonical: false,
        canonicalUrl: 'https://t/noindex-target',
      },
      {
        url: 'https://t/noindex-target',
        statusClass: '2xx',
        pageKind: 'html',
        metaRobots: 'noindex',
      },
      // 3) canonical -> non-200 target (3xx)
      {
        url: 'https://t/can-to-3xx',
        statusClass: '2xx',
        pageKind: 'html',
        isSelfCanonical: false,
        canonicalUrl: 'https://t/redirecting',
      },
      {
        url: 'https://t/redirecting',
        statusClass: '3xx',
        pageKind: 'html',
      },
      // 5) canonical chain A -> B (B is non-self-canonical -> B -> C)
      {
        url: 'https://t/chain-a',
        statusClass: '2xx',
        pageKind: 'html',
        isSelfCanonical: false,
        canonicalUrl: 'https://t/chain-b',
      },
      {
        url: 'https://t/chain-b',
        statusClass: '2xx',
        pageKind: 'html',
        isSelfCanonical: false,
        canonicalUrl: 'https://t/chain-c',
      },
      // healthy negative: self-canonical 200 page → no finding
      {
        url: 'https://t/healthy',
        statusClass: '2xx',
        pageKind: 'html',
        isSelfCanonical: true,
        canonicalUrl: 'https://t/healthy',
      },
      // negative: canonical points off-crawl (no target row) → no finding
      {
        url: 'https://t/can-offsite',
        statusClass: '2xx',
        pageKind: 'html',
        isSelfCanonical: false,
        canonicalUrl: 'https://external.example/nowhere',
      },
    ]);

    const findings = await runRule(indexSignalConflictRule, auditId);

    // sub-check 1
    const sitemap = conflictsFor(findings, 'https://t/noindex-sitemap');
    expect(sitemap).toEqual([
      { conflict: 'noindex-in-sitemap', target: null, confidence: 'medium' },
    ]);

    // sub-check 2
    expect(conflictsFor(findings, 'https://t/can-to-noindex')).toEqual([
      {
        conflict: 'canonical-to-noindex',
        target: 'https://t/noindex-target',
        confidence: undefined,
      },
    ]);

    // sub-check 3
    expect(conflictsFor(findings, 'https://t/can-to-3xx')).toEqual([
      { conflict: 'canonical-to-non-200', target: 'https://t/redirecting', confidence: undefined },
    ]);

    // sub-check 4 emitted on the noindex target (it is the canonical target of others)
    const noindexTarget = conflictsFor(findings, 'https://t/noindex-target');
    expect(noindexTarget).toContainEqual({
      conflict: 'noindex-canonical-target',
      target: 'https://t/can-to-noindex',
      confidence: undefined,
    });

    // sub-check 5: chain-a -> chain-b (chain-b is non-self-canonical)
    expect(conflictsFor(findings, 'https://t/chain-a')).toContainEqual({
      conflict: 'canonical-chain',
      target: 'https://t/chain-c',
      confidence: undefined,
    });

    // healthy + off-crawl produce no findings
    expect(conflictsFor(findings, 'https://t/healthy')).toEqual([]);
    expect(conflictsFor(findings, 'https://t/can-offsite')).toEqual([]);
  });

  it('matches canonical against both url (pre-redirect) and final_url (post-redirect)', async () => {
    await seedPages(auditId, [
      // canonical points to a target's FINAL url (post-redirect form)
      {
        url: 'https://t/src-finalurl',
        statusClass: '2xx',
        pageKind: 'html',
        isSelfCanonical: false,
        canonicalUrl: 'https://t/target-final',
      },
      {
        url: 'https://t/target-pre',
        finalUrl: 'https://t/target-final',
        statusClass: '2xx',
        pageKind: 'html',
        metaRobots: 'noindex',
      },
    ]);

    const findings = await runRule(indexSignalConflictRule, auditId);
    expect(conflictsFor(findings, 'https://t/src-finalurl')).toContainEqual({
      conflict: 'canonical-to-noindex',
      target: 'https://t/target-pre',
      confidence: undefined,
    });
  });

  it('emits two findings when one page hits two sub-checks', async () => {
    await seedPages(auditId, [
      // canonical target is BOTH noindex AND non-200 (4xx)
      {
        url: 'https://t/double',
        statusClass: '2xx',
        pageKind: 'html',
        isSelfCanonical: false,
        canonicalUrl: 'https://t/bad-target',
      },
      {
        url: 'https://t/bad-target',
        statusClass: '4xx',
        pageKind: 'html',
        metaRobots: 'noindex',
      },
    ]);

    const findings = await runRule(indexSignalConflictRule, auditId);
    const conflicts = conflictsFor(findings, 'https://t/double')
      .map((c) => c.conflict)
      .sort();
    expect(conflicts).toEqual(['canonical-to-noindex', 'canonical-to-non-200']);
  });
});
