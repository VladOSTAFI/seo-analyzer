import { InvalidArgumentError } from '../common/errors';
import type { Database } from '../db/db.types';
import type { CrawlService } from '../crawl/crawl.service';
import type { EnrichService } from '../enrich/enrich.service';
import type { AnalyzeService } from '../analyze/analyze.service';
import type { PerformanceService } from '../performance/performance.service';
import type { ReportService } from '../report/report.service';
import type { AuditRepository } from './audit.repository';
import { AuditService } from './audit.service';

/** Canned stage summaries (shapes match each service's real return type). */
const CRAWL = { pages: 5, links: 12, images: 3, hreflang: 0 };
const ENRICH = {
  linksResolved: 8,
  redirectLinks: 1,
  brokenLinks: 0,
  pagesWithInlinks: 4,
  imagesResolved: 0,
  hreflangReciprocal: 0,
  redirectChainPages: 0,
  redirectLoopPages: 0,
};
const ANALYZE = {
  totalFindings: 7,
  bySeverity: { critical: 1, high: 2, medium: 2, low: 1, info: 1 },
  byRule: { 'meta.title.missing': 3 },
  rulesRun: 27,
  failedRules: [],
};
const PERF = {
  sampled: 2,
  fetched: 4,
  cached: 0,
  failed: 0,
  findings: 1,
  bySeverity: { critical: 0, high: 0, medium: 1, low: 0, info: 0 },
};
const REPORT = {
  reportPath: '/out/audit-abc.xlsx',
  sheets: 9,
  totalFindings: 8,
  bySeverity: { critical: 1, high: 2, medium: 3, low: 1, info: 1 },
};

const AUDIT_ID = '11111111-2222-3333-4444-555555555555';

/**
 * Build an AuditService with fully mocked collaborators plus a shared `order`
 * array so call ORDERING across the five stages can be asserted. Each stage's
 * mock pushes its name before resolving its canned summary.
 */
