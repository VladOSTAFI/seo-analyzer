import {
  closePool,
  cleanupAudit,
  createAudit,
  runRule,
  seedPages,
} from '../../../../test/int/rule-harness';
import { metaDescriptionTemplateRule } from './description-template.rule';

// Recommended description length: 70–160 chars (inclusive). <70 too-short, >160 too-long.
const inRange = 'A'.repeat(100); // 100 chars, fine
const tooLong = 'B'.repeat(170); // 170 chars

describe('meta.description.template (int)', () => {
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

  it('flags 2xx descriptions outside 70–160 chars, ignoring in-range and non-2xx', async () => {
    await seedPages(auditId, [
      { url: 'https://t/short', statusClass: '2xx', metaDescription: ['Short'] },
      { url: 'https://t/long', statusClass: '2xx', metaDescription: [tooLong] },
      { url: 'https://t/ok', statusClass: '2xx', metaDescription: [inRange] },
      { url: 'https://t/none', statusClass: '2xx', metaDescription: [] },
      { url: 'https://t/404', statusClass: '4xx', metaDescription: ['Short'] },
    ]);

    const findings = await runRule(metaDescriptionTemplateRule, auditId);

    expect(findings).toEqual([
      {
        url: 'https://t/long',
        detail: { description: tooLong, length: 170, recommendation: 'too-long' },
      },
      {
        url: 'https://t/short',
        detail: { description: 'Short', length: 5, recommendation: 'too-short' },
      },
    ]);
  });
});
