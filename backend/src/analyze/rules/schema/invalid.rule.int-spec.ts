import {
  closePool,
  cleanupAudit,
  createAudit,
  runRule,
  seedPages,
  seedStructuredData,
} from '../../../../test/int/rule-harness';
import { schemaInvalidRule } from './invalid.rule';

describe('schema.invalid (int)', () => {
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

  it('flags only blocks with a json-syntax error on HTML 2xx pages', async () => {
    await seedPages(auditId, [
      { url: 'https://t/broken', statusClass: '2xx', pageKind: 'html' },
      { url: 'https://t/incomplete', statusClass: '2xx', pageKind: 'html' },
      { url: 'https://t/404', statusClass: '4xx', pageKind: 'html' },
    ]);
    await seedStructuredData(auditId, [
      {
        pageUrl: 'https://t/broken',
        type: null,
        valid: false,
        errors: [{ code: 'json-syntax', message: 'Unexpected token' }],
      },
      {
        pageUrl: 'https://t/incomplete',
        type: 'Organization',
        valid: false,
        errors: [{ code: 'missing-required', prop: 'url', type: 'Organization' }],
      },
      {
        pageUrl: 'https://t/404',
        type: null,
        valid: false,
        errors: [{ code: 'json-syntax' }],
      },
    ]);

    const findings = await runRule(schemaInvalidRule, auditId);

    expect(findings).toEqual([{ url: 'https://t/broken', detail: { issue: 'invalid' } }]);
  });
});
