import { Logger } from '@nestjs/common';
import { Command, CommandRunner } from 'nest-commander';
import { EnrichService } from '../enrich/enrich.service';
import { parseAuditId } from './crawl.command';

/**
 * Phase 2 CLI: `audit:enrich <auditId>`.
 * Runs the enrichment stage for an already-crawled audit and prints a concise
 * one-line summary to stdout. Thrown AppErrors bubble to main.ts's handler.
 *
 * Reuses {@link parseAuditId} from the crawl command so UUID validation has a
 * single source of truth across stages.
 */
@Command({
  name: 'audit:enrich',
  arguments: '<auditId>',
  description: 'Enrich a crawled audit: resolve link targets, inlinks, hreflang reciprocity',
})
export class EnrichCommand extends CommandRunner {
  private readonly logger = new Logger(EnrichCommand.name);

  constructor(private readonly enrich: EnrichService) {
    super();
  }

  async run(passedParams: string[], _options?: Record<string, unknown>): Promise<void> {
    void _options;
    const auditId = parseAuditId(passedParams[0]);

    const summary = await this.enrich.enrich(auditId);

    const line =
      `links=${summary.linksResolved} ` +
      `(redirect=${summary.redirectLinks}, broken=${summary.brokenLinks}), ` +
      `inlinked_pages=${summary.pagesWithInlinks}, ` +
      `hreflang_reciprocal=${summary.hreflangReciprocal}, ` +
      `redirect_chains=${summary.redirectChainPages}, loops=${summary.redirectLoopPages}`;
    process.stdout.write(`${line}\n`);
    this.logger.log(`Enrich complete for audit ${auditId}: ${line}`);
  }
}
