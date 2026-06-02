import {
  closePool,
  cleanupAudit,
  createAudit,
  runRule,
  seedPages,
} from '../../../../test/int/rule-harness';
import { metaTitleDuplicateRule } from './title-duplicate.rule';

describe('meta.title.duplicate (int)', () => {
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

  it('emits one finding per page sharing a title; ignores unique and non-2xx', async () => {
    await seedPages(auditId, [
      // two 2xx pages sharing the same title -> two findings
      { url: 'https://t/dup1', statusClass: '2xx', title: ['Shared'] },
      { url: 'https://t/dup2', statusClass: '2xx', title: ['Shared'] },
      // non-trigger: unique title
      { url: 'https://t/unique', statusClass: '2xx', title: ['Unique'] },
      // non-trigger: non-2xx page that shares the title (status filter)
      { url: 'https://t/404', statusClass: '4xx', title: ['Shared'] },
    ]);

    const findings = await runRule(metaTitleDuplicateRule, auditId);

    expect(findings).toEqual([
      { url: 'https://t/dup1', detail: { title: 'Shared', duplicateCount: 2 } },
      { url: 'https://t/dup2', detail: { title: 'Shared', duplicateCount: 2 } },
    ]);
  });
});
