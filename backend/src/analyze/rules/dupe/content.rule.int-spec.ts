import {
  cleanupAudit,
  closePool,
  createAudit,
  runRule,
  seedPages,
} from '../../../../test/int/rule-harness';
import { dupeContentRule } from './content.rule';

/**
 * `dupe.content` integration test. Seeds a duplicate-hash group, a unique-hash
 * page, a null-hash page, and a non-2xx page sharing the dup hash to prove the
 * status filter. Only the two members of the 2xx dup group should be flagged.
 */
describe('dupe.content (integration)', () => {
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

  it('flags every 2xx page sharing a content hash and ignores unique/null/non-2xx pages', async () => {
    await seedPages(auditId, [
      { url: 'https://t/a', statusClass: '2xx', contentHash: 'dup' },
      { url: 'https://t/b', statusClass: '2xx', contentHash: 'dup' },
      { url: 'https://t/unique', statusClass: '2xx', contentHash: 'solo' },
      { url: 'https://t/nohash', statusClass: '2xx', contentHash: null },
      // shares the dup hash but is a redirect — must not count toward the group
      { url: 'https://t/redirect', statusClass: '3xx', contentHash: 'dup' },
    ]);

    const findings = await runRule(dupeContentRule, auditId);

    expect(findings).toHaveLength(2);
    expect(findings.map((f) => f.url).sort()).toEqual(['https://t/a', 'https://t/b']);
    for (const f of findings) {
      expect(f.detail).toEqual({ contentHash: 'dup', duplicateCount: 2 });
    }
  });

  it('emits nothing when every hash is unique', async () => {
    await seedPages(auditId, [
      { url: 'https://t/x', statusClass: '2xx', contentHash: 'h1' },
      { url: 'https://t/y', statusClass: '2xx', contentHash: 'h2' },
    ]);

    const findings = await runRule(dupeContentRule, auditId);
    expect(findings).toEqual([]);
  });
});
