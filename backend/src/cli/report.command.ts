import { Logger } from '@nestjs/common';
import { Command, CommandRunner } from 'nest-commander';
import { ReportService } from '../report/report.service';
import { parseAuditId } from './crawl.command';

/**
 * Phase 5 CLI: `audit:report <auditId>`.
 * Renders the developer-facing Excel (ТЗ) workbook for a crawled+enriched+
 * analyzed audit, writes it to OUTPUT_DIR, records `audits.reportPath`, and
 * prints a concise one-line summary to stdout. Thrown AppErrors bubble to
 * main.ts's handler.
 *
 * Reuses {@link parseAuditId} from the crawl command so UUID validation has a
 * single source of truth across stages.
 */
@Command({
  name: 'audit:report',
  arguments: '<auditId>',
  description: 'Phase 5 — write the .xlsx audit report, record reportPath',
})
export class ReportCommand extends CommandRunner {
  private readonly logger = new Logger(ReportCommand.name);

  constructor(private readonly report: ReportService) {
    super();
  }

  async run(passedParams: string[], _options?: Record<string, unknown>): Promise<void> {
    void _options;
    const auditId = parseAuditId(passedParams[0]);

    const summary = await this.report.generate(auditId);

    const line =
      `report=${summary.reportPath} sheets=${summary.sheets} ` +
      `findings=${summary.totalFindings} ` +
      `(critical=${summary.bySeverity.critical}, high=${summary.bySeverity.high}, ` +
      `medium=${summary.bySeverity.medium}, low=${summary.bySeverity.low}, ` +
      `info=${summary.bySeverity.info})`;
    process.stdout.write(`${line}\n`);
    this.logger.log(`Report complete for audit ${auditId}: ${line}`);
  }
}
