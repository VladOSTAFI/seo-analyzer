import type { Worksheet } from 'exceljs';
import type { Severity } from '../analyze/rule.types';
import type { ColumnSpec } from './report.types';

/**
 * Phase 5 ExcelJS formatting helpers (engine-owned, Wave 2A). PURE presentation:
 * given a worksheet the engine has already populated with a header row + data
 * rows, these helpers style it (header band, freeze, autofilter, widths) and
 * color-code the `severity` column. No IO, no data mutation — every helper is
 * directly unit-testable (the severity→ARGB map is exported for assertions).
 */

/** Default column width (Excel character units) when a {@link ColumnSpec} omits one. */
export const DEFAULT_COLUMN_WIDTH = 24;

/** The overflow column the engine appends when a SheetRow carries undeclared keys. */
export const DETAILS_COLUMN: ColumnSpec = { header: 'Details', key: 'details', width: 60 };

/** ARGB fill for the header band (dark slate). */
const HEADER_FILL_ARGB = 'FF1F2A37';
/** ARGB font color for the header band (white). */
const HEADER_FONT_ARGB = 'FFFFFFFF';

/**
 * Severity → cell-fill ARGB map (single source of truth for color coding):
 * critical = dark red, high = orange/red, medium = amber, low = light yellow,
 * info = light blue/grey. Exported so the unit test can assert it directly and
 * so callers never hand-roll a color.
 */
export const SEVERITY_FILL_ARGB: Record<Severity, string> = {
  critical: 'FFC00000', // dark red
  high: 'FFE06A1B', // orange/red
  medium: 'FFF2C037', // amber
  low: 'FFFFF2A8', // light yellow
  info: 'FFD6E4F0', // light blue/grey
};

/** True when `value` is one of the known severities (used to color-code cells). */
export function isSeverity(value: unknown): value is Severity {
  return typeof value === 'string' && value in SEVERITY_FILL_ARGB;
}

/**
 * Build the ExcelJS `columns` array for a sheet from its declared {@link ColumnSpec}s,
 * applying {@link DEFAULT_COLUMN_WIDTH} when a width is omitted.
 */
export function toExcelColumns(
  columns: ColumnSpec[],
): { header: string; key: string; width: number }[] {
  return columns.map((c) => ({
    header: c.header,
    key: c.key,
    width: c.width ?? DEFAULT_COLUMN_WIDTH,
  }));
}

/**
 * Apply the standard data-sheet formatting to a worksheet that already has its
 * `columns` set and its data rows added:
 *  - bold, filled, contrasting, bordered header row (row 1)
 *  - freeze the header row
 *  - autofilter across the full header range
 *  - color-code the `severity` column cell per {@link SEVERITY_FILL_ARGB}
 *
 * `columns` is the column spec the sheet was built from (used to locate the
 * `severity` column for coloring); `rowCount` is the number of DATA rows added
 * (excludes the header), so the helper knows how far the table extends.
 */
export function formatDataSheet(ws: Worksheet, columns: ColumnSpec[], rowCount: number): void {
  const colCount = columns.length;
  if (colCount === 0) return;

  // Header band: bold white text on a dark fill, thin borders, centered.
  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: HEADER_FONT_ARGB } };
  header.alignment = { vertical: 'middle', horizontal: 'left' };
  for (let c = 1; c <= colCount; c += 1) {
    const cell = header.getCell(c);
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL_ARGB } };
    cell.border = thinBorder();
  }

  // Freeze the header so it stays visible while scrolling the (potentially long)
  // findings list.
  ws.views = [{ state: 'frozen', ySplit: 1 }];

  // AutoFilter across the whole header range (row 1, col 1 → col N).
  ws.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: colCount },
  };

  // Severity color coding: find the severity column (if any) and fill each data
  // cell by its value. Rows are 2..rowCount+1 (row 1 is the header).
  const severityCol = columns.findIndex((c) => c.key === 'severity');
  if (severityCol === -1 || rowCount === 0) return;
  const colIndex = severityCol + 1; // ExcelJS is 1-based
  for (let r = 2; r <= rowCount + 1; r += 1) {
    const cell = ws.getRow(r).getCell(colIndex);
    if (isSeverity(cell.value)) {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: SEVERITY_FILL_ARGB[cell.value] },
      };
    }
  }
}

/** A uniform thin border on all four sides (used for the header band). */
function thinBorder() {
  const side = { style: 'thin' as const, color: { argb: 'FFAAAAAA' } };
  return { top: side, left: side, bottom: side, right: side };
}
