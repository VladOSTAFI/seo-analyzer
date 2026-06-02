import { Inject, Logger } from '@nestjs/common';
import { Command, CommandRunner } from 'nest-commander';
import { InvalidArgumentError } from '../common/errors';
import { DB, type Database } from '../db/db.types';
import { audits, type NewAudit } from '../db/schema';

/**
 * Validate and normalize a start URL. Accepts only http(s) URLs.
 * Throws InvalidArgumentError (→ clean non-zero exit) on anything malformed.
 */
export function parseStartUrl(input: string | undefined): string {
  const raw = (input ?? '').trim();
  if (!raw) {
    throw new InvalidArgumentError(
      'A <url> argument is required, e.g. audit:create https://example.com',
    );
  }
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new InvalidArgumentError(
      `"${raw}" is not a valid URL. Include the scheme, e.g. https://example.com`,
    );
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new InvalidArgumentError(
      `"${raw}" must use http or https (got "${parsed.protocol.replace(':', '')}").`,
    );
  }
  return parsed.toString();
}

/** Build the insert payload for a new audit row from a validated start URL. */
export function buildAuditPayload(startUrl: string): NewAudit {
  return { startUrl };
}

/**
 * Phase 0 CLI: `audit:create <url>`.
 * Inserts an audits row (status defaults to 'created') and prints the new UUID.
 */
@Command({
  name: 'audit:create',
  arguments: '<url>',
  description: 'Create a new audit for <url> and print its id',
})
export class CreateCommand extends CommandRunner {
  private readonly logger = new Logger(CreateCommand.name);

  constructor(@Inject(DB) private readonly db: Database) {
    super();
  }

  async run(passedParams: string[], _options?: Record<string, unknown>): Promise<void> {
    void _options;
    const startUrl = parseStartUrl(passedParams[0]);
    const [row] = await this.db
      .insert(audits)
      .values(buildAuditPayload(startUrl))
      .returning({ id: audits.id });

    if (!row) {
      throw new Error('Insert returned no row; audit was not created.');
    }

    // The id on stdout is the contract for scripting (later stages take it).
    process.stdout.write(`${row.id}\n`);
    this.logger.log(`Created audit ${row.id} for ${startUrl}`);
  }
}
