import { boolean, index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { audits } from './audits';

/**
 * Structured-data (Schema.org / JSON-LD) nodes found during the crawl (Phase 2).
 * One row per JSON-LD node — a single page can contribute many rows (top-level
 * array, `@graph`, or multiple `<script type="application/ld+json">` blocks).
 *
 * Powers the `schema.*` rules (presence / JSON validity / shape completeness /
 * LocalBusiness NAP). `valid` reflects JSON parsed AND required props present;
 * `errors` carries the syntax + shape annotations the rules project. `type` is
 * null for a block that could not be JSON-parsed at all.
 */
export const structuredData = pgTable(
  'structured_data',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    auditId: uuid('audit_id')
      .notNull()
      .references(() => audits.id, { onDelete: 'cascade' }),
    pageUrl: text('page_url').notNull(),
    type: text('type'), // schema.org @type, e.g. "LocalBusiness"; null = unparseable block
    valid: boolean('valid').notNull(), // JSON parsed AND required props present
    errors: jsonb('errors')
      .$type<{ code: string; prop?: string; type?: string; message?: string }[]>()
      .notNull()
      .default([]),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => ({
    auditPageIdx: index('structured_data_audit_page_idx').on(t.auditId, t.pageUrl),
    auditTypeIdx: index('structured_data_audit_type_idx').on(t.auditId, t.type),
  }),
);

export type StructuredData = typeof structuredData.$inferSelect;
export type NewStructuredData = typeof structuredData.$inferInsert;
