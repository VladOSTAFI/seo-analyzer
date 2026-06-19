import {
  cleanupAudit,
  closePool,
  createAudit,
  runRule,
  seedPages,
} from '../../../../test/int/rule-harness';
import { computeSimhash } from '../../../crawl/simhash.util';
import { dupeNearContentRule } from './near-content.rule';

// Default: SEO_NEARDUP_MAX_HAMMING=3.

const BOILERPLATE = Array(25)
  .fill('our company provides excellent widgets and reliable service to every customer')
  .join(' ');

describe('dupe.near-content (int)', () => {
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

  it('flags near-identical (non-exact) bodies once per page; skips exact dups and unrelated pages', async () => {
    const baseText = `${BOILERPLATE} located in the central region downtown`;
    const nearText = baseText.replace('downtown', 'uptown'); // tiny edit → small Hamming
    const unrelatedText =
      'completely different prose about astronomy galaxies nebulae and distant quasars tonight evermore';

    const baseSig = computeSimhash(baseText)!;
    const nearSig = computeSimhash(nearText)!;
    const unrelatedSig = computeSimhash(unrelatedText)!;

    await seedPages(auditId, [
      // near-dup pair (different content hashes, similar simhash)
      {
        url: 'https://t/a',
        statusClass: '2xx',
        pageKind: 'html',
        contentHash: 'hash-a',
        contentSimhash: baseSig,
      },
      {
        url: 'https://t/b',
        statusClass: '2xx',
        pageKind: 'html',
        contentHash: 'hash-b',
        contentSimhash: nearSig,
      },
      // exact dup of A (same content hash) — must NOT be flagged by near-content
      {
        url: 'https://t/a-exact',
        statusClass: '2xx',
        pageKind: 'html',
        contentHash: 'hash-a',
        contentSimhash: baseSig,
      },
      // unrelated page — far Hamming, not flagged
      {
        url: 'https://t/unrelated',
        statusClass: '2xx',
        pageKind: 'html',
        contentHash: 'hash-u',
        contentSimhash: unrelatedSig,
      },
    ]);

    const findings = await runRule(dupeNearContentRule, auditId);

    // One unordered pair → exactly two findings (one per page in the pair).
    expect(findings.map((f) => f.url).sort()).toEqual(['https://t/a', 'https://t/b']);
    for (const f of findings) {
      expect(typeof (f.detail as { hamming: number }).hamming).toBe('number');
      expect((f.detail as { hamming: number }).hamming).toBeLessThanOrEqual(3);
    }
    // a's partner is b and vice-versa
    expect(findings.find((f) => f.url === 'https://t/a')?.detail).toMatchObject({
      nearUrl: 'https://t/b',
    });
    expect(findings.find((f) => f.url === 'https://t/b')?.detail).toMatchObject({
      nearUrl: 'https://t/a',
    });
  });
});
