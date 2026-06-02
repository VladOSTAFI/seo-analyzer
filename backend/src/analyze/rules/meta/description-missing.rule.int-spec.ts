import {
  closePool,
  cleanupAudit,
  createAudit,
  runRule,
  seedPages,
} from '../../../../test/int/rule-harness';
import { metaDescriptionMissingRule } from './description-missing.rule';

describe('meta.description.missing (int)', () => {
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

  it('flags 2xx pages with no meta description, ignoring non-2xx and described pages', async () => {
    await seedPages(auditId, [
      { url: 'https://t/missing', statusClass: '2xx', metaDescription: [] },
      { url: 'https://t/has', statusClass: '2xx', metaDescription: ['A description'] },
      { url: 'https://t/404', statusClass: '4xx', metaDescription: [] },
    ]);

    const findings = await runRule(metaDescriptionMissingRule, auditId);

    expect(findings).toEqual([{ url: 'https://t/missing', detail: {} }]);
  });
});
