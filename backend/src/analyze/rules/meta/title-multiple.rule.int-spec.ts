import {
  closePool,
  cleanupAudit,
  createAudit,
  runRule,
  seedPages,
} from '../../../../test/int/rule-harness';
import { metaTitleMultipleRule } from './title-multiple.rule';

describe('meta.title.multiple (int)', () => {
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

  it('flags 2xx pages with >1 title, ignoring single-title and non-2xx pages', async () => {
    await seedPages(auditId, [
      // trigger: two titles
      { url: 'https://t/multi', statusClass: '2xx', title: ['A', 'B'] },
      // non-trigger: single title
      { url: 'https://t/one', statusClass: '2xx', title: ['A'] },
      // non-trigger: non-2xx with two titles (status filter)
      { url: 'https://t/404', statusClass: '4xx', title: ['A', 'B'] },
    ]);

    const findings = await runRule(metaTitleMultipleRule, auditId);

    expect(findings).toEqual([
      { url: 'https://t/multi', detail: { titles: ['A', 'B'], count: 2 } },
    ]);
  });
});
