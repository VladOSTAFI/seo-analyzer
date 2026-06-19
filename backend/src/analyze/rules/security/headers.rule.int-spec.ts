import {
  cleanupAudit,
  closePool,
  createAudit,
  runRule,
  seedPages,
} from '../../../../test/int/rule-harness';
import { securityHeadersRule } from './headers.rule';

describe('security.headers (int)', () => {
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

  it('flags missing nosniff and/or CSP on HTML pages; composes reason[]; gated to html', async () => {
    await seedPages(auditId, [
      // both present → not flagged
      {
        url: 'https://t/ok',
        statusClass: '2xx',
        pageKind: 'html',
        xContentTypeOptions: 'nosniff',
        cspPresent: true,
      },
      // missing nosniff only
      {
        url: 'https://t/no-nosniff',
        statusClass: '2xx',
        pageKind: 'html',
        xContentTypeOptions: null,
        cspPresent: true,
      },
      // missing both
      {
        url: 'https://t/both',
        statusClass: '2xx',
        pageKind: 'html',
        xContentTypeOptions: null,
        cspPresent: false,
      },
      // non-html (feed) missing both → excluded by page_kind gate
      {
        url: 'https://t/feed',
        statusClass: '2xx',
        pageKind: 'feed',
        xContentTypeOptions: null,
        cspPresent: false,
      },
    ]);

    const findings = await runRule(securityHeadersRule, auditId);
    const byUrl = Object.fromEntries(findings.map((f) => [f.url, f.detail]));

    expect(findings.map((f) => f.url).sort()).toEqual(['https://t/both', 'https://t/no-nosniff']);
    expect(byUrl['https://t/no-nosniff']).toMatchObject({ reason: ['missing-nosniff'] });
    expect(byUrl['https://t/both']).toMatchObject({ reason: ['missing-nosniff', 'missing-csp'] });
  });
});
