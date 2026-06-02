import type { Severity } from '../analyze/rule.types';
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
  zeroBySeverity,
} from './report.summary';

/** Minimal finding factory for the pure builder/format unit tests. */
function f(ruleId: string, severity: Severity, url: string | null = null): FindingRow {
  return { ruleId, severity, url, detail: {} };
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

describe('buildSummaryRows', () => {
  const findings = [
    f('a.one', 'critical', 'https://x.test/1'),
    f('a.two', 'high', 'https://x.test/2'),
    f('b.one', 'low', 'https://x.test/3'),
    f('z.unknown', 'medium', 'https://x.test/9'), // uncovered
  ];
  const rows = buildSummaryRows(findings, SECTIONS, CTX);

  it('stamps the audit metadata block', () => {
    const byField = (field: string) => rows.find((r) => r.field === field);
    expect(byField('Start URL')?.value).toBe('https://x.test');
    expect(byField('Audit ID')?.value).toBe('aud-1');
    expect(byField('Status')?.value).toBe('reporting');
    expect(byField('Generated at')?.value).toBe('2026-06-02T00:00:00.000Z');
    expect(byField('Total findings')?.count).toBe(4);
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
});

describe('buildOtherRows', () => {
  it('returns only findings whose ruleId is not covered, with detail JSON', () => {
    const covered = new Set(['a.one', 'a.two', 'b.one']);
    const findings = [
      f('a.one', 'critical'),
      {
        ruleId: 'z.unknown',
        severity: 'medium' as Severity,
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
