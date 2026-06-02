import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { DbModule } from './db/db.module';
import { CrawlModule } from './crawl/crawl.module';
import { EnrichModule } from './enrich/enrich.module';
import { AnalyzeModule } from './analyze/analyze.module';
import { CreateCommand } from './cli/create.command';

/**
 * Root module. CLI-first (no HTTP server in Phase 0).
 *
 * ConfigModule and DbModule are @Global, so the validated env and the Drizzle
 * DB instance are injectable anywhere. CLI commands are registered as providers
 * (CreateCommand here; CrawlCommand via CrawlModule, EnrichCommand via
 * EnrichModule, AnalyzeCommand via AnalyzeModule) and picked up by
 * nest-commander's CommandFactory.
 */
@Module({
  imports: [ConfigModule, DbModule, CrawlModule, EnrichModule, AnalyzeModule],
  providers: [CreateCommand],
})
export class AppModule {}
