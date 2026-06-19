import type { Database } from '../db/db.types';
import { confidence as confidenceEnum, severity as severityEnum } from '../db/schema';

/** Valid finding severities, derived from the pgEnum (critical|high|medium|low|info). */
export type Severity = (typeof severityEnum.enumValues)[number];

/** Valid finding confidences, derived from the pgEnum (high|medium|low). */
export type Confidence = (typeof confidenceEnum.enumValues)[number];

/**
 * One emitted finding. The engine stamps `ruleId` onto the persisted row and,
 * by default, the Rule's static `severity`/`confidence` — so a Rule normally
 * only returns the affected URL + structured detail. `url` is null for
 * site-wide findings.
 *
 * A rule MAY override per finding: return `severity` to grade individual rows
 * differently (e.g. mobile perf flags > desktop), or `confidence` to mark a
 * row as estimated/unverified (origin-level CrUX, un-probed external link).
 * When omitted, the engine falls back to the Rule's static values.
 */
export interface Finding {
  url: string | null;
  detail?: Record<string, unknown>;
  severity?: Severity;
  confidence?: Confidence;
}

/** A read handle that exposes Drizzle's `execute` (satisfied by the tx or the db). */
export type RuleDb = Pick<Database, 'execute'>;

/**
 * One audit check. `run` issues set-based SQL (no row-by-row Node work) scoped
 * to `auditId` and returns the findings. Pure read — the engine owns all writes.
 */
export interface Rule {
  id: string; // stable key written to findings.ruleId, e.g. "meta.title.duplicate"
  description: string;
  severity: Severity;
  /** Static default confidence for this rule's findings; defaults to 'high'. */
  confidence?: Confidence;
  run(db: RuleDb, auditId: string): Promise<Finding[]>;
}
