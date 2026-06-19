import {
  closePool,
  cleanupAudit,
  createAudit,
  runRule,
  seedPages,
} from '../../../../test/int/rule-harness';
import { indexClickDepthRule } from './click-depth.rule';

describe('index.click-depth (int)', () => {
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

  // The rule reads SEO_MAX_DEPTH at module load; the default (3) is in effect.
  it('flags only pages deeper than the threshold (default 3); excludes non-html', async () => {
    await seedPages(auditId, [
      { url: 'https://t/d1', depth: 1, statusClass: '2xx', pageKind: 'html' },
      { url: 'https://t/d3', depth: 3, statusClass: '2xx', pageKind: 'html' },
      { url: 'https://t/d4', depth: 4, statusClass: '2xx', pageKind: 'html' },
      { url: 'https://t/d6', depth: 6, statusClass: '2xx', pageKind: 'html' },
      // non-trigger: deep but a feed (non-html)
      { url: 'https://t/feed', depth: 7, statusClass: '2xx', pageKind: 'feed' },
      // non-trigger: deep but non-2xx
      { url: 'https://t/d5-404', depth: 5, statusClass: '4xx', pageKind: 'html' },
    ]);

    const findings = await runRule(indexClickDepthRule, auditId);
    const urls = findings.map((f) => f.url).sort();
    expect(urls).toEqual(['https://t/d4', 'https://t/d6']);

    const d4 = findings.find((f) => f.url === 'https://t/d4');
    expect(d4?.detail).toEqual({ depth: 4 });
  });
});
