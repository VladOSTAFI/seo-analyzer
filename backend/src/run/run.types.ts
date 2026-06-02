import type { CrawlSummary } from '../crawl/crawl.types';
import type { EnrichSummary } from '../enrich/enrich.types';
import type { AnalyzeSummary } from '../analyze/analyze.types';
import type { PerformanceSummary } from '../performance/performance.types';
import type { ReportSummary } from '../report/report.types';

/**
 * Phase 6 orchestration contract. The aggregate result of one full-pipeline run
 * ({@link import('../audit/audit.service').AuditService.runAll}) — every stage's
 * own summary, plus the user-facing deliverable (`reportPath`) and the terminal
 * `status`.
 *
 * Returned ONLY on success: `runAll` rejects (and the audit is marked `failed`)
 * if any stage throws, so a `RunResult` always carries `status: 'done'` and a
 * non-empty `reportPath`. Each nested summary is exactly what that stage service
 * returned, surfaced unchanged for the CLI/caller.
 */
export interface RunResult {
  auditId: string;
  status: 'done';
  reportPath: string;
  crawl: CrawlSummary;
  enrich: EnrichSummary;
  analyze: AnalyzeSummary;
  performance: PerformanceSummary;
  report: ReportSummary;
}
