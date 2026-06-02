import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { auditStatus } from './enums';

/**
 * Root entity. One row per audit run; every other table FKs to audits.id.
 * Defined in Phase 0; child tables (pages, links, ...) arrive in later phases.
 */
export const audits = pgTable('audits', {
  id: uuid('id').primaryKey().defaultRandom(),
  startUrl: text('start_url').notNull(),
  status: auditStatus('status').notNull().default('created'),
  failedStage: text('failed_stage'), // set when status = 'failed'
  reportPath: text('report_path'), // set in Phase 5
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export type Audit = typeof audits.$inferSelect;
export type NewAudit = typeof audits.$inferInsert;
