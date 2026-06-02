import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { DbModule } from './db/db.module';
import { CrawlModule } from './crawl/crawl.module';
import { EnrichModule } from './enrich/enrich.module';
import { AnalyzeModule } from './analyze/analyze.module';
import { PerformanceModule } from './performance/performance.module';
import { ReportModule } from './report/report.module';
import { CreateCommand } from './cli/create.command';

/**
 * Root module. CLI-first (no HTTP server in Phase 0).
 *
 * ConfigModule and DbModule are @Global, so the validated env and the Drizzle
 * DB instance are injectable anywhere. CLI commands are registered as providers
 * (CreateCommand here; CrawlCommand via CrawlModule, EnrichCommand via
 * EnrichModule, AnalyzeCommand via AnalyzeModule, PerfCommand via
 * PerformanceModule, ReportCommand via ReportModule) and picked up by
 * nest-commander's CommandFactory.
 */
@Module({
  imports: [
    ConfigModule,
    DbModule,
    CrawlModule,
    EnrichModule,
    AnalyzeModule,
    PerformanceModule,
    ReportModule,
  ],
  providers: [CreateCommand],
})
export class AppModule {}
