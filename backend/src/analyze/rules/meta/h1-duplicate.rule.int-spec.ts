import {
  closePool,
  cleanupAudit,
  createAudit,
  runRule,
  seedPages,
} from '../../../../test/int/rule-harness';
import { metaH1DuplicateRule } from './h1-duplicate.rule';

describe('meta.h1.duplicate (int)', () => {
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

  it('emits one finding per page sharing an h1; ignores unique and non-2xx', async () => {
    await seedPages(auditId, [
      { url: 'https://t/dup1', statusClass: '2xx', h1: ['Shared'] },
      { url: 'https://t/dup2', statusClass: '2xx', h1: ['Shared'] },
      { url: 'https://t/unique', statusClass: '2xx', h1: ['Unique'] },
      { url: 'https://t/404', statusClass: '4xx', h1: ['Shared'] },
    ]);

    const findings = await runRule(metaH1DuplicateRule, auditId);

    expect(findings).toEqual([
      { url: 'https://t/dup1', detail: { h1: 'Shared', duplicateCount: 2 } },
      { url: 'https://t/dup2', detail: { h1: 'Shared', duplicateCount: 2 } },
    ]);
  });
});
