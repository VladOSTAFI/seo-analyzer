import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AnalyzeCommand } from '../cli/analyze.command';
import { AnalyzeService } from './analyze.service';

/**
 * Phase 3 analyze module. Wires the analysis engine ({@link AnalyzeService}) and
 * the `audit:analyze` CLI command. Imports {@link AuditModule} for status
 * transitions; DB comes from the @Global DbModule so it needs no import here.
 */
@Module({
  imports: [AuditModule],
  providers: [AnalyzeService, AnalyzeCommand],
  exports: [AnalyzeService],
})
export class AnalyzeModule {}
