import {
  cleanupAudit,
  closePool,
  createAudit,
  runRule,
  seedPages,
} from '../../../../test/int/rule-harness';
import { indexUrlHeuristicsRule } from './url-heuristics.rule';

/**
 * `index.url-heuristics` integration test. Covers each heuristic, a URL tripping
 * several at once, a clean lowercase slug (no finding), uppercase/underscore in
 * the HOST that must be ignored (host casing is not author SEO signal), and a
 * non-2xx ugly URL to prove the status filter.
 */
describe('index.url-heuristics (integration)', () => {
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

  it('flags each heuristic, composes multiples, and respects host/status exemptions', async () => {
    const longUrl = `https://t/${'a'.repeat(120)}`; // > 115 chars, otherwise clean
    await seedPages(auditId, [
      { url: 'https://t/Path_1?x=1', statusClass: '2xx' }, // uppercase + underscore + query
      { url: 'https://t/under_score', statusClass: '2xx' }, // underscore only
      { url: 'https://t/Upper', statusClass: '2xx' }, // uppercase only
      { url: 'https://t/list?page=2', statusClass: '2xx' }, // query only
      { url: longUrl, statusClass: '2xx' }, // too-long only
      { url: 'https://t/clean-slug', statusClass: '2xx' }, // clean -> no finding
      { url: 'https://Host_Name.COM/clean', statusClass: '2xx' }, // host casing/underscore ignored
      { url: 'https://t/Ugly_Param?z=1', statusClass: '4xx' }, // ugly but not 2xx -> ignored
    ]);

    const findings = await runRule(indexUrlHeuristicsRule, auditId);
    const byUrl = Object.fromEntries(
      findings.map((f) => [f.url, (f.detail as { issues: string[] }).issues]),
    );

    expect(Object.keys(byUrl).sort()).toEqual(
      [
        longUrl,
        'https://t/Path_1?x=1',
        'https://t/Upper',
        'https://t/list?page=2',
        'https://t/under_score',
      ].sort(),
    );

    expect(byUrl['https://t/Path_1?x=1'].sort()).toEqual(
      ['query-params', 'underscore', 'uppercase'].sort(),
    );
    expect(byUrl['https://t/under_score']).toEqual(['underscore']);
    expect(byUrl['https://t/Upper']).toEqual(['uppercase']);
    expect(byUrl['https://t/list?page=2']).toEqual(['query-params']);
    expect(byUrl[longUrl]).toEqual(['too-long']);
    expect(byUrl['https://Host_Name.COM/clean']).toBeUndefined();
    expect(byUrl['https://t/clean-slug']).toBeUndefined();
  });

  it('emits nothing for an all-clean URL set', async () => {
    await seedPages(auditId, [
      { url: 'https://t/clean-slug', statusClass: '2xx' },
      { url: 'https://t/another-clean-page', statusClass: '2xx' },
    ]);

    const findings = await runRule(indexUrlHeuristicsRule, auditId);
    expect(findings).toEqual([]);
  });
});
