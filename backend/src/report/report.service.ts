import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import * as ExcelJS from 'exceljs';
import { DB, type Database } from '../db/db.types';
import { AuditRepository } from '../audit/audit.repository';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env.validation';
import { audits } from '../db/schema';
import type {
  Cell,
  ColumnSpec,
  CoverageManifest,
  FindingRow,
  ReportContext,
  ReportSummary,
  SheetRow,
} from './report.types';
import { REPORT_SECTIONS, coveredRuleIds } from './report.sections';
import { loadReportData } from './report.data';
import { DETAILS_COLUMN, formatDataSheet, toExcelColumns } from './report.format';
import {
  OTHER_COLUMNS,
  OTHER_SHEET_NAME,
  SUMMARY_COLUMNS,
  SUMMARY_SHEET_NAME,
  SITE_WIDE_KEY,
  buildOtherRows,
  buildSummaryRows,
  countBySeverity,
  distinctIssueCount,
  groupByRootCause,
} from './report.summary';
import {
  CATEGORY_KEYS,
  CATEGORY_LABELS,
  computeScore,
  scoreBand,
  type ScoreResult,
} from './report.score';
import { buildActions, topActions, toActionSummary, type Action } from './report.actions';

/** Sheet name for the Coverage manifest tab (≤31 chars). */
const COVERAGE_SHEET_NAME = 'Coverage';

/** Sheet name for the SEO Score tab (rendered after Summary). */
const SCORE_SHEET_NAME = 'SEO Score';
/** Sheet name for the prioritized Action Plan tab. */
const ACTION_PLAN_SHEET_NAME = 'Action Plan';
/** Sheet name for the per-page rollup tab. */
const BY_PAGE_SHEET_NAME = 'By Page';

/** Column spec for the SEO Score sheet (key-value + per-category table). */
const SCORE_COLUMNS: ColumnSpec[] = [
  { header: 'Metric', key: 'metric', width: 24 },
  { header: 'Score', key: 'score', width: 10 },
  { header: 'Assessed', key: 'assessed', width: 12 },
  { header: 'Distinct issues', key: 'distinctIssues', width: 16 },
  { header: 'Dominant severity', key: 'dominant', width: 18 },
];

/** Column spec for the Action Plan sheet. */
const ACTION_PLAN_COLUMNS: ColumnSpec[] = [
  { header: '#', key: 'rank', width: 6 },
  { header: 'Action', key: 'action', width: 44 },
  { header: 'Severity', key: 'severity', width: 10 },
  { header: 'Prevalence', key: 'prevalence', width: 12 },
  { header: 'Impact', key: 'impact', width: 8 },
  { header: 'Effort', key: 'effort', width: 8 },
  { header: 'Priority', key: 'priority', width: 10 },
  { header: 'Why it matters', key: 'whyItMatters', width: 60 },
  { header: 'How to fix', key: 'howToFix', width: 60 },
  { header: 'Expected impact', key: 'expectedImpact', width: 50 },
  { header: 'Doc', key: 'docLink', width: 50 },
];

/** Column spec for the By Page sheet. */
const BY_PAGE_COLUMNS: ColumnSpec[] = [
  { header: 'Page', key: 'page', width: 60 },
  { header: 'Issue (family)', key: 'family', width: 24 },
  { header: 'Severity', key: 'severity', width: 10 },
  { header: 'Confidence', key: 'confidence', width: 12 },
  { header: 'Detail', key: 'detail', width: 50 },
];

/** Column spec for the Coverage sheet (key-value pairs). */
const COVERAGE_COLUMNS: ColumnSpec[] = [
  { header: 'Metric', key: 'metric', width: 32 },
  { header: 'Value', key: 'value', width: 70 },
];

