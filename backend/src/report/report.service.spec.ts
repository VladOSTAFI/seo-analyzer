import type { Confidence, Severity } from '../analyze/rule.types';
import type { FindingRow, ReportContext, ReportSection } from './report.types';
import {
  SEVERITY_FILL_ARGB,
  isSeverity,
  toExcelColumns,
  DEFAULT_COLUMN_WIDTH,
} from './report.format';
import {
  OTHER_SHEET_NAME,
  SEVERITY_KEYS,
  buildOtherRows,
  buildSummaryRows,
  countBySeverity,
  countLowConfidence,
  distinctIssueCount,
  zeroBySeverity,
} from './report.summary';

/** Minimal finding factory for the pure builder/format unit tests. */
function f(
  ruleId: string,
  severity: Severity,
  url: string | null = null,
  confidence: Confidence = 'high',
): FindingRow {
  return { ruleId, severity, confidence, url, detail: {} };
}

const CTX: ReportContext = {
  audit: { id: 'aud-1', startUrl: 'https://x.test', status: 'reporting' },
  generatedAt: new Date('2026-06-02T00:00:00.000Z'),
};

/** Two tiny fake sections so the per-category block is deterministic. */
const SECTIONS: ReportSection[] = [
  {
    spec: { name: 'Cat A', columns: [{ header: 'X', key: 'x' }] },
    ruleIds: ['a.one', 'a.two'],
    buildRows: () => [],
  },
  {
    spec: { name: 'Cat B', columns: [{ header: 'X', key: 'x' }] },
    ruleIds: ['b.one'],
    buildRows: () => [],
  },
];

describe('report.format', () => {
  it('exposes an ARGB fill for every severity key', () => {
    for (const s of SEVERITY_KEYS) {
      expect(SEVERITY_FILL_ARGB[s]).toMatch(/^FF[0-9A-F]{6}$/);
    }
    // Distinct colors per severity.
    const colors = SEVERITY_KEYS.map((s) => SEVERITY_FILL_ARGB[s]);
    expect(new Set(colors).size).toBe(SEVERITY_KEYS.length);
  });

  it('isSeverity narrows known severities only', () => {
    expect(isSeverity('critical')).toBe(true);
    expect(isSeverity('info')).toBe(true);
    expect(isSeverity('nope')).toBe(false);
    expect(isSeverity(42)).toBe(false);
    expect(isSeverity(null)).toBe(false);
  });

  it('toExcelColumns applies the default width when unset', () => {
    const cols = toExcelColumns([
      { header: 'A', key: 'a' },
      { header: 'B', key: 'b', width: 50 },
    ]);
    expect(cols[0]).toEqual({ header: 'A', key: 'a', width: DEFAULT_COLUMN_WIDTH });
    expect(cols[1]).toEqual({ header: 'B', key: 'b', width: 50 });
  });
});

describe('report.summary counts', () => {
  it('zeroBySeverity is zero-filled across all keys', () => {
    expect(zeroBySeverity()).toEqual({ critical: 0, high: 0, medium: 0, low: 0, info: 0 });
  });

  it('countBySeverity tallies and stays zero-filled', () => {
    const counts = countBySeverity([
      f('a.one', 'critical'),
      f('a.two', 'critical'),
      f('b.one', 'low'),
    ]);
    expect(counts).toEqual({ critical: 2, high: 0, medium: 0, low: 1, info: 0 });
  });
});

// ── countLowConfidence ────────────────────────────────────────────────────────

describe('countLowConfidence', () => {
  it('returns 0 when all findings have high confidence', () => {
    expect(countLowConfidence([f('a.one', 'high'), f('b.one', 'medium')])).toBe(0);
  });

  it('counts findings whose confidence is medium or low (not high)', () => {
    const findings: FindingRow[] = [
      f('a.one', 'high', null, 'high'),
      f('b.one', 'high', null, 'medium'),
      f('c.one', 'high', null, 'low'),
      f('d.one', 'high', null, 'low'),
    ];
    // medium + low + low = 3 non-high
    expect(countLowConfidence(findings)).toBe(3);
  });

  it('returns 0 for an empty array', () => {
    expect(countLowConfidence([])).toBe(0);
  });
});

