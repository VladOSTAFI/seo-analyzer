import {
  closePool,
  cleanupAudit,
  createAudit,
  runRule,
  seedPages,
} from '../../../../test/int/rule-harness';
import { mirrorTrailingSlashRule } from './trailing-slash.rule';

describe('mirror.trailing-slash (int)', () => {
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

  it('flags the no-slash member when /path and /path/ share a content hash', async () => {
    await seedPages(auditId, [
      { url: 'https://t/page', statusClass: '2xx', contentHash: 'h1' },
      { url: 'https://t/page/', statusClass: '2xx', contentHash: 'h1' },
      // lone page with no slash twin must NOT be flagged
      { url: 'https://t/other', statusClass: '2xx', contentHash: 'h9' },
    ]);

    const findings = await runRule(mirrorTrailingSlashRule, auditId);

    expect(findings).toEqual([
      {
        url: 'https://t/page',
        detail: { slashUrl: 'https://t/page/', contentHash: 'h1' },
      },
    ]);
  });

  it('does not flag /path and /path/ when their content hashes differ', async () => {
    await seedPages(auditId, [
      { url: 'https://t/page', statusClass: '2xx', contentHash: 'h1' },
      { url: 'https://t/page/', statusClass: '2xx', contentHash: 'h2' },
    ]);

    const findings = await runRule(mirrorTrailingSlashRule, auditId);

    expect(findings).toEqual([]);
  });

  it('returns nothing for a lone page with no slash twin', async () => {
    await seedPages(auditId, [{ url: 'https://t/only', statusClass: '2xx', contentHash: 'h1' }]);

    const findings = await runRule(mirrorTrailingSlashRule, auditId);

    expect(findings).toEqual([]);
  });

  it('ignores a slash twin that is not 2xx', async () => {
    await seedPages(auditId, [
      { url: 'https://t/page', statusClass: '2xx', contentHash: 'h1' },
      { url: 'https://t/page/', statusClass: '3xx', contentHash: 'h1' },
    ]);

    const findings = await runRule(mirrorTrailingSlashRule, auditId);

    expect(findings).toEqual([]);
  });
});
