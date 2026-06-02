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
import type { Cell, ColumnSpec, ReportContext, ReportSummary, SheetRow } from './report.types';
import { REPORT_SECTIONS, coveredRuleIds } from './report.sections';
import { loadReportData } from './report.data';
import { DETAILS_COLUMN, formatDataSheet, toExcelColumns } from './report.format';
import {
  OTHER_COLUMNS,
  OTHER_SHEET_NAME,
  SUMMARY_COLUMNS,
  SUMMARY_SHEET_NAME,
  buildOtherRows,
  buildSummaryRows,
  countBySeverity,
} from './report.summary';

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

      // ── Summary sheet FIRST (leftmost tab) ──────────────────────────────────
      this.renderSheet(
        wb,
        SUMMARY_SHEET_NAME,
        SUMMARY_COLUMNS,
        buildSummaryRows(findings, REPORT_SECTIONS, ctx),
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

      // ── Write to disk ───────────────────────────────────────────────────────
      const reportPath = await this.writeWorkbook(wb, auditId, generatedAt);

      // Persist the path on the audit row (AuditRepository has no reportPath
      // setter; write it directly — this file owns that schema touch).
      await this.db
        .update(audits)
        .set({ reportPath, updatedAt: new Date() })
        .where(eq(audits.id, auditId));

      const bySeverity = countBySeverity(findings);
      const summary: ReportSummary = {
        reportPath,
        sheets: wb.worksheets.length,
        totalFindings: findings.length,
        bySeverity,
      };

      const elapsedMs = Date.now() - startedAt;
      this.logger.log(
        `Report done audit=${auditId} sheets=${summary.sheets} findings=${summary.totalFindings} ` +
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
