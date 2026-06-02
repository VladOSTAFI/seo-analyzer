import { Logger } from '@nestjs/common';
import { Command, CommandRunner } from 'nest-commander';
import { AnalyzeService } from '../analyze/analyze.service';
import { parseAuditId } from './crawl.command';

/**
 * Phase 3 CLI: `audit:analyze <auditId>`.
 * Runs every audit rule against a crawled+enriched audit, writes the findings,
 * and prints a concise one-line summary to stdout. Thrown AppErrors bubble to
 * main.ts's handler.
 *
 * Reuses {@link parseAuditId} from the crawl command so UUID validation has a
 * single source of truth across stages.
 */
@Command({
  name: 'audit:analyze',
  arguments: '<auditId>',
  description: 'Run all audit rules → findings',
})
export class AnalyzeCommand extends CommandRunner {
  private readonly logger = new Logger(AnalyzeCommand.name);

  constructor(private readonly analyze: AnalyzeService) {
    super();
  }

  async run(passedParams: string[], _options?: Record<string, unknown>): Promise<void> {
    void _options;
    const auditId = parseAuditId(passedParams[0]);

    const summary = await this.analyze.analyze(auditId);

    const line =
      `findings=${summary.totalFindings} ` +
      `(critical=${summary.bySeverity.critical}, high=${summary.bySeverity.high}, ` +
      `medium=${summary.bySeverity.medium}, low=${summary.bySeverity.low}, ` +
      `info=${summary.bySeverity.info}), ` +
      `rules_run=${summary.rulesRun}, rules_failed=${summary.failedRules.length}`;
    process.stdout.write(`${line}\n`);
    this.logger.log(`Analyze complete for audit ${auditId}: ${line}`);
  }
}
