import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { eq } from 'drizzle-orm';
import * as ExcelJS from 'exceljs';
import { AuditRepository } from '../audit/audit.repository';
import type { Database } from '../db/db.types';
import type { Env } from '../config/env.validation';
import { audits } from '../db/schema';
import { ReportService } from './report.service';
import { REPORT_SECTIONS } from './report.sections';
import { SUMMARY_SHEET_NAME } from './report.summary';
import {
  cleanupAudit,
  closePool,
  createAudit,
  getDb,
  seedFindings,
  seedPages,
} from '../../test/int/rule-harness';

/**
 * Real-DB integration test for the Phase 5 ReportService rendering engine. Seeds
 * findings directly (the report layer reads ONLY from `findings`), generates a
 * real `.xlsx` into an audit-scoped temp output dir, parses the workbook BACK,
 * and asserts the ENGINE-LEVEL invariants — the ones that hold regardless of
 * Agent B's `buildRows` progress:
 *   - the file exists at the returned reportPath
 *   - a leftmost "Summary" sheet exists, and its Total-findings cell equals the
 *     seeded count (engine-owned data, Agent-B-independent)
 *   - one worksheet per section (+ Summary) is emitted
 *   - every section sheet's header row matches its declared column headers
 *   - `audits.reportPath` is persisted and `audits.status` == 'reporting'
 *
 * Built WITHOUT Nest: `new ReportService(db, new AuditRepository(db), fakeEnv)`.
 */
describe('ReportService (integration)', () => {
  const db = getDb() as unknown as Database;
  let auditId: string;
  let outputDir: string;
  let service: ReportService;

  afterAll(async () => {
    await closePool();
  });

  beforeEach(async () => {
    auditId = await createAudit('https://report.test');
    outputDir = path.resolve(`./output/int-${auditId}`);
    const fakeEnv = { OUTPUT_DIR: outputDir } as Env;
    service = new ReportService(db, new AuditRepository(db), fakeEnv);

    // A couple of realistic 2xx pages so the audit looks crawled.
    await seedPages(auditId, [
      { url: 'https://report.test/', statusClass: '2xx' },
      { url: 'https://report.test/a', statusClass: '2xx' },
    ]);
  });

  afterEach(async () => {
    await cleanupAudit(auditId);
    // Remove the generated workbook + its audit-scoped dir.
    await fs.rm(outputDir, { recursive: true, force: true });
  });

  it('generates a workbook with a Summary + one sheet per section and persists reportPath', async () => {
    // Seed findings spread across several ruleIds + severities.
    const seeded = [
      { ruleId: 'meta.title.missing', severity: 'high' as const, url: 'https://report.test/' },
      { ruleId: 'meta.title.duplicate', severity: 'medium' as const, url: 'https://report.test/a' },
      { ruleId: 'image.alt-title', severity: 'low' as const, url: 'https://report.test/' },
      {
        ruleId: 'links.broken-internal',
        severity: 'critical' as const,
        url: 'https://report.test/',
      },
      { ruleId: 'meta.title.template', severity: 'info' as const, url: 'https://report.test/a' },
    ];
    await seedFindings(auditId, seeded);

    const summary = await service.generate(auditId);

    // Returned-path file exists.
    await expect(fs.access(summary.reportPath)).resolves.toBeUndefined();

    // bySeverity reflects the seed (engine-owned).
    expect(summary.totalFindings).toBe(seeded.length);
    expect(summary.bySeverity).toEqual({ critical: 1, high: 1, medium: 1, low: 1, info: 1 });

    // Worksheet count: Summary + every section (no uncovered → no Other sheet).
    expect(summary.sheets).toBe(REPORT_SECTIONS.length + 1);

    // Parse the workbook BACK and assert structure.
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(summary.reportPath);

    // Summary is leftmost (id 1 in ExcelJS ordering) and named correctly.
    const summarySheet = wb.getWorksheet(SUMMARY_SHEET_NAME);
    expect(summarySheet).toBeDefined();
    expect(wb.worksheets[0].name).toBe(SUMMARY_SHEET_NAME);

    // The Summary's Total-findings row holds the seeded count (Agent-B-independent).
    const totalRow = findSummaryRow(summarySheet!, 'Total findings');
    expect(totalRow).toBeDefined();
    expect(Number(totalRow!.getCell(3).value)).toBe(seeded.length);

    // Worksheet count parsed-back matches.
    expect(wb.worksheets.length).toBe(REPORT_SECTIONS.length + 1);

    // Every section sheet exists with a header row matching its column headers.
    for (const section of REPORT_SECTIONS) {
      const ws = wb.getWorksheet(section.spec.name);
      expect(ws).toBeDefined();
      const expectedHeaders = section.spec.columns.map((c) => c.header);
      const actualHeaders = readHeaderRow(ws!, expectedHeaders.length);
      expect(actualHeaders).toEqual(expectedHeaders);

      // If Agent B's buildRows returns rows for a seeded section, the data-row
      // count must match the seeded count for that section's ruleIds; if it
      // still stubs out ([]), the sheet is header-only — both are valid.
      const ruleIds = new Set(section.ruleIds);
      const seededForSection = seeded.filter((s) => ruleIds.has(s.ruleId)).length;
      const dataRows = ws!.rowCount - 1; // minus header
      if (dataRows > 0) {
        expect(dataRows).toBe(seededForSection);
      }
    }

    // reportPath persisted + status == reporting.
    const [row] = await db.select().from(audits).where(eq(audits.id, auditId)).limit(1);
    expect(row.reportPath).toBe(summary.reportPath);
    expect(row.status).toBe('reporting');
  });

  it('produces a valid workbook for a clean (zero-findings) audit', async () => {
    const summary = await service.generate(auditId);

    await expect(fs.access(summary.reportPath)).resolves.toBeUndefined();
    expect(summary.totalFindings).toBe(0);
    expect(summary.bySeverity).toEqual({ critical: 0, high: 0, medium: 0, low: 0, info: 0 });
    // Summary + sections, no Other sheet.
    expect(summary.sheets).toBe(REPORT_SECTIONS.length + 1);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(summary.reportPath);
    expect(wb.getWorksheet(SUMMARY_SHEET_NAME)).toBeDefined();
    expect(wb.getWorksheet('Other')).toBeUndefined();

    const [reloaded] = await db.select().from(audits).where(eq(audits.id, auditId)).limit(1);
    expect(reloaded.status).toBe('reporting');
    expect(reloaded.reportPath).toBe(summary.reportPath);
  });
});

/** Read the first `count` header cells (row 1) of a worksheet as plain strings. */
function readHeaderRow(ws: ExcelJS.Worksheet, count: number): string[] {
  const header = ws.getRow(1);
  const out: string[] = [];
  for (let c = 1; c <= count; c += 1) {
    out.push(String(header.getCell(c).value ?? ''));
  }
  return out;
}

/** Find a Summary data row whose first cell (Field) equals `field`. */
function findSummaryRow(ws: ExcelJS.Worksheet, field: string): ExcelJS.Row | undefined {
  let found: ExcelJS.Row | undefined;
  ws.eachRow((row) => {
    if (String(row.getCell(1).value ?? '') === field) found = row;
  });
  return found;
}
