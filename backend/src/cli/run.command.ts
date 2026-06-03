import { Logger } from '@nestjs/common';
import { Command, CommandRunner } from 'nest-commander';
import { AuditService } from '../audit/audit.service';
import { parseStartUrl } from './create.command';

/**
 * Phase 6 CLI: `audit:run <url>`.
 * The one-command, cold-start entrypoint: creates a new audit for `<url>` then
 * drives the full pipeline (crawl → enrich → analyze → perf → report) to a
 * finished `.xlsx`. Prints a concise one-line summary ending with the report
 * path (the user-facing deliverable). Thrown AppErrors bubble to main.ts's
 * handler; a stage failure marks the audit `failed` and rejects.
 *
 * Reuses {@link parseStartUrl} from the create command so the URL contract is
 * single-sourced with `audit:create`.
 *
 * Runs UNAUTHENTICATED — there is no principal in the CLI, so it passes
 * `ownerId = null` (Phase A3; the column is nullable for exactly this reason).
 */
@Command({
  name: 'audit:run',
  arguments: '<url>',
  description: 'Phase 6 — full pipeline: create audit, crawl→enrich→analyze→perf→report → .xlsx',
})
export class RunCommand extends CommandRunner {
  private readonly logger = new Logger(RunCommand.name);

  constructor(private readonly audit: AuditService) {
    super();
  }

  async run(passedParams: string[], _options?: Record<string, unknown>): Promise<void> {
    void _options;
    const url = parseStartUrl(passedParams[0]);

    const result = await this.audit.createAndRun(url, null);

    const line =
      `audit ${result.auditId} ${result.status} — ` +
      `pages=${result.crawl.pages} findings=${result.report.totalFindings} ` +
      `report=${result.reportPath}`;
    process.stdout.write(`${line}\n`);
    this.logger.log(`Run complete for audit ${result.auditId}: ${line}`);
  }
}
