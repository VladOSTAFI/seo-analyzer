import {
  cleanupAudit,
  closePool,
  createAudit,
  runRule,
  seedPages,
} from '../../../../test/int/rule-harness';
import { securityHttpsRule } from './https.rule';

describe('security.https (int)', () => {
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

  it('flags plaintext final URLs; excludes pages that upgrade http→https', async () => {
    await seedPages(auditId, [
      // served over https → not flagged
      { url: 'https://t/secure', statusClass: '2xx', pageKind: 'html', finalUrl: 'https://t/secure' },
      // requested http but redirected to https (final is https) → not flagged
      {
        url: 'http://t/upgraded',
        statusClass: '2xx',
        pageKind: 'html',
        finalUrl: 'https://t/upgraded',
      },
      // final URL still plaintext http → flagged
      {
        url: 'http://t/plain',
        statusClass: '2xx',
        pageKind: 'html',
        finalUrl: 'http://t/plain',
      },
      // non-html → excluded
      {
        url: 'http://t/feed',
        statusClass: '2xx',
        pageKind: 'feed',
        finalUrl: 'http://t/feed',
      },
    ]);

    const findings = await runRule(securityHttpsRule, auditId);

    expect(findings.map((f) => f.url)).toEqual(['http://t/plain']);
    expect(findings[0]?.detail).toMatchObject({ finalUrl: 'http://t/plain' });
  });
});
