import {
  closePool,
  cleanupAudit,
  createAudit,
  runRule,
  seedPages,
} from '../../../../test/int/rule-harness';
import { metaH1MissingRule } from './h1-missing.rule';

describe('meta.h1.missing (int)', () => {
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

  it('flags 2xx pages with no h1, ignoring non-2xx and pages with an h1', async () => {
    await seedPages(auditId, [
      { url: 'https://t/missing', statusClass: '2xx', h1: [] },
      { url: 'https://t/has', statusClass: '2xx', h1: ['Heading'] },
      { url: 'https://t/404', statusClass: '4xx', h1: [] },
    ]);

    const findings = await runRule(metaH1MissingRule, auditId);

    expect(findings).toEqual([{ url: 'https://t/missing', detail: {} }]);
  });
});
