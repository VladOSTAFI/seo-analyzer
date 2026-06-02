import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { EnrichCommand } from '../cli/enrich.command';
import { EnrichService } from './enrich.service';

/**
 * Phase 2 enrich module. Wires the enrichment service ({@link EnrichService})
 * and the `audit:enrich` CLI command. Imports {@link AuditModule} for status
 * transitions; DB comes from the @Global DbModule so it needs no import here.
 */
@Module({
  imports: [AuditModule],
  providers: [EnrichService, EnrichCommand],
  exports: [EnrichService],
})
export class EnrichModule {}
