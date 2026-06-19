import {
  closePool,
  cleanupAudit,
  createAudit,
  runRule,
  seedPages,
  seedStructuredData,
} from '../../../../test/int/rule-harness';
import { schemaLocalBusinessRule } from './localbusiness.rule';

describe('schema.localbusiness (int)', () => {
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

  it('flags a LocalBusiness node missing NAP/geo/hours and a club page with no LB at all', async () => {
    await seedPages(auditId, [
      { url: 'https://t/clubs/center', statusClass: '2xx', pageKind: 'html' }, // has incomplete LB
      { url: 'https://t/clubs/empty', statusClass: '2xx', pageKind: 'html' }, // location page, no LB
      { url: 'https://t/about', statusClass: '2xx', pageKind: 'html' }, // not a location page
      { url: 'https://t/clubs/ok', statusClass: '2xx', pageKind: 'html' }, // full LB → no finding
    ]);
    await seedStructuredData(auditId, [
      {
        pageUrl: 'https://t/clubs/center',
        type: 'Gym',
        valid: true,
        errors: [
          { code: 'missing-recommended', prop: 'telephone', type: 'Gym' },
          { code: 'missing-recommended', prop: 'geo', type: 'Gym' },
        ],
      },
      {
        pageUrl: 'https://t/clubs/ok',
        type: 'Gym',
        valid: true,
        errors: [],
      },
    ]);

    const findings = await runRule(schemaLocalBusinessRule, auditId);
    const byUrl = new Map(findings.map((f) => [f.url, f]));

    expect(byUrl.get('https://t/clubs/center')?.detail).toEqual({
      type: 'Gym',
      issue: 'incomplete-nap',
      missing: ['telephone', 'geo'],
    });
    expect(byUrl.get('https://t/clubs/empty')?.detail).toMatchObject({ issue: 'no-localbusiness' });
    // /about is not a location page and /clubs/ok is complete → not flagged.
    expect(byUrl.has('https://t/about')).toBe(false);
    expect(byUrl.has('https://t/clubs/ok')).toBe(false);
  });
});
