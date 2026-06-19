import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { auditStatus } from './enums';
import { users } from './users';

/**
 * Root entity. One row per audit run; every other table FKs to audits.id.
 * Defined in Phase 0; child tables (pages, links, ...) arrive in later phases.
 */
export const audits = pgTable(
  'audits',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    startUrl: text('start_url').notNull(),
    status: auditStatus('status').notNull().default('created'),
    failedStage: text('failed_stage'), // set when status = 'failed'
    reportPath: text('report_path'), // set in Phase 5
    // Live pipeline progress ({ stage, startedAt }), updated per stage so a
    // polling client can distinguish the long PSI stage from analysis without a
    // new audit_status enum value. Best-effort; null until the first stage runs.
    progress: jsonb('progress').$type<{ stage: string; startedAt: string }>(),
    // Coverage manifest written at the end of runAll: what was assessed vs.
    // skipped (externals verified, images probed, CWV source, inert rules) so
    // silent gaps become explicit "not assessed" statements in the report.
    coverage: jsonb('coverage').$type<Record<string, unknown>>(),
    // Phase A3 — the user who created this audit. NULLABLE on purpose for the
    // migration window: existing rows predate users and CLI-created audits have
    // no principal. Backfilled to a seeded admin and tightened to NOT NULL only
    // post-backfill (see docs/AUTHORIZATION_PLAN.md §5 / §10). Mirrors the FK
    // pattern in refresh-tokens.ts: cascade so deleting a user drops their audits.
    ownerId: uuid('owner_id').references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => ({
    ownerIdx: index('audits_owner_idx').on(t.ownerId),
  }),
);

export type Audit = typeof audits.$inferSelect;
export type NewAudit = typeof audits.$inferInsert;
