import {
  cleanupAudit,
  closePool,
  createAudit,
  runRule,
  seedPages,
  seedPageResources,
} from '../../../../test/int/rule-harness';
import { securityMixedContentRule } from './mixed-content.rule';

describe('security.mixed-content (int)', () => {
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

  it('flags HTTP sub-resources on HTTPS pages, one finding per resource', async () => {
    await seedPages(auditId, [
      { url: 'https://t/secure', statusClass: '2xx', pageKind: 'html', finalUrl: 'https://t/secure' },
      { url: 'http://t/insecure', statusClass: '2xx', pageKind: 'html', finalUrl: 'http://t/insecure' },
    ]);
    await seedPageResources(auditId, [
      // HTTP resource on the HTTPS page → flagged
      { pageUrl: 'https://t/secure', src: 'http://cdn/a.js', kind: 'script', isHttps: false },
      // HTTPS resource on the HTTPS page → not flagged
      { pageUrl: 'https://t/secure', src: 'https://cdn/b.css', kind: 'style', isHttps: true },
      // HTTP resource on an HTTP page → not flagged (page isn't https)
      { pageUrl: 'http://t/insecure', src: 'http://cdn/c.js', kind: 'script', isHttps: false },
    ]);

    const findings = await runRule(securityMixedContentRule, auditId);

    expect(findings).toEqual([
      {
        url: 'https://t/secure',
        detail: { src: 'http://cdn/a.js', kind: 'script' },
      },
    ]);
  });
});
