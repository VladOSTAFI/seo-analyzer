import {
  closePool,
  cleanupAudit,
  createAudit,
  runRule,
  seedPages,
} from '../../../../test/int/rule-harness';
import { metaTitleTemplateRule } from './title-template.rule';

// Recommended title length: 30–60 chars (inclusive). <30 too-short, >60 too-long.
const inRange = 'A'.repeat(45); // 45 chars, fine
const tooLong = 'B'.repeat(65); // 65 chars

describe('meta.title.template (int)', () => {
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

  it('flags 2xx titles outside 30–60 chars with too-short/too-long, ignoring in-range and non-2xx', async () => {
    await seedPages(auditId, [
      // trigger: too short (< 30)
      { url: 'https://t/short', statusClass: '2xx', title: ['Short'] },
      // trigger: too long (> 60)
      { url: 'https://t/long', statusClass: '2xx', title: [tooLong] },
      // non-trigger: in range
      { url: 'https://t/ok', statusClass: '2xx', title: [inRange] },
      // non-trigger: no title at all (not WITH a title)
      { url: 'https://t/none', statusClass: '2xx', title: [] },
      // non-trigger: non-2xx with a short title (status filter)
      { url: 'https://t/404', statusClass: '4xx', title: ['Short'] },
    ]);

    const findings = await runRule(metaTitleTemplateRule, auditId);

    expect(findings).toEqual([
      {
        url: 'https://t/long',
        detail: { title: tooLong, length: 65, recommendation: 'too-long' },
      },
      {
        url: 'https://t/short',
        detail: { title: 'Short', length: 5, recommendation: 'too-short' },
      },
    ]);
  });
});
