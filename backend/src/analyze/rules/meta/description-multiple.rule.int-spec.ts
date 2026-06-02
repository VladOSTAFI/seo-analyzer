import {
  closePool,
  cleanupAudit,
  createAudit,
  runRule,
  seedPages,
} from '../../../../test/int/rule-harness';
import { metaDescriptionMultipleRule } from './description-multiple.rule';

describe('meta.description.multiple (int)', () => {
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

  it('flags 2xx pages with >1 meta description, ignoring single and non-2xx pages', async () => {
    await seedPages(auditId, [
      { url: 'https://t/multi', statusClass: '2xx', metaDescription: ['A', 'B'] },
      { url: 'https://t/one', statusClass: '2xx', metaDescription: ['A'] },
      { url: 'https://t/404', statusClass: '4xx', metaDescription: ['A', 'B'] },
    ]);

    const findings = await runRule(metaDescriptionMultipleRule, auditId);

    expect(findings).toEqual([
      { url: 'https://t/multi', detail: { descriptions: ['A', 'B'], count: 2 } },
    ]);
  });
});
