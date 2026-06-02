import {
  cleanupAudit,
  closePool,
  createAudit,
  runRule,
  seedPages,
} from '../../../../test/int/rule-harness';
import { indexRobotsRule } from './robots.rule';

/**
 * `index.robots` integration test. Covers each signal individually, a page
 * tripping multiple signals (composed reason), an indexable page (no finding),
 * and a non-2xx noindex page to prove the status filter.
 */
describe('index.robots (integration)', () => {
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

  it('flags noindex live pages with composed reasons and skips indexable/non-2xx', async () => {
    await seedPages(auditId, [
      { url: 'https://t/meta', statusClass: '2xx', metaRobots: 'noindex,follow' },
      { url: 'https://t/header', statusClass: '2xx', xRobotsTag: 'noindex' },
      { url: 'https://t/blocked', statusClass: '2xx', blockedByRobotsTxt: true },
      {
        url: 'https://t/both',
        statusClass: '2xx',
        metaRobots: 'noindex',
        blockedByRobotsTxt: true,
      },
      { url: 'https://t/ok', statusClass: '2xx', metaRobots: 'index,follow' },
      // noindex but a redirect — ignored by the 2xx filter
      { url: 'https://t/redirect', statusClass: '3xx', metaRobots: 'noindex' },
    ]);

    const findings = await runRule(indexRobotsRule, auditId);
    const byUrl = Object.fromEntries(findings.map((f) => [f.url, f.detail]));

    expect(findings).toHaveLength(4);
    expect(byUrl['https://t/meta']).toMatchObject({
      reason: ['meta-noindex'],
      metaRobots: 'noindex,follow',
    });
    expect(byUrl['https://t/header']).toMatchObject({ reason: ['x-robots-noindex'] });
    expect(byUrl['https://t/blocked']).toMatchObject({
      reason: ['robots-txt-blocked'],
      blockedByRobotsTxt: true,
    });
    expect(byUrl['https://t/both']).toMatchObject({
      reason: ['meta-noindex', 'robots-txt-blocked'],
    });
  });

  it('emits nothing when every live page is indexable', async () => {
    await seedPages(auditId, [
      { url: 'https://t/a', statusClass: '2xx', metaRobots: 'index,follow' },
      { url: 'https://t/b', statusClass: '2xx' },
    ]);

    const findings = await runRule(indexRobotsRule, auditId);
    expect(findings).toEqual([]);
  });
});
