import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { EnrichCommand } from '../cli/enrich.command';
import { EnrichService } from './enrich.service';
import { LinkVerifierService } from './link-verifier';

/**
 * Phase 2 enrich module. Wires the enrichment service ({@link EnrichService}),
 * the live broken-link verifier ({@link LinkVerifierService}) and the
 * `audit:enrich` CLI command. Imports {@link AuditModule} for status
 * transitions; DB + ENV come from the @Global DbModule/ConfigModule so they
 * need no import here.
 */
@Module({
  imports: [AuditModule],
  providers: [EnrichService, LinkVerifierService, EnrichCommand],
  exports: [EnrichService],
})
export class EnrichModule {}
