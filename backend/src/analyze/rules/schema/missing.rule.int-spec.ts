import {
  closePool,
  cleanupAudit,
  createAudit,
  runRule,
  seedPages,
  seedStructuredData,
} from '../../../../test/int/rule-harness';
import { schemaMissingRule } from './missing.rule';

describe('schema.missing (int)', () => {
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

  it('flags only HTML 2xx pages that have NO structured_data row', async () => {
    await seedPages(auditId, [
      { url: 'https://t/no-schema', statusClass: '2xx', pageKind: 'html' },
      { url: 'https://t/has-schema', statusClass: '2xx', pageKind: 'html' },
      { url: 'https://t/404', statusClass: '4xx', pageKind: 'html' },
      { url: 'https://t/sitemap', statusClass: '2xx', pageKind: 'sitemap' },
    ]);
    await seedStructuredData(auditId, [
      { pageUrl: 'https://t/has-schema', type: 'Organization', valid: true, errors: [] },
    ]);

    const findings = await runRule(schemaMissingRule, auditId);

    expect(findings).toEqual([{ url: 'https://t/no-schema', detail: {} }]);
  });
});
