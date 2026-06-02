import {
  closePool,
  cleanupAudit,
  createAudit,
  runRule,
  seedPages,
} from '../../../../test/int/rule-harness';
import { metaDescriptionDuplicateRule } from './description-duplicate.rule';

describe('meta.description.duplicate (int)', () => {
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

  it('emits one finding per page sharing a description; ignores unique and non-2xx', async () => {
    await seedPages(auditId, [
      { url: 'https://t/dup1', statusClass: '2xx', metaDescription: ['Shared'] },
      { url: 'https://t/dup2', statusClass: '2xx', metaDescription: ['Shared'] },
      { url: 'https://t/unique', statusClass: '2xx', metaDescription: ['Unique'] },
      { url: 'https://t/404', statusClass: '4xx', metaDescription: ['Shared'] },
    ]);

    const findings = await runRule(metaDescriptionDuplicateRule, auditId);

    expect(findings).toEqual([
      { url: 'https://t/dup1', detail: { description: 'Shared', duplicateCount: 2 } },
      { url: 'https://t/dup2', detail: { description: 'Shared', duplicateCount: 2 } },
    ]);
  });
});
