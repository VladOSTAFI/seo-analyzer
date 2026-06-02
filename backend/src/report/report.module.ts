import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ReportCommand } from '../cli/report.command';
import { ReportService } from './report.service';

/**
 * Phase 5 report module. Wires the report engine ({@link ReportService}) and the
 * `audit:report` CLI command. Imports {@link AuditModule} for status
 * transitions; DB/ENV come from the @Global modules so they need no import here.
 */
@Module({
  imports: [AuditModule],
  providers: [ReportService, ReportCommand],
  exports: [ReportService],
})
export class ReportModule {}
