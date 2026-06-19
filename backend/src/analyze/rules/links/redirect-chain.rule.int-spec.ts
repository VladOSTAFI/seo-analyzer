import {
  closePool,
  cleanupAudit,
  createAudit,
  runRule,
  seedPages,
} from '../../../../test/int/rule-harness';
import { linksRedirectChainRule } from './redirect-chain.rule';

describe('links.redirect-chain (int)', () => {
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

  it('flags genuine multi-hop chains and loops, ignoring single 301s', async () => {
    // Chains are stored origin-inclusive (element 0 = requested url), so
    // hop count = array length - 1.
    await seedPages(auditId, [
      // trigger: genuine multi-hop chain (2 hops, all distinct urls) → not a loop
      {
        url: 'https://t/chain',
        redirectChain: [
          { url: 'https://t/chain', statusCode: 301 },
          { url: 'https://t/mid', statusCode: 301 },
          { url: 'https://t/final', statusCode: 200 },
        ],
      },
      // trigger: multi-element loop (a url repeats) → isLoop true
      {
        url: 'https://t/loop',
        redirectChain: [
          { url: 'https://t/loop', statusCode: 301 },
          { url: 'https://t/back', statusCode: 301 },
          { url: 'https://t/loop', statusCode: 301 },
        ],
      },
      // trigger: length-2 self-loop — fires via the loop branch despite length 2
      {
        url: 'https://t/selfloop',
        redirectChain: [
          { url: 'https://t/selfloop', statusCode: 301 },
          { url: 'https://t/selfloop', statusCode: 200 },
        ],
      },
      // NON-trigger: a single 301 (length 2, one hop, distinct urls) — the bug fix.
      // A benign single redirect must NOT be reported as a redirect chain.
      {
        url: 'https://t/single-301',
        redirectChain: [
          { url: 'https://t/single-301', statusCode: 301 },
          { url: 'https://t/single-301-final', statusCode: 200 },
        ],
      },
      // non-trigger: no chain (empty array default)
      { url: 'https://t/plain' },
    ]);

    const findings = await runRule(linksRedirectChainRule, auditId);

    const urls = findings.map((f) => f.url).sort();
    expect(urls).toEqual(['https://t/chain', 'https://t/loop', 'https://t/selfloop']);

    const chain = findings.find((f) => f.url === 'https://t/chain');
    expect(chain?.detail).toMatchObject({ hops: 2, isLoop: false });
    expect(chain?.detail?.chain).toEqual([
      { url: 'https://t/chain', statusCode: 301 },
      { url: 'https://t/mid', statusCode: 301 },
      { url: 'https://t/final', statusCode: 200 },
    ]);

    const loop = findings.find((f) => f.url === 'https://t/loop');
    expect(loop?.detail).toMatchObject({ hops: 2, isLoop: true });

    const selfloop = findings.find((f) => f.url === 'https://t/selfloop');
    expect(selfloop?.detail).toMatchObject({ hops: 1, isLoop: true });
  });
});