/**
 * Phase 5 report engine (§"Phase 5 — Report Generation"). Reads ONLY from
 * `findings` + the audit row (NO recompute — analysis happened in Phase 3),
 * renders an engine-generated Summary sheet (leftmost), one formatted worksheet
 * per {@link REPORT_SECTIONS} entry, and a catch-all "Other" sheet for any
 * finding whose `ruleId` is unclaimed, then writes the `.xlsx` to `OUTPUT_DIR`
 * and records the path on `audits.reportPath`.
 *
 * The engine is PURE plumbing over the section registry: it filters the loaded
 * findings to each section's `ruleIds`, calls the section's PURE `buildRows`,
 * sets the columns from the section spec, and adds the rows. It does NOT depend
 * on any section returning non-empty rows — a section that returns `[]` renders
 * an empty (header-only) sheet. If a returned {@link SheetRow} carries keys not
 * declared in the sheet's columns, the engine appends a `Details` column with a
 * JSON blob of those overflow keys so NO data is ever silently dropped.
 *
 * Status semantics mirror the other stages: status is set to `reporting` at the
 * start and LEFT at `reporting` on success — `reporting` is the settled state
 * until the Phase 6 orchestrator advances it to `done` (there is no `reported`
 * enum value). On failure the outer catch marks the audit failed at stage
 * `report` and rethrows.
 */
