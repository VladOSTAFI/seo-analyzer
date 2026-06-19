import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CrawlCommand } from '../cli/crawl.command';
import { CrawlService } from './crawl.service';
import { ExtractService } from './extract.service';
import { RobotsService } from './robots.service';
import { SitemapService } from './sitemap.service';

/**
 * Phase 1 crawl module. Wires the crawler ({@link CrawlService}), the extractor
 * it depends on ({@link ExtractService}), and the `audit:crawl` CLI command.
 * Imports {@link AuditModule} for status transitions; DB/ENV come from the
 * @Global Db/Config modules so they need no import here.
 */
@Module({
  imports: [AuditModule],
  providers: [CrawlService, ExtractService, RobotsService, SitemapService, CrawlCommand],
  exports: [CrawlService],
})
export class CrawlModule {}
