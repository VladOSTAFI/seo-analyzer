import { Logger } from '@nestjs/common';
import { Command, CommandRunner } from 'nest-commander';
import { InvalidArgumentError } from '../common/errors';
import { CrawlService } from '../crawl/crawl.service';

/** Loose UUID shape check (8-4-4-4-12 hex). The real not-found error comes from
 *  AuditRepository.assertExists; this only catches obvious typos up front. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validate the `<auditId>` argument. Throws InvalidArgumentError (→ clean
 * non-zero exit) when missing or not UUID-ish. Returns the trimmed id.
 */
export function parseAuditId(input: string | undefined): string {
  const raw = (input ?? '').trim();
  if (!raw) {
    throw new InvalidArgumentError(
      'An <auditId> argument is required, e.g. audit:crawl <uuid> ' +
        '(create one first with `audit:create <url>`).',
    );
  }
  if (!UUID_RE.test(raw)) {
    throw new InvalidArgumentError(
      `"${raw}" is not a valid audit id (expected a UUID). ` +
        'Use the id printed by `audit:create <url>`.',
    );
  }
  return raw;
}

/**
 * Phase 1 CLI: `audit:crawl <auditId>`.
 * Runs the crawl stage for an existing audit and prints a concise row-count
 * summary to stdout. Thrown AppErrors bubble to main.ts's handler.
 */
@Command({
  name: 'audit:crawl',
  arguments: '<auditId>',
  description: 'Crawl an existing audit and persist pages/links/images/hreflang',
})
export class CrawlCommand extends CommandRunner {
  private readonly logger = new Logger(CrawlCommand.name);

  constructor(private readonly crawl: CrawlService) {
    super();
  }

  async run(passedParams: string[], _options?: Record<string, unknown>): Promise<void> {
    void _options;
    const auditId = parseAuditId(passedParams[0]);

    const summary = await this.crawl.crawl(auditId);

    const line =
      `pages=${summary.pages}, links=${summary.links}, ` +
      `images=${summary.images}, hreflang=${summary.hreflang}`;
    process.stdout.write(`${line}\n`);
    this.logger.log(`Crawl complete for audit ${auditId}: ${line}`);
  }
}
