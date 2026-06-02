import {
  closePool,
  cleanupAudit,
  createAudit,
  runRule,
  seedPages,
} from '../../../../test/int/rule-harness';
import { metaH1TemplateRule } from './h1-template.rule';

// Recommended h1 length: 20–70 chars (inclusive). <20 too-short, >70 too-long.
const inRange = 'A'.repeat(40); // 40 chars, fine
const tooLong = 'B'.repeat(80); // 80 chars

describe('meta.h1.template (int)', () => {
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

  it('flags 2xx h1s outside 20–70 chars, ignoring in-range and non-2xx', async () => {
    await seedPages(auditId, [
      { url: 'https://t/short', statusClass: '2xx', h1: ['Short'] },
      { url: 'https://t/long', statusClass: '2xx', h1: [tooLong] },
      { url: 'https://t/ok', statusClass: '2xx', h1: [inRange] },
      { url: 'https://t/none', statusClass: '2xx', h1: [] },
      { url: 'https://t/404', statusClass: '4xx', h1: ['Short'] },
    ]);

    const findings = await runRule(metaH1TemplateRule, auditId);

    expect(findings).toEqual([
      {
        url: 'https://t/long',
        detail: { h1: tooLong, length: 80, recommendation: 'too-long' },
      },
      {
        url: 'https://t/short',
        detail: { h1: 'Short', length: 5, recommendation: 'too-short' },
      },
    ]);
  });
});
