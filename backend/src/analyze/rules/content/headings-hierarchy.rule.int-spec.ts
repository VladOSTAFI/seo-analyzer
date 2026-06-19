import {
  cleanupAudit,
  closePool,
  createAudit,
  runRule,
  seedPages,
} from '../../../../test/int/rule-harness';
import { contentHeadingsHierarchyRule } from './headings-hierarchy.rule';

describe('content.headings-hierarchy (int)', () => {
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

  it('flags zero/multiple H1, level skips, and empty headings; ignores a clean outline', async () => {
    await seedPages(auditId, [
      // clean: one H1, no skip, no empty → NOT flagged
      {
        url: 'https://t/clean',
        statusClass: '2xx',
        pageKind: 'html',
        headingsOutline: [
          { level: 1, text: 'Title' },
          { level: 2, text: 'Section' },
          { level: 3, text: 'Sub' },
        ],
      },
      // skip H1 -> H3
      {
        url: 'https://t/skip',
        statusClass: '2xx',
        pageKind: 'html',
        headingsOutline: [
          { level: 1, text: 'Title' },
          { level: 3, text: 'Deep' },
        ],
      },
      // two H1s
      {
        url: 'https://t/two-h1',
        statusClass: '2xx',
        pageKind: 'html',
        headingsOutline: [
          { level: 1, text: 'A' },
          { level: 1, text: 'B' },
        ],
      },
      // empty heading
      {
        url: 'https://t/empty',
        statusClass: '2xx',
        pageKind: 'html',
        headingsOutline: [
          { level: 1, text: 'A' },
          { level: 2, text: '' },
        ],
      },
      // zero H1 (starts at H2)
      {
        url: 'https://t/no-h1',
        statusClass: '2xx',
        pageKind: 'html',
        headingsOutline: [{ level: 2, text: 'Only H2' }],
      },
      // empty outline → SQL pre-filter excludes
      { url: 'https://t/none', statusClass: '2xx', pageKind: 'html', headingsOutline: [] },
    ]);

    const findings = await runRule(contentHeadingsHierarchyRule, auditId);
    const byUrl = Object.fromEntries(findings.map((f) => [f.url, f.detail]));

    expect(findings.map((f) => f.url).sort()).toEqual([
      'https://t/empty',
      'https://t/no-h1',
      'https://t/skip',
      'https://t/two-h1',
    ]);
    expect(byUrl['https://t/skip']).toMatchObject({ issues: ['skipped-level'], h1Count: 1, firstSkipAt: 1 });
    expect(byUrl['https://t/two-h1']).toMatchObject({ issues: ['multiple-h1'], h1Count: 2 });
    expect(byUrl['https://t/empty']).toMatchObject({ issues: ['empty-heading'], h1Count: 1 });
    expect(byUrl['https://t/no-h1']).toMatchObject({ issues: ['no-h1'], h1Count: 0 });
  });
});
