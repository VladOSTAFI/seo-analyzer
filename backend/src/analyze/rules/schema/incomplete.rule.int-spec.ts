import {
  closePool,
  cleanupAudit,
  createAudit,
  runRule,
  seedPages,
  seedStructuredData,
} from '../../../../test/int/rule-harness';
import { schemaIncompleteRule } from './incomplete.rule';

describe('schema.incomplete (int)', () => {
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

  it('projects the missing props for a typed node with required/recommended gaps', async () => {
    await seedPages(auditId, [
      { url: 'https://t/org', statusClass: '2xx', pageKind: 'html' },
      { url: 'https://t/ok', statusClass: '2xx', pageKind: 'html' },
    ]);
    await seedStructuredData(auditId, [
      {
        pageUrl: 'https://t/org',
        type: 'Organization',
        valid: false,
        errors: [
          { code: 'missing-required', prop: 'url', type: 'Organization' },
          { code: 'missing-recommended', prop: 'logo', type: 'Organization' },
        ],
      },
      {
        pageUrl: 'https://t/ok',
        type: 'Organization',
        valid: true,
        errors: [],
      },
    ]);

    const findings = await runRule(schemaIncompleteRule, auditId);

    expect(findings).toEqual([
      { url: 'https://t/org', detail: { type: 'Organization', missing: ['url', 'logo'] } },
    ]);
  });

  it('ignores json-syntax (null type) nodes and non-2xx pages', async () => {
    await seedPages(auditId, [
      { url: 'https://t/broken', statusClass: '2xx', pageKind: 'html' },
      { url: 'https://t/404', statusClass: '4xx', pageKind: 'html' },
    ]);
    await seedStructuredData(auditId, [
      { pageUrl: 'https://t/broken', type: null, valid: false, errors: [{ code: 'json-syntax' }] },
      {
        pageUrl: 'https://t/404',
        type: 'Product',
        valid: false,
        errors: [{ code: 'missing-required', prop: 'name', type: 'Product' }],
      },
    ]);

    const findings = await runRule(schemaIncompleteRule, auditId);

    expect(findings).toEqual([]);
  });
});
