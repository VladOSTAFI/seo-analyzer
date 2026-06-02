import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CrawlModule } from '../crawl/crawl.module';
import { EnrichModule } from '../enrich/enrich.module';
import { AnalyzeModule } from '../analyze/analyze.module';
import { PerformanceModule } from '../performance/performance.module';
import { ReportModule } from '../report/report.module';
import { AuditService } from '../audit/audit.service';
import { RunCommand } from '../cli/run.command';

/**
 * Phase 6 orchestration module. Hosts the {@link AuditService} orchestrator and
 * the `audit:run` CLI command ({@link RunCommand}).
 *
 * NO circular dependency: AuditModule is imported BY every stage module, so the
 * orchestrator (which depends on all five stage services) CANNOT live in
 * AuditModule — that would create a cycle (AuditModule → stage modules →
 * AuditModule). Instead this NEW module sits ABOVE the stages: it imports the
 * five stage modules (each of which already exports its service) plus AuditModule
 * (for AuditRepository). The dependency graph stays a DAG:
 *
 *   RunModule → {Crawl,Enrich,Analyze,Performance,Report}Module → AuditModule
 *
 * AuditService's file lives under src/audit/ to match the plan's repo layout, but
 * module membership is by @Module.providers — RunModule declares it here, so
 * there is no cycle.
 */
@Module({
  imports: [AuditModule, CrawlModule, EnrichModule, AnalyzeModule, PerformanceModule, ReportModule],
  providers: [AuditService, RunCommand],
  exports: [AuditService],
})
export class RunModule {}
