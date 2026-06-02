import type { Database } from '../db/db.types';
import { severity as severityEnum } from '../db/schema';

/** Valid finding severities, derived from the pgEnum (critical|high|medium|low|info). */
export type Severity = (typeof severityEnum.enumValues)[number];

/**
 * One emitted finding. The engine stamps `ruleId` + `severity` from the Rule
 * onto the persisted row, so a Rule only returns the affected URL + structured
 * detail. `url` is null for site-wide findings.
 */
export interface Finding {
  url: string | null;
  detail?: Record<string, unknown>;
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
  run(db: RuleDb, auditId: string): Promise<Finding[]>;
}
