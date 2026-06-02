import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { DbModule } from './db/db.module';
import { CrawlModule } from './crawl/crawl.module';
import { EnrichModule } from './enrich/enrich.module';
import { AnalyzeModule } from './analyze/analyze.module';
import { PerformanceModule } from './performance/performance.module';
import { ReportModule } from './report/report.module';
import { RunModule } from './run/run.module';
import { CreateCommand } from './cli/create.command';

/**
 * Root module. CLI-first (no HTTP server in Phase 0).
 *
 * ConfigModule and DbModule are @Global, so the validated env and the Drizzle
 * DB instance are injectable anywhere. CLI commands are registered as providers
 * (CreateCommand here; CrawlCommand via CrawlModule, EnrichCommand via
 * EnrichModule, AnalyzeCommand via AnalyzeModule, PerfCommand via
 * PerformanceModule, ReportCommand via ReportModule, RunCommand via RunModule)
 * and picked up by nest-commander's CommandFactory.
 *
 * RunModule hosts the Phase 6 orchestrator + `audit:run`; it imports the five
 * stage modules itself, so they are wired regardless. Importing a stage module
 * both here and in RunModule is fine — Nest dedupes — and keeps the individual
 * stage commands registered.
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
    RunModule,
  ],
  providers: [CreateCommand],
})
export class AppModule {}
