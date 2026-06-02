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

  it('flags pages with >1 redirect hop, distinguishing loops from plain chains', async () => {
    await seedPages(auditId, [
      // trigger: plain chain (3 hops, all distinct urls) → not a loop
      {
        url: 'https://t/chain',
        redirectChain: [
          { url: 'https://t/chain', statusCode: 301 },
          { url: 'https://t/mid', statusCode: 301 },
          { url: 'https://t/final', statusCode: 200 },
        ],
      },
      // trigger: loop (a url repeats) → isLoop true
      {
        url: 'https://t/loop',
        redirectChain: [
          { url: 'https://t/loop', statusCode: 301 },
          { url: 'https://t/back', statusCode: 301 },
          { url: 'https://t/loop', statusCode: 301 },
        ],
      },
      // non-trigger: single hop (length 1)
      {
        url: 'https://t/single',
        redirectChain: [{ url: 'https://t/single', statusCode: 200 }],
      },
      // non-trigger: no chain (empty array default)
      { url: 'https://t/plain' },
    ]);

    const findings = await runRule(linksRedirectChainRule, auditId);

    expect(findings).toHaveLength(2);

    const chain = findings.find((f) => f.url === 'https://t/chain');
    expect(chain?.detail).toMatchObject({ hops: 3, isLoop: false });
    expect(chain?.detail?.chain).toEqual([
      { url: 'https://t/chain', statusCode: 301 },
      { url: 'https://t/mid', statusCode: 301 },
      { url: 'https://t/final', statusCode: 200 },
    ]);

    const loop = findings.find((f) => f.url === 'https://t/loop');
    expect(loop?.detail).toMatchObject({ hops: 3, isLoop: true });
  });
});
