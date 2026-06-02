import {
  closePool,
  cleanupAudit,
  createAudit,
  runRule,
  seedPages,
} from '../../../../test/int/rule-harness';
import { paginationRelRule } from './rel.rule';

describe('pagination.rel (int)', () => {
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

  it('flags a rel_next whose target page does not exist (next-target-missing)', async () => {
    await seedPages(auditId, [
      // trigger: p1 points next at p2, but p2 was never crawled
      { url: 'https://t/p1', statusClass: '2xx', relNext: 'https://t/p2' },
    ]);

    const findings = await runRule(paginationRelRule, auditId);

    expect(findings).toEqual([
      {
        url: 'https://t/p1',
        detail: { relNext: 'https://t/p2', issue: 'next-target-missing' },
      },
    ]);
  });

  it('flags a rel_next target that does not point back (next-not-reciprocal)', async () => {
    await seedPages(auditId, [
      { url: 'https://t/p1', statusClass: '2xx', relNext: 'https://t/p2' },
      // p2 exists & 2xx but its rel_prev points elsewhere
      { url: 'https://t/p2', statusClass: '2xx', relPrev: 'https://t/other' },
    ]);

    const findings = await runRule(paginationRelRule, auditId);

    expect(findings).toEqual([
      {
        url: 'https://t/p1',
        detail: { relNext: 'https://t/p2', issue: 'next-not-reciprocal' },
      },
    ]);
  });

  it('does not flag a properly reciprocal next/prev pair', async () => {
    await seedPages(auditId, [
      { url: 'https://t/p1', statusClass: '2xx', relNext: 'https://t/p2' },
      { url: 'https://t/p2', statusClass: '2xx', relPrev: 'https://t/p1' },
    ]);

    const findings = await runRule(paginationRelRule, auditId);

    expect(findings).toEqual([]);
  });
});
