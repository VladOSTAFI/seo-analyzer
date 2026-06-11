import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { audits } from './audits';
import { confidence, severity } from './enums';

/**
 * Output of the analysis engine (Phase 3) — one row per detected issue.
 *
 * The engine stamps `ruleId` + `severity` from the {@link import('../../analyze/rule.types').Rule}
 * onto each row; the rule itself only returns the affected `url` and structured
 * `detail`. `url` is NULL for site-wide findings (e.g. mirror checks). The
 * `(auditId, ruleId)` and `(auditId, severity)` composite indexes keep the
 * report-side aggregations (group by rule / by severity) fast.
 *
 * Re-running analyze for an audit deletes its prior findings first, so this table
 * always reflects the latest run (idempotent — no stale findings survive).
 */
export const findings = pgTable(
  'findings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    auditId: uuid('audit_id')
      .notNull()
      .references(() => audits.id, { onDelete: 'cascade' }),
    ruleId: text('rule_id').notNull(), // e.g. "meta.title.duplicate"
    severity: severity('severity').notNull(),
    // How directly the signal was measured. Defaults to 'high' (directly
    // observed); rules lower it for estimated/unverified data (origin-level
    // CrUX, un-probed external links). Orthogonal to severity.
    confidence: confidence('confidence').notNull().default('high'),
    url: text('url'), // affected URL (nullable for site-wide findings)
    detail: jsonb('detail').$type<Record<string, unknown>>().default({}),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => ({
    auditRuleIdx: index('findings_audit_rule_idx').on(t.auditId, t.ruleId),
    auditSeverityIdx: index('findings_audit_severity_idx').on(t.auditId, t.severity),
  }),
);

export type Finding = typeof findings.$inferSelect;
export type NewFinding = typeof findings.$inferInsert;