function buildService() {
  const order: string[] = [];

  const crawl = {
    crawl: jest.fn().mockImplementation(async () => {
      order.push('crawl');
      return CRAWL;
    }),
  } as unknown as jest.Mocked<CrawlService>;
  const enrich = {
    enrich: jest.fn().mockImplementation(async () => {
      order.push('enrich');
      return ENRICH;
    }),
  } as unknown as jest.Mocked<EnrichService>;
  const analyze = {
    analyze: jest.fn().mockImplementation(async () => {
      order.push('analyze');
      return ANALYZE;
    }),
  } as unknown as jest.Mocked<AnalyzeService>;
  const performance = {
    run: jest.fn().mockImplementation(async () => {
      order.push('perf');
      return PERF;
    }),
  } as unknown as jest.Mocked<PerformanceService>;
  const report = {
    generate: jest.fn().mockImplementation(async () => {
      order.push('report');
      return REPORT;
    }),
  } as unknown as jest.Mocked<ReportService>;

  const auditRepo = {
    assertExists: jest.fn().mockResolvedValue({ id: AUDIT_ID, startUrl: 'https://x.test/' }),
    setStatus: jest.fn().mockResolvedValue(undefined),
    markFailed: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<AuditRepository>;

  // Drizzle insert(...).values(...).returning(...) chain → one row with the id.
  const returning = jest.fn().mockResolvedValue([{ id: AUDIT_ID }]);
  const values = jest.fn().mockReturnValue({ returning });
  const insert = jest.fn().mockReturnValue({ values });
  const db = { insert } as unknown as Database;

  const service = new AuditService(crawl, enrich, analyze, performance, report, auditRepo, db);

  return { service, order, crawl, enrich, analyze, performance, report, auditRepo, insert, values };
}

describe('AuditService.runAll', () => {
  it('runs all five stages exactly once, in order, then sets status=done and returns a RunResult', async () => {
    const { service, order, crawl, enrich, analyze, performance, report, auditRepo } =
      buildService();

    const result = await service.runAll(AUDIT_ID);

    // Each stage called exactly once.
    expect(crawl.crawl).toHaveBeenCalledTimes(1);
    expect(enrich.enrich).toHaveBeenCalledTimes(1);
    expect(analyze.analyze).toHaveBeenCalledTimes(1);
    expect(performance.run).toHaveBeenCalledTimes(1);
    expect(report.generate).toHaveBeenCalledTimes(1);

    // Called with the audit id.
    expect(crawl.crawl).toHaveBeenCalledWith(AUDIT_ID);
    expect(report.generate).toHaveBeenCalledWith(AUDIT_ID);

    // Strict ORDER via the shared array, AND cross-checked via invocationCallOrder.
    expect(order).toEqual(['crawl', 'enrich', 'analyze', 'perf', 'report']);
    const callOrders = [
      crawl.crawl.mock.invocationCallOrder[0],
      enrich.enrich.mock.invocationCallOrder[0],
      analyze.analyze.mock.invocationCallOrder[0],
      performance.run.mock.invocationCallOrder[0],
      report.generate.mock.invocationCallOrder[0],
    ];
    expect(callOrders).toEqual([...callOrders].sort((a, b) => a - b));

    // The orchestrator owns ONLY the terminal 'done' transition (no intermediate
    // statuses — the stages own those).
    expect(auditRepo.setStatus).toHaveBeenCalledTimes(1);
    expect(auditRepo.setStatus).toHaveBeenCalledWith(AUDIT_ID, 'done');
    expect(auditRepo.markFailed).not.toHaveBeenCalled();

    // RunResult aggregates each stage summary + the report path.
    expect(result).toEqual({
      auditId: AUDIT_ID,
      status: 'done',
      reportPath: REPORT.reportPath,
      crawl: CRAWL,
      enrich: ENRICH,
      analyze: ANALYZE,
      performance: PERF,
      report: REPORT,
    });
  });

  it('stops at the failing stage: markFailed(stage) called, later stages skipped, no done, rejects', async () => {
    const { service, order, crawl, enrich, analyze, performance, report, auditRepo } =
      buildService();

    const boom = new Error('analyze blew up');
    (analyze.analyze as jest.Mock).mockImplementation(async () => {
      order.push('analyze');
      throw boom;
    });

    await expect(service.runAll(AUDIT_ID)).rejects.toBe(boom);

    // Stages up to and including the failing one ran.
    expect(crawl.crawl).toHaveBeenCalledTimes(1);
    expect(enrich.enrich).toHaveBeenCalledTimes(1);
    expect(analyze.analyze).toHaveBeenCalledTimes(1);

    // Subsequent stages did NOT run.
    expect(performance.run).not.toHaveBeenCalled();
    expect(report.generate).not.toHaveBeenCalled();
    expect(order).toEqual(['crawl', 'enrich', 'analyze']);

    // Failed at the right stage; never advanced to done.
    expect(auditRepo.markFailed).toHaveBeenCalledTimes(1);
    expect(auditRepo.markFailed).toHaveBeenCalledWith(AUDIT_ID, 'analyze');
    expect(auditRepo.setStatus).not.toHaveBeenCalledWith(AUDIT_ID, 'done');
  });

  it('asserts the audit exists before running any stage', async () => {
    const { service, crawl, auditRepo } = buildService();
    (auditRepo.assertExists as jest.Mock).mockRejectedValue(
      new InvalidArgumentError('No audit found'),
    );

    await expect(service.runAll(AUDIT_ID)).rejects.toBeInstanceOf(InvalidArgumentError);
    expect(crawl.crawl).not.toHaveBeenCalled();
  });
});

describe('AuditService.createAndRun', () => {
  it('rejects an invalid URL before inserting a row or running any stage', async () => {
    const { service, insert, crawl } = buildService();

    await expect(service.createAndRun('not-a-url')).rejects.toBeInstanceOf(InvalidArgumentError);
    expect(insert).not.toHaveBeenCalled();
    expect(crawl.crawl).not.toHaveBeenCalled();
  });

  it('inserts a new audit for a valid URL then runs the pipeline against the new id', async () => {
    const { service, insert, values, crawl, report, auditRepo } = buildService();

    const result = await service.createAndRun('https://example.com');

    // Inserted with the normalized start URL payload.
    expect(insert).toHaveBeenCalledTimes(1);
    expect(values).toHaveBeenCalledWith({ startUrl: 'https://example.com/' });

    // Drove the pipeline against the inserted id.
    expect(crawl.crawl).toHaveBeenCalledWith(AUDIT_ID);
    expect(report.generate).toHaveBeenCalledWith(AUDIT_ID);
    expect(auditRepo.setStatus).toHaveBeenCalledWith(AUDIT_ID, 'done');

    expect(result.auditId).toBe(AUDIT_ID);
    expect(result.status).toBe('done');
    expect(result.reportPath).toBe(REPORT.reportPath);
  });
});
