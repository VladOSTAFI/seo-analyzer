import type { PsiStrategy } from './psi.types';

/** One URL chosen by the sampler to send to PSI, with why it represents its cluster. */
export interface PerformanceSample {
  url: string;
  templateKey: string; // the cluster signature this url represents
}

/**
 * Outcome of a PerformanceService.run(auditId). `sampled` = representative URLs
 * chosen; `fetched` = (url,strategy) pairs actually sent to PSI this run;
 * `cached` = pairs skipped because a row already existed (idempotent/quota-friendly);
 * `failed` = pairs whose PSI fetch errored (logged, non-fatal); `findings` =
 * perf-family findings written.
 */
export interface PerformanceSummary {
  sampled: number;
  fetched: number;
  cached: number;
  failed: number;
  findings: number;
  bySeverity: Record<string, number>;
}

/**
 * A candidate page row pulled from the DB for sampling. Only the columns the
 * clustering logic needs: the url plus the two tie-break signals (inlink count
 * and crawl depth). The sampler is pure over this shape so it can be unit-tested
 * directly without a DB.
 */
export interface SampleCandidate {
  url: string;
  inlinkCount: number;
  depth: number;
}

/** Re-exported for convenience so consumers of a sample know its strategy union. */
export type { PsiStrategy };
