import type { Severity } from './rule.types';

/**
 * Phase 3 analysis contract. Produced by one
 * {@link import('./analyze.service').AnalyzeService.analyze} run and surfaced for
 * both structured logging and the `audit:analyze` CLI summary line.
 *
 * Counts are derived from the findings actually persisted in this run (analyze
 * deletes prior findings first, so the numbers reflect the latest state). Re-running
 * analyze on the same crawled+enriched audit yields identical numbers (idempotent).
 */
export interface AnalyzeSummary {
  /** Total findings written across all rules. */
  totalFindings: number;
  /** Findings broken down by severity (every severity key present, zero-filled). */
  bySeverity: Record<Severity, number>;
  /** ruleId → count, only for rules that produced at least one finding. */
  byRule: Record<string, number>;
  /** Number of rules executed (the full registry, regardless of outcome). */
  rulesRun: number;
  /** Rule ids whose `run()` threw — isolated and skipped, not fatal. */
  failedRules: string[];
}
