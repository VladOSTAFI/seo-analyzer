import {
  cleanupAudit,
  closePool,
  createAudit,
  runRule,
  seedPages,
} from '../../../../test/int/rule-harness';
import { securityCertRule } from './cert.rule';

// Default: CERT_MIN_DAYS=14.

describe('security.cert (int)', () => {
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

  it('flags invalid and near-expiry certs; ignores valid/healthy and un-checked (null) rows', async () => {
    await seedPages(auditId, [
      // invalid cert → flagged
      {
        url: 'https://t/invalid',
        statusClass: '2xx',
        pageKind: 'html',
        certValid: false,
        certDaysToExpiry: 100,
      },
      // valid but expiring in < 14 days → flagged
      {
        url: 'https://t/expiring',
        statusClass: '2xx',
        pageKind: 'html',
        certValid: true,
        certDaysToExpiry: 5,
      },
      // valid, far from expiry → not flagged
      {
        url: 'https://t/healthy',
        statusClass: '2xx',
        pageKind: 'html',
        certValid: true,
        certDaysToExpiry: 90,
      },
      // never checked (probe off) → cert_valid null → excluded
      {
        url: 'https://t/unchecked',
        statusClass: '2xx',
        pageKind: 'html',
        certValid: null,
        certDaysToExpiry: null,
      },
    ]);

    const findings = await runRule(securityCertRule, auditId);
    const byUrl = Object.fromEntries(findings.map((f) => [f.url, f.detail]));

    expect(findings.map((f) => f.url).sort()).toEqual(['https://t/expiring', 'https://t/invalid']);
    expect(byUrl['https://t/invalid']).toMatchObject({ certValid: false, reason: 'invalid' });
    expect(byUrl['https://t/expiring']).toMatchObject({
      certValid: true,
      daysToExpiry: 5,
      reason: 'near-expiry',
    });
  });
});