@Injectable()
export class ReportService {
  private readonly logger = new Logger(ReportService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly auditRepo: AuditRepository,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async generate(auditId: string): Promise<ReportSummary> {
    const startedAt = Date.now();
    const audit = await this.auditRepo.assertExists(auditId);

    // Load findings (read-only; no recompute). A clean site legitimately has
    // zero findings — we do NOT hard-fail on that: an empty-ish report is still
    // a valid, useful artifact (it proves the audit ran clean).
    const { findings } = await loadReportData(this.db, auditId);

    await this.auditRepo.setStatus(auditId, 'reporting');

    const generatedAt = new Date();
    const ctx: ReportContext = {
      audit: { id: audit.id, startUrl: audit.startUrl, status: 'reporting' },
      generatedAt,
    };
    this.logger.log(
      `Report start audit=${auditId} findings=${findings.length} sections=${REPORT_SECTIONS.length}`,
    );

    try {
      const wb = new ExcelJS.Workbook();
      wb.creator = 'seo-analyzer';
      wb.created = generatedAt;

      // ── Score + actions (plans 12/13) — computed up front so the executive
      // Summary block can lead with the headline numbers. ──────────────────────
      const coverageManifest = audit.coverage as CoverageManifest | null;
      const pagesCrawled = coverageManifest?.pagesCrawled ?? 0;
      const score = computeScore(findings, pagesCrawled, coverageManifest);
      const actions = buildActions(findings, this.env.REPORT_AFFECTED_URLS_SAMPLE);
      const top = topActions(actions, this.env.REPORT_TOP_ACTIONS);
      const notAssessed = CATEGORY_KEYS.filter((k) => !score.categories[k].assessed).map(
        (k) => CATEGORY_LABELS[k],
      );

      // ── Summary sheet FIRST (leftmost tab), now with the executive block. ────
      this.renderSheet(
        wb,
        SUMMARY_SHEET_NAME,
        SUMMARY_COLUMNS,
        buildSummaryRows(findings, REPORT_SECTIONS, ctx, {
          score,
          topActions: top.map(toActionSummary),
          notAssessed,
        }),
      );

      // ── SEO Score sheet (after Summary) ──────────────────────────────────────
      this.renderSheet(wb, SCORE_SHEET_NAME, SCORE_COLUMNS, this.buildScoreRows(score));

      // ── Action Plan + By Page sheets ─────────────────────────────────────────
      this.renderSheet(
        wb,
        ACTION_PLAN_SHEET_NAME,
        ACTION_PLAN_COLUMNS,
        this.buildActionPlanRows(actions, this.env.REPORT_TOP_ACTIONS),
      );
      this.renderSheet(
        wb,
        BY_PAGE_SHEET_NAME,
        BY_PAGE_COLUMNS,
        this.buildByPageRows(findings, auditId),
      );

      // ── One worksheet per section, in registry order ────────────────────────
      for (const section of REPORT_SECTIONS) {
        const ruleIds = new Set(section.ruleIds);
        const filtered = findings.filter((f) => ruleIds.has(f.ruleId));
        const rows = section.buildRows(filtered, ctx);
        this.renderSheet(wb, section.spec.name, section.spec.columns, rows);
      }

      // ── Catch-all "Other" sheet for unclaimed ruleIds (no silent loss) ──────
      const covered = coveredRuleIds();
      const otherRows = buildOtherRows(findings, covered);
      if (otherRows.length > 0) {
        this.logger.warn(
          `Report audit=${auditId} has ${otherRows.length} uncovered finding(s) ` +
            `(ruleIds not claimed by any section) — routed to the "${OTHER_SHEET_NAME}" sheet`,
        );
        this.renderSheet(wb, OTHER_SHEET_NAME, OTHER_COLUMNS, otherRows);
      }

      // ── Coverage sheet (Item 12) ─────────────────────────────────────────────
      // Render the persisted coverage manifest (written by audit.service.ts at end
      // of runAll) tightened with explicit "NOT ASSESSED" rows per uncovered score
      // category, consistent with the score's assessed:false categories.
      if (coverageManifest) {
        const coverageRows = this.buildCoverageRows(coverageManifest, score);
        this.renderSheet(wb, COVERAGE_SHEET_NAME, COVERAGE_COLUMNS, coverageRows);
      }

      // ── Write to disk ───────────────────────────────────────────────────────
      const reportPath = await this.writeWorkbook(wb, auditId, generatedAt);

      // Persist the path on the audit row (AuditRepository has no reportPath
      // setter; write it directly — this file owns that schema touch).
      await this.db
        .update(audits)
        .set({ reportPath, score, updatedAt: new Date() })
        .where(eq(audits.id, auditId));

      const bySeverity = countBySeverity(findings);
      const distinctIssues = distinctIssueCount(findings);
      const summary: ReportSummary = {
        reportPath,
        sheets: wb.worksheets.length,
        totalFindings: findings.length,
        bySeverity,
        distinctIssues,
      };

      const elapsedMs = Date.now() - startedAt;
      this.logger.log(
        `Report done audit=${auditId} sheets=${summary.sheets} findings=${summary.totalFindings} ` +
          `distinct=${summary.distinctIssues} ` +
          `(critical=${bySeverity.critical}, high=${bySeverity.high}, medium=${bySeverity.medium}, ` +
          `low=${bySeverity.low}, info=${bySeverity.info}) path=${reportPath} durationMs=${elapsedMs}`,
      );
      // Status stays at `reporting` on success — Phase 6 owns the next transition.
      return summary;
    } catch (err) {
      await this.auditRepo.markFailed(auditId, 'report');
      const reason = err instanceof Error ? err.message : String(err);
      this.logger.error(`Report failed audit=${auditId} stage=report: ${reason}`);
      throw err;
    }
  }

  // ── Coverage sheet builder (Item 12) ────────────────────────────────────────

  /**
   * Flatten a {@link CoverageManifest} into key-value rows for the Coverage tab,
   * tightened with explicit "NOT ASSESSED" rows per score category that the
   * score marks `assessed:false` (plan 13 §3.6) — so a zero count is never read
   * as a pass and the Coverage sheet stays consistent with the SEO Score sheet.
   */
  private buildCoverageRows(m: CoverageManifest, score: ScoreResult): SheetRow[] {
    const rows: SheetRow[] = [
      { metric: 'Pages crawled', value: m.pagesCrawled },
      { metric: 'Crawl cap', value: m.crawlCap },
      { metric: 'Cap hit?', value: String(m.capHit) },
      { metric: '', value: '' },
      { metric: 'External links (total)', value: m.externalLinks.total },
      { metric: 'External links (verified)', value: m.externalLinks.verified },
      { metric: '', value: '' },
      { metric: 'Images (total)', value: m.images.total },
      { metric: 'Images (status enriched)', value: m.images.statusEnriched },
      { metric: '', value: '' },
      { metric: 'CWV source: field data', value: m.cwvSource.field },
      { metric: 'CWV source: origin fallback', value: m.cwvSource.originFallback },
      { metric: 'CWV source: lab only', value: m.cwvSource.lab },
      { metric: '', value: '' },
      {
        metric: 'Rules with zero findings',
        value: m.rulesInert.length > 0 ? m.rulesInert.join(', ') : '(none)',
      },
    ];

    // Explicit NOT ASSESSED rows, one per score category that is not assessed.
    const notAssessed = CATEGORY_KEYS.filter((k) => !score.categories[k].assessed);
    if (notAssessed.length > 0) {
      rows.push({ metric: '', value: '' });
      for (const k of notAssessed) {
        rows.push({ metric: CATEGORY_LABELS[k], value: 'NOT ASSESSED' });
      }
    }
    return rows;
  }

  /**
   * Build the SEO Score sheet rows: an overall headline row, then one row per
   * category (score, assessed, distinct issues, dominant severity). Not-assessed
   * categories render `n/a` (never 100). PURE projection.
   */
  private buildScoreRows(score: ScoreResult): SheetRow[] {
    const rows: SheetRow[] = [
      {
        metric: 'Overall',
        score: score.overall,
        assessed: 'true',
        distinctIssues: score.inputs.distinctIssues,
        dominant: scoreBand(score.overall),
      },
      { metric: '', score: null, assessed: '', distinctIssues: null, dominant: '' },
    ];
    for (const key of CATEGORY_KEYS) {
      const c = score.categories[key];
      rows.push({
        metric: CATEGORY_LABELS[key],
        score: c.assessed ? c.score : 'n/a',
        assessed: String(c.assessed),
        distinctIssues: c.distinctIssues,
        dominant: this.dominantSeverityLabel(c.bySeverity),
      });
    }
    return rows;
  }

  /** Highest-rank severity present in a per-severity tally, or '' when none. */
  private dominantSeverityLabel(
    bySeverity: ScoreResult['categories']['content']['bySeverity'],
  ): string {
    const order: (keyof typeof bySeverity)[] = ['critical', 'high', 'medium', 'low', 'info'];
    for (const s of order) if (bySeverity[s] > 0) return s;
    return '';
  }

  /**
   * Build the Action Plan sheet rows: one row per {@link Action}, sorted by
   * priorityScore desc (already sorted by buildActions). The first `topN` rows
   * are the "Top fixes"; a divider row separates the remainder. PURE projection.
   */
  private buildActionPlanRows(actions: Action[], topN: number): SheetRow[] {
    const rows: SheetRow[] = [];
    actions.forEach((a, i) => {
      if (i === topN && actions.length > topN) {
        rows.push({
          rank: '',
          action: '— remaining actions —',
          severity: '',
          prevalence: null,
          impact: null,
          effort: null,
          priority: null,
          whyItMatters: '',
          howToFix: '',
          expectedImpact: '',
          docLink: '',
        });
      }
      rows.push({
        rank: i + 1,
        action: a.title,
        severity: a.severity,
        prevalence: a.prevalence,
        impact: a.impact,
        effort: a.effort,
        priority: Math.round(a.priorityScore * 100) / 100,
        whyItMatters: a.remediation.whyItMatters,
        howToFix: a.remediation.howToFix,
        expectedImpact: a.remediation.expectedImpact,
        docLink: a.remediation.docLink,
      });
    });
    return rows;
  }

  /**
   * Build the By Page sheet rows: one row per `(page, issue-group)` so a reader
   * sees everything wrong with a URL together. Site-wide groups appear under the
   * `(site-wide)` page heading. Capped at REPORT_BY_PAGE_MAX_ROWS (logged on
   * truncation). PURE-ish projection (logging only).
   */
  private buildByPageRows(findings: FindingRow[], auditId: string): SheetRow[] {
    const groups = groupByRootCause(findings);
    // Sort by page (site-wide last) then family for a stable, readable layout.
    const sorted = [...groups].sort((a, b) => {
      const aSite = a.rootCauseKey === SITE_WIDE_KEY ? 1 : 0;
      const bSite = b.rootCauseKey === SITE_WIDE_KEY ? 1 : 0;
      if (aSite !== bSite) return aSite - bSite;
      if (a.rootCauseKey !== b.rootCauseKey) return a.rootCauseKey < b.rootCauseKey ? -1 : 1;
      return a.family < b.family ? -1 : a.family > b.family ? 1 : 0;
    });
    const cap = this.env.REPORT_BY_PAGE_MAX_ROWS;
    const capped = sorted.slice(0, cap);
    if (sorted.length > cap) {
      this.logger.warn(
        `Report audit=${auditId} By-Page sheet truncated to ${cap} of ${sorted.length} rows ` +
          `(REPORT_BY_PAGE_MAX_ROWS)`,
      );
    }
    return capped.map((g) => ({
      page: g.rootCauseKey,
      family: g.family,
      severity: g.severity,
      confidence: g.confidence,
      detail: g.ruleIds.join(', '),
    }));
  }

  /**
   * Render ONE worksheet: declare columns (spec columns + an appended `Details`
   * column iff any row overflows), add the rows, then apply standard formatting.
   * Generic over Summary / section / Other sheets.
   */
  private renderSheet(
    wb: ExcelJS.Workbook,
    name: string,
    specColumns: ColumnSpec[],
    rows: SheetRow[],
  ): void {
    const declaredKeys = new Set(specColumns.map((c) => c.key));

    // OVERFLOW: collect any row keys not declared in the spec. We must NOT drop
    // them — if any exist, append a `Details` column carrying their JSON.
    const overflowKeys = new Set<string>();
    for (const row of rows) {
      for (const key of Object.keys(row)) {
        if (!declaredKeys.has(key)) overflowKeys.add(key);
      }
    }
    const hasOverflow = overflowKeys.size > 0;
    const columns = hasOverflow ? [...specColumns, DETAILS_COLUMN] : specColumns;

    const ws = wb.addWorksheet(name);
    ws.columns = toExcelColumns(columns);

    for (const row of rows) {
      const record: Record<string, Cell> = {};
      for (const col of specColumns) {
        record[col.key] = row[col.key] ?? null;
      }
      if (hasOverflow) {
        record[DETAILS_COLUMN.key] = this.overflowJson(row, declaredKeys);
      }
      ws.addRow(record);
    }

    formatDataSheet(ws, columns, rows.length);
  }

  /** JSON blob of a row's overflow keys (those not declared in the spec). */
  private overflowJson(row: SheetRow, declaredKeys: Set<string>): string | null {
    const extra: Record<string, Cell> = {};
    for (const key of Object.keys(row)) {
      if (!declaredKeys.has(key)) extra[key] = row[key];
    }
    const sortedKeys = Object.keys(extra).sort();
    if (sortedKeys.length === 0) return null;
    const ordered: Record<string, Cell> = {};
    for (const k of sortedKeys) ordered[k] = extra[k];
    return JSON.stringify(ordered);
  }

  /** mkdir -p OUTPUT_DIR, resolve an absolute path, write the workbook, return the path. */
  private async writeWorkbook(
    wb: ExcelJS.Workbook,
    auditId: string,
    generatedAt: Date,
  ): Promise<string> {
    const dir = path.resolve(this.env.OUTPUT_DIR);
    await fs.mkdir(dir, { recursive: true });
    const reportPath = path.join(dir, `audit-${auditId}-${stamp(generatedAt)}.xlsx`);
    await wb.xlsx.writeFile(reportPath);
    return reportPath;
  }
}

/** Filename-safe `YYYYMMDD-HHmmss` stamp (UTC) for the report file name. */
function stamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}` +
    `-${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`
  );
}
