import {
  cleanupAudit,
  closePool,
  createAudit,
  runRule,
  seedPages,
} from '../../../../test/int/rule-harness';
import { securityHstsRule } from './hsts.rule';

describe('security.hsts (int)', () => {
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

  it('flags HTTPS pages with no HSTS header; ignores those with one and any http page', async () => {
    await seedPages(auditId, [
      { url: 'https://t/no-hsts', statusClass: '2xx', pageKind: 'html', finalUrl: 'https://t/no-hsts', hsts: null },
      {
        url: 'https://t/has-hsts',
        statusClass: '2xx',
        pageKind: 'html',
        finalUrl: 'https://t/has-hsts',
        hsts: 'max-age=63072000',
      },
      // http page → out of scope for HSTS
      { url: 'http://t/plain', statusClass: '2xx', pageKind: 'html', finalUrl: 'http://t/plain', hsts: null },
    ]);

    const findings = await runRule(securityHstsRule, auditId);
    expect(findings.map((f) => f.url)).toEqual(['https://t/no-hsts']);
  });
});