// ── Item 13: distinctIssueCount ───────────────────────────────────────────────
//
// Rule family = first two dotted segments:
//   meta.h1.missing   → meta.h1
//   meta.h1.duplicate → meta.h1   (same family → collapses on same url)
//   meta.title.missing → meta.title
//   perf.lcp          → perf.lcp  (only 2 segments → IS the full family)
//   perf.cls-inp      → perf.cls-inp (different from perf.lcp)
//   mirror.main-mirror → mirror.main-mirror
//   dupe.content      → dupe.content

describe('distinctIssueCount (Item 13)', () => {
  it('counts each unique (ruleFamily, url) pair once', () => {
    const findings: FindingRow[] = [
      {
        ruleId: 'meta.title.missing',
        severity: 'high',
        confidence: 'high',
        url: 'https://x.test/a',
        detail: {},
      },
      {
        ruleId: 'meta.title.missing',
        severity: 'high',
        confidence: 'high',
        url: 'https://x.test/b',
        detail: {},
      },
      {
        ruleId: 'meta.h1.missing',
        severity: 'medium',
        confidence: 'high',
        url: 'https://x.test/a',
        detail: {},
      },
    ];
    // meta.title × /a, meta.title × /b, meta.h1 × /a → 3 distinct
    expect(distinctIssueCount(findings)).toBe(3);
  });

  it('collapses H1 sub-rules (same meta.h1 family) on the same url into ONE distinct issue', () => {
    const url = 'https://x.test/page';
    const findings: FindingRow[] = [
      { ruleId: 'meta.h1.missing', severity: 'high', confidence: 'high', url, detail: {} },
      { ruleId: 'meta.h1.duplicate', severity: 'medium', confidence: 'high', url, detail: {} },
      { ruleId: 'meta.h1.multiple', severity: 'medium', confidence: 'high', url, detail: {} },
    ];
    // All three share family 'meta.h1' AND the same url → 1 distinct issue.
    expect(distinctIssueCount(findings)).toBe(1);
  });

  it('perf rules with 2-segment IDs each have their own family (NOT collapsed)', () => {
    // perf.lcp → family 'perf.lcp'; perf.cls-inp → family 'perf.cls-inp' etc.
    // These are DIFFERENT families even on the same URL.
    const url = 'https://x.test/slow';
    const findings: FindingRow[] = [
      { ruleId: 'perf.lcp', severity: 'high', confidence: 'high', url, detail: {} },
      { ruleId: 'perf.cls-inp', severity: 'medium', confidence: 'high', url, detail: {} },
      { ruleId: 'perf.lab-score', severity: 'medium', confidence: 'high', url, detail: {} },
    ];
    // Each is a distinct family → 3 distinct issues.
    expect(distinctIssueCount(findings)).toBe(3);
  });

  it('same perf rule on the same url only counts once regardless of repetition', () => {
    // Two separate findings for the same (perf.lcp, url) → 1 distinct issue.
    const url = 'https://x.test/slow';
    const findings: FindingRow[] = [
      { ruleId: 'perf.lcp', severity: 'high', confidence: 'high', url, detail: {} },
      { ruleId: 'perf.lcp', severity: 'medium', confidence: 'high', url, detail: {} }, // duplicate family+url
    ];
    expect(distinctIssueCount(findings)).toBe(1);
  });

  it('H1 rules on DIFFERENT urls are separate distinct issues', () => {
    const findings: FindingRow[] = [
      {
        ruleId: 'meta.h1.missing',
        severity: 'high',
        confidence: 'high',
        url: 'https://x.test/1',
        detail: {},
      },
      {
        ruleId: 'meta.h1.missing',
        severity: 'high',
        confidence: 'high',
        url: 'https://x.test/2',
        detail: {},
      },
      {
        ruleId: 'meta.h1.duplicate',
        severity: 'medium',
        confidence: 'high',
        url: 'https://x.test/1',
        detail: {},
      },
    ];
    // meta.h1 × /1 and meta.h1 × /2 → 2 distinct issues.
    expect(distinctIssueCount(findings)).toBe(2);
  });

  it('site-wide (url=null) findings use a stable placeholder key per family', () => {
    const findings: FindingRow[] = [
      { ruleId: 'mirror.main-mirror', severity: 'high', confidence: 'high', url: null, detail: {} },
      {
        ruleId: 'mirror.trailing-slash',
        severity: 'medium',
        confidence: 'high',
        url: null,
        detail: {},
      },
    ];
    // mirror.main-mirror and mirror.trailing-slash have DIFFERENT families (2-segment IDs).
    expect(distinctIssueCount(findings)).toBe(2);

    // Same family, same null url → 1 distinct.
    const sameFamilyNullUrl: FindingRow[] = [
      { ruleId: 'mirror.main-mirror', severity: 'high', confidence: 'high', url: null, detail: {} },
      {
        ruleId: 'mirror.main-mirror',
        severity: 'medium',
        confidence: 'high',
        url: null,
        detail: {},
      },
    ];
    expect(distinctIssueCount(sameFamilyNullUrl)).toBe(1);
  });

  it('returns 0 for an empty findings array', () => {
    expect(distinctIssueCount([])).toBe(0);
  });

  it('headline scenario: 305 raw findings reduce to fewer distinct issues via H1 collapsing', () => {
    // 300 pages each with a single meta.h1.missing → 300 distinct (meta.h1 × each url)
    const h1Findings: FindingRow[] = Array.from({ length: 300 }, (_, i) => ({
      ruleId: 'meta.h1.missing',
      severity: 'high' as Severity,
      confidence: 'high' as Confidence,
      url: `https://x.test/${i}`,
      detail: {},
    }));
    // One page with BOTH meta.h1.missing AND meta.h1.duplicate:
    // → same family meta.h1 + same url → still 1 distinct (collapses with /0)
    const h1ExtraOnFirst: FindingRow[] = [
      {
        ruleId: 'meta.h1.duplicate',
        severity: 'medium',
        confidence: 'high',
        url: 'https://x.test/0',
        detail: {},
      },
    ];
    // 1 dupe.content finding (different family)
    const dupeFindings: FindingRow[] = [
      {
        ruleId: 'dupe.content',
        severity: 'medium',
        confidence: 'high',
        url: 'https://x.test/dup',
        detail: {},
      },
    ];

    const all = [...h1Findings, ...h1ExtraOnFirst, ...dupeFindings];
    // meta.h1 × 300 unique urls + dupe.content × 1 = 301 distinct
    // (the extra h1.duplicate on /0 collapses with h1.missing on /0)
    expect(distinctIssueCount(all)).toBe(301);
    // But raw total = 300 + 1 + 1 = 302 findings.
    expect(all.length).toBe(302);
    // Distinct < raw, demonstrating the dedup value.
    expect(distinctIssueCount(all)).toBeLessThan(all.length);
  });
});

