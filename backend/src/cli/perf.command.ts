import { Logger } from '@nestjs/common';
import { Command, CommandRunner } from 'nest-commander';
import { PerformanceService } from '../performance/performance.service';
import { parseAuditId } from './crawl.command';

/**
 * Phase 4 CLI: `audit:perf <auditId>`.
 * Samples representative URLs, fetches PageSpeed Insights / Core Web Vitals for
 * each, writes perf-family findings, and prints a concise one-line summary to
 * stdout. Thrown AppErrors bubble to main.ts's handler.
 *
 * Reuses {@link parseAuditId} from the crawl command so UUID validation has a
 * single source of truth across stages.
 */
@Command({
  name: 'audit:perf',
  arguments: '<auditId>',
  description: 'Phase 4 — PSI/CWV for sampled URLs → findings',
})
export class PerfCommand extends CommandRunner {
  private readonly logger = new Logger(PerfCommand.name);

  constructor(private readonly perf: PerformanceService) {
    super();
  }

  async run(passedParams: string[], _options?: Record<string, unknown>): Promise<void> {
    void _options;
    const auditId = parseAuditId(passedParams[0]);

    const summary = await this.perf.run(auditId);

    const line =
      `sampled=${summary.sampled}, fetched=${summary.fetched}, ` +
      `cached=${summary.cached}, failed=${summary.failed}, ` +
      `findings=${summary.findings}`;
    process.stdout.write(`${line}\n`);
    this.logger.log(`Perf complete for audit ${auditId}: ${line}`);
  }
}
