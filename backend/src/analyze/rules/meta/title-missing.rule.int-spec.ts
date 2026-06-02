import {
  closePool,
  cleanupAudit,
  createAudit,
  runRule,
  seedPages,
} from '../../../../test/int/rule-harness';
import { metaTitleMissingRule } from './title-missing.rule';

describe('meta.title.missing (int)', () => {
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

  it('flags 2xx pages with no title, ignoring non-2xx and titled pages', async () => {
    await seedPages(auditId, [
      // trigger: 2xx, empty title
      { url: 'https://t/missing', statusClass: '2xx', title: [] },
      // non-trigger: 2xx WITH a title
      { url: 'https://t/has', statusClass: '2xx', title: ['Home'] },
      // non-trigger: non-2xx with empty title (status filter)
      { url: 'https://t/404', statusClass: '4xx', title: [] },
    ]);

    const findings = await runRule(metaTitleMissingRule, auditId);

    expect(findings).toEqual([{ url: 'https://t/missing', detail: {} }]);
  });
});