describe('buildSummaryRows', () => {
  const findings = [
    f('a.one', 'critical', 'https://x.test/1'),
    f('a.two', 'high', 'https://x.test/2'),
    f('b.one', 'low', 'https://x.test/3'),
    f('z.unknown', 'medium', 'https://x.test/9'), // uncovered
  ];
  const rows = buildSummaryRows(findings, SECTIONS, CTX);

  it('stamps the audit metadata block including total findings and distinct issues', () => {
    const byField = (field: string) => rows.find((r) => r.field === field);
    expect(byField('Start URL')?.value).toBe('https://x.test');
    expect(byField('Audit ID')?.value).toBe('aud-1');
    expect(byField('Status')?.value).toBe('reporting');
    expect(byField('Generated at')?.value).toBe('2026-06-02T00:00:00.000Z');
    expect(byField('Total findings')?.count).toBe(4);
    // Item 13: distinct issues row is present.
    expect(byField('Distinct issues')).toBeDefined();
    expect(typeof byField('Distinct issues')?.count).toBe('number');
  });

  it('emits a per-severity count row for every severity', () => {
    for (const s of SEVERITY_KEYS) {
      const row = rows.find((r) => r.field === s);
      expect(row).toBeDefined();
    }
  });

  it('emits one per-category row per section with its dominant severity', () => {
    const catA = rows.find((r) => r.field === 'Cat A');
    const catB = rows.find((r) => r.field === 'Cat B');
    expect(catA?.count).toBe(2);
    expect(catA?.value).toBe('critical'); // critical outranks high
    expect(catB?.count).toBe(1);
    expect(catB?.value).toBe('low');
  });

  it('surfaces uncovered findings as an Other summary line', () => {
    const other = rows.find((r) => r.field === OTHER_SHEET_NAME);
    expect(other?.count).toBe(1);
    expect(other?.value).toBe('medium');
  });

  it('Item 13: distinct issues collapses same-family same-url H1 findings', () => {
    // Two H1 rules on the same URL → 1 distinct issue, 2 raw findings.
    const h1Findings: FindingRow[] = [
      {
        ruleId: 'meta.h1.missing',
        severity: 'high',
        confidence: 'high',
        url: 'https://x.test/p1',
        detail: {},
      },
      {
        ruleId: 'meta.h1.duplicate',
        severity: 'medium',
        confidence: 'high',
        url: 'https://x.test/p1',
        detail: {},
      },
    ];
    // Same family 'meta.h1', same url → 1 distinct issue even though 2 raw findings.
    expect(distinctIssueCount(h1Findings)).toBe(1);

    const summaryRows = buildSummaryRows(h1Findings, SECTIONS, CTX);
    const totalRow = summaryRows.find((r) => r.field === 'Total findings');
    const distinctRow = summaryRows.find((r) => r.field === 'Distinct issues');
    // Raw total is 2 findings, but distinct is 1.
    expect(totalRow?.count).toBe(2);
    expect(distinctRow?.count).toBe(1);
  });

  it('emits a Low-confidence findings summary row that counts non-high confidence findings', () => {
    // All 4 findings have high confidence (default from f()), so count = 0.
    const lowConfRow = rows.find((r) => r.field === 'Low-confidence findings');
    expect(lowConfRow).toBeDefined();
    expect(lowConfRow?.count).toBe(0);
  });

  it('Low-confidence findings count increments for medium/low confidence findings', () => {
    const mixedFindings: FindingRow[] = [
      f('a.one', 'high', 'https://x.test/1', 'high'),
      f('a.two', 'medium', 'https://x.test/2', 'low'), // low confidence
      f('b.one', 'medium', 'https://x.test/3', 'medium'), // medium confidence
      f('b.two', 'low', 'https://x.test/4', 'high'), // high confidence (despite low severity)
    ];
    const summaryRows = buildSummaryRows(mixedFindings, SECTIONS, CTX);
    const lowConfRow = summaryRows.find((r) => r.field === 'Low-confidence findings');
    // 'low' + 'medium' confidence findings → 2
    expect(lowConfRow?.count).toBe(2);
  });
});

describe('buildOtherRows', () => {
  it('returns only findings whose ruleId is not covered, with detail JSON', () => {
    const covered = new Set(['a.one', 'a.two', 'b.one']);
    const findings = [
      f('a.one', 'critical'),
      {
        ruleId: 'z.unknown',
        severity: 'medium' as Severity,
        confidence: 'high' as Confidence,
        url: 'https://x.test/9',
        detail: { b: 2, a: 1 },
      },
    ];
    const rows = buildOtherRows(findings, covered);
    expect(rows).toHaveLength(1);
    expect(rows[0].ruleId).toBe('z.unknown');
    expect(rows[0].severity).toBe('medium');
    expect(rows[0].url).toBe('https://x.test/9');
    // Detail JSON is stable (sorted keys).
    expect(rows[0].detail).toBe('{"a":1,"b":2}');
  });

  it('returns [] when every finding is covered', () => {
    const covered = new Set(['a.one']);
    expect(buildOtherRows([f('a.one', 'low')], covered)).toEqual([]);
  });
});
