import {
  closePool,
  cleanupAudit,
  createAudit,
  runRule,
  seedPerformance,
} from '../../../../test/int/rule-harness';
import { perfClsInpRule } from './cls-inp.rule';

describe('perf.cls-inp (int)', () => {
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

  it('flags a high CLS (>0.1) naming the cls issue', async () => {
    await seedPerformance(auditId, [
      { pageUrl: 'https://t/a', strategy: 'mobile', cls: 0.25, inpMs: 100 },
    ]);

    const findings = await runRule(perfClsInpRule, auditId);

    expect(findings).toEqual([
      {
        url: 'https://t/a',
        detail: { strategy: 'mobile', cls: 0.25, inpMs: 100, issues: ['cls'] },
      },
    ]);
  });

  it('flags a high INP (>200ms) naming the inp issue', async () => {
    await seedPerformance(auditId, [
      { pageUrl: 'https://t/a', strategy: 'mobile', cls: 0.05, inpMs: 350 },
    ]);

    const findings = await runRule(perfClsInpRule, auditId);

    expect(findings).toEqual([
      {
        url: 'https://t/a',
        detail: { strategy: 'mobile', cls: 0.05, inpMs: 350, issues: ['inp'] },
      },
    ]);
  });

  it('does not flag good (cls<=0.1 & inp<=200) or absent (null) metrics', async () => {
    await seedPerformance(auditId, [
      { pageUrl: 'https://t/a', strategy: 'mobile', cls: 0.05, inpMs: 100 },
      {
        pageUrl: 'https://t/b',
        strategy: 'desktop',
        cls: undefined,
        inpMs: undefined,
      },
    ]);

    const findings = await runRule(perfClsInpRule, auditId);

    expect(findings).toEqual([]);
  });
});
