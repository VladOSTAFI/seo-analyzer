import type { Severity } from '../analyze/rule.types';
import { RULES } from '../analyze/rule.registry';
import { REPORT_SECTIONS, coveredRuleIds } from './report.sections';
import type { FindingRow, ReportContext, ReportSection } from './report.types';

/**
 * The Phase 5 coverage guard + Wave-2B per-mapper row-projection tests.
 *
 * The first describe block is the FROZEN coverage guard (Wave 1): it guarantees
 * the catalogue contract — every `findings.ruleId` maps to exactly ONE report
 * sheet — so a mapper can never silently miss (or double-claim) a rule. It
 * inspects only declared `name`/`columns`/`ruleIds`, not row output.
 *
 * The second describe block (Wave 2B) exercises each `buildRows` mapper: given
 * synthetic findings whose `detail` matches the real rule projection, it asserts
 * the returned rows carry the expected cell values under the declared column
 * keys (derived `issue` labels, joined arrays, numeric passthrough, null on
 * missing). These are pure / DB-free.
 */
describe('REPORT_SECTIONS coverage', () => {
  const EXCEL_SHEET_NAME_LIMIT = 31;

  it('every sheet name is unique and <=31 chars', () => {
    const names = REPORT_SECTIONS.map((s) => s.spec.name);
    for (const name of names) {
      expect(name.length).toBeGreaterThan(0);
      expect(name.length).toBeLessThanOrEqual(EXCEL_SHEET_NAME_LIMIT);
    }
    expect(new Set(names).size).toBe(names.length);
  });

  it('every sheet has a url column', () => {
    for (const section of REPORT_SECTIONS) {
      const keys = section.spec.columns.map((c) => c.key);
      expect(keys).toContain('url');
    }
  });

  it('the union of section.ruleIds has no duplicates', () => {
    const all = REPORT_SECTIONS.flatMap((s) => s.ruleIds);
    expect(new Set(all).size).toBe(all.length);
  });

  it('the union of section.ruleIds EQUALS the full rule registry (every rule has a home, nothing extra)', () => {
    const covered = coveredRuleIds();
    const registry = new Set(RULES.map((r) => r.id));

    const missing = [...registry].filter((id) => !covered.has(id)).sort();
    const extra = [...covered].filter((id) => !registry.has(id)).sort();

    expect(missing).toEqual([]);
    expect(extra).toEqual([]);
    expect(covered.size).toBe(registry.size);
  });
});

// ── Wave-2B: per-mapper row projection ─────────────────────────────────────

const CTX: ReportContext = {
  audit: { id: 'audit-1', startUrl: 'https://example.com/', status: 'done' },
  generatedAt: new Date('2026-06-02T00:00:00.000Z'),
};

/** Build a synthetic FindingRow with a realistic rule `detail` payload. */
function finding(
  ruleId: string,
  detail: Record<string, unknown>,
  opts: { severity?: Severity; url?: string | null } = {},
): FindingRow {
  return {
    ruleId,
    severity: opts.severity ?? 'medium',
    url: opts.url === undefined ? 'https://example.com/page' : opts.url,
    detail,
  };
}

/** Look up a section by its declared sheet name. */
function section(name: string): ReportSection {
  const s = REPORT_SECTIONS.find((x) => x.spec.name === name);
  if (!s) throw new Error(`no section named ${name}`);
  return s;
}

