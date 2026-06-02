import {
  closePool,
  cleanupAudit,
  createAudit,
  runRule,
  seedPages,
} from '../../../../test/int/rule-harness';
import { metaH1MultipleRule } from './h1-multiple.rule';

describe('meta.h1.multiple (int)', () => {
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

  it('flags 2xx pages with >1 h1, ignoring single-h1 and non-2xx pages', async () => {
    await seedPages(auditId, [
      { url: 'https://t/multi', statusClass: '2xx', h1: ['A', 'B'] },
      { url: 'https://t/one', statusClass: '2xx', h1: ['A'] },
      { url: 'https://t/404', statusClass: '4xx', h1: ['A', 'B'] },
    ]);

    const findings = await runRule(metaH1MultipleRule, auditId);

    expect(findings).toEqual([{ url: 'https://t/multi', detail: { h1s: ['A', 'B'], count: 2 } }]);
  });
});