describe('buildRows mappers', () => {
  it('emits exactly one row per finding (1:1) for every section', () => {
    for (const s of REPORT_SECTIONS) {
      const findings = s.ruleIds.map((id) => finding(id, {}));
      expect(s.buildRows(findings, CTX)).toHaveLength(findings.length);
    }
    // empty input → empty output, no throw.
    for (const s of REPORT_SECTIONS) {
      expect(s.buildRows([], CTX)).toEqual([]);
    }
  });

  it('Redirects: internal-redirect href/status; redirect-chain hops/loop', () => {
    const rows = section('Redirects').buildRows(
      [
        finding(
          'links.internal-redirect',
          { href: 'https://example.com/old', targetStatusCode: 301 },
          { severity: 'medium' },
        ),
        finding('links.redirect-chain', { hops: 3, isLoop: true, chain: ['a', 'b'] }),
      ],
      CTX,
    );
    expect(rows[0]).toMatchObject({
      severity: 'medium',
      url: 'https://example.com/page',
      href: 'https://example.com/old',
      targetStatusCode: 301,
      hops: null,
      isLoop: null,
    });
    expect(rows[0].recommendation).toContain('final URL');
    expect(rows[1]).toMatchObject({ hops: 3, isLoop: true, href: null, targetStatusCode: null });
    expect(rows[1].recommendation).toContain('chain');
  });

  it('Broken Links: href/status passthrough + linkType derived from ruleId', () => {
    const rows = section('Broken Links').buildRows(
      [
        finding('links.broken-internal', { href: '/dead', targetStatusCode: 404 }),
        finding('links.broken-external', { href: 'https://x.test/500', targetStatusCode: 500 }),
      ],
      CTX,
    );
    expect(rows[0]).toMatchObject({ href: '/dead', targetStatusCode: 404, linkType: 'internal' });
    expect(rows[1]).toMatchObject({
      href: 'https://x.test/500',
      targetStatusCode: 500,
      linkType: 'external',
    });
  });

  it('External Links: href + rel', () => {
    const rows = section('External Links').buildRows(
      [finding('links.external-flag', { href: 'https://ext.test/', rel: 'noopener' })],
      CTX,
    );
    expect(rows[0]).toMatchObject({ href: 'https://ext.test/', rel: 'noopener' });
  });

  it('Titles: derived issue label, duplicate count, multiple joined array', () => {
    const rows = section('Titles').buildRows(
      [
        finding('meta.title.missing', {}),
        finding('meta.title.duplicate', { title: 'Home', duplicateCount: 4 }),
        finding('meta.title.multiple', { titles: ['One', 'Two'], count: 2 }),
      ],
      CTX,
    );
    expect(rows[0]).toMatchObject({ issue: 'missing', title: null, count: null });
    expect(rows[0].recommendation).toContain('Add');
    expect(rows[1]).toMatchObject({ issue: 'duplicate', title: 'Home', count: 4 });
    expect(rows[2]).toMatchObject({ issue: 'multiple', title: 'One, Two', count: 2 });
  });

  it('Descriptions: duplicate count + multiple joined array', () => {
    const rows = section('Descriptions').buildRows(
      [
        finding('meta.description.duplicate', { description: 'Buy now', duplicateCount: 3 }),
        finding('meta.description.multiple', { descriptions: ['A', 'B'], count: 2 }),
      ],
      CTX,
    );
    expect(rows[0]).toMatchObject({ issue: 'duplicate', description: 'Buy now', count: 3 });
    expect(rows[1]).toMatchObject({ issue: 'multiple', description: 'A, B', count: 2 });
  });

  it('H1: multiple uses h1s array key joined', () => {
    const rows = section('H1').buildRows(
      [
        finding('meta.h1.duplicate', { h1: 'Welcome', duplicateCount: 2 }),
        finding('meta.h1.multiple', { h1s: ['First', 'Second'], count: 2 }),
      ],
      CTX,
    );
    expect(rows[0]).toMatchObject({ issue: 'duplicate', h1: 'Welcome', count: 2 });
    expect(rows[1]).toMatchObject({ issue: 'multiple', h1: 'First, Second', count: 2 });
  });

  it('Duplicate Pages: contentHash + group size', () => {
    const rows = section('Duplicate Pages').buildRows(
      [finding('dupe.content', { contentHash: 'abc123', duplicateCount: 5 })],
      CTX,
    );
    expect(rows[0]).toMatchObject({ contentHash: 'abc123', duplicateCount: 5 });
  });

  it('Indexation: canonical issue/canonicalUrl; robots reason joined', () => {
    const rows = section('Indexation').buildRows(
      [
        finding('index.canonical', { issue: 'non-self', canonicalUrl: 'https://example.com/c' }),
        finding('index.robots', { reason: ['meta-noindex', 'robots-txt-blocked'] }),
      ],
      CTX,
    );
    expect(rows[0]).toMatchObject({
      issue: 'non-self',
      canonicalUrl: 'https://example.com/c',
      reason: null,
    });
    expect(rows[1].issue).toBe('noindex/blocked');
    expect(rows[1].reason).toBe('meta-noindex, robots-txt-blocked');
  });

  it('URL Heuristics: issues array joined with ", "', () => {
    const rows = section('URL Heuristics').buildRows(
      [finding('index.url-heuristics', { issues: ['uppercase', 'underscore', 'too-long'] })],
      CTX,
    );
    expect(rows[0].issues).toBe('uppercase, underscore, too-long');
  });

  it('Pagination: relNext + issue passthrough', () => {
    const rows = section('Pagination').buildRows(
      [
        finding('pagination.rel', {
          relNext: 'https://example.com/p2',
          issue: 'next-target-missing',
        }),
      ],
      CTX,
    );
    expect(rows[0]).toMatchObject({
      relNext: 'https://example.com/p2',
      issue: 'next-target-missing',
    });
  });

  it('Hreflang: lang/href + pre-joined issue string normalised', () => {
    const rows = section('Hreflang').buildRows(
      [
        finding('i18n.hreflang', {
          lang: 'en-US',
          href: 'https://example.com/en',
          issue: 'non-reciprocal,invalid-lang',
        }),
      ],
      CTX,
    );
    expect(rows[0]).toMatchObject({ lang: 'en-US', href: 'https://example.com/en' });
    expect(rows[0].issue).toBe('non-reciprocal, invalid-lang');
  });

  it('Images: alt-title uses altState; broken uses statusCode label', () => {
    const rows = section('Images').buildRows(
      [
        finding('image.alt-title', { src: '/a.png', alt: null, altState: 'missing' }),
        finding('image.broken', { src: '/b.png', statusCode: 404 }),
      ],
      CTX,
    );
    expect(rows[0]).toMatchObject({ src: '/a.png', issue: 'missing', statusCode: null });
    expect(rows[1]).toMatchObject({ src: '/b.png', statusCode: 404 });
    expect(rows[1].issue).toBe('broken (404)');
  });

  it('Mirrors: main-mirror variants joined + count; trailing-slash slashUrl', () => {
    const rows = section('Mirrors').buildRows(
      [
        finding('mirror.main-mirror', {
          variantKey: 'example.com/',
          variants: ['https://example.com', 'https://www.example.com'],
          mirrorCount: 2,
        }),
        finding('mirror.trailing-slash', {
          slashUrl: 'https://example.com/page/',
          contentHash: 'h',
        }),
      ],
      CTX,
    );
    expect(rows[0]).toMatchObject({ issue: 'main-mirror', mirrorCount: 2 });
    expect(rows[0].variant).toBe('https://example.com, https://www.example.com');
    expect(rows[1]).toMatchObject({
      issue: 'trailing-slash',
      variant: 'https://example.com/page/',
      mirrorCount: null,
    });
  });

  it('Performance: lcp ms; cls-inp metrics + issues; psi flags joined', () => {
    const rows = section('Performance').buildRows(
      [
        finding('perf.lcp', { strategy: 'mobile', lcpMs: 3200 }),
        finding('perf.cls-inp', {
          strategy: 'desktop',
          cls: 0.25,
          inpMs: 350,
          issues: ['cls', 'inp'],
        }),
        finding('perf.psi-usability', {
          strategy: 'mobile',
          flags: ['render-blocking', 'unused-css'],
        }),
      ],
      CTX,
    );
    expect(rows[0]).toMatchObject({ strategy: 'mobile', lcpMs: 3200, cls: null, inpMs: null });
    expect(rows[1]).toMatchObject({ strategy: 'desktop', cls: 0.25, inpMs: 350 });
    expect(rows[1].flags).toBe('cls, inp');
    expect(rows[2].flags).toBe('render-blocking, unused-css');
  });

  it('Meta Templates: element/value/length + recommendation per template rule', () => {
    const rows = section('Meta Templates').buildRows(
      [
        finding(
          'meta.title.template',
          { title: 'Hi', length: 2, recommendation: 'too-short' },
          { severity: 'info' },
        ),
        finding(
          'meta.description.template',
          { description: 'x'.repeat(200), length: 200, recommendation: 'too-long' },
          { severity: 'info' },
        ),
        finding(
          'meta.h1.template',
          { h1: 'Short H1', length: 8, recommendation: 'too-short' },
          { severity: 'info' },
        ),
      ],
      CTX,
    );
    expect(rows[0]).toMatchObject({
      element: 'title',
      value: 'Hi',
      length: 2,
      recommendation: 'too-short',
    });
    expect(rows[1]).toMatchObject({
      element: 'description',
      length: 200,
      recommendation: 'too-long',
    });
    expect(rows[2]).toMatchObject({ element: 'h1', value: 'Short H1', length: 8 });
  });

  it('site-wide (url=null) findings render a placeholder, not the literal null', () => {
    const rows = section('Mirrors').buildRows(
      [finding('mirror.main-mirror', { variants: ['a', 'b'], mirrorCount: 2 }, { url: null })],
      CTX,
    );
    expect(rows[0].url).toBe('(site-wide)');
  });

  it('missing detail values become null, never the string "undefined"', () => {
    const rows = section('Broken Links').buildRows([finding('links.broken-internal', {})], CTX);
    expect(rows[0].href).toBeNull();
    expect(rows[0].targetStatusCode).toBeNull();
  });
});
