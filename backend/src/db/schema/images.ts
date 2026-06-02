import { index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { audits } from './audits';

/**
 * Images found during the crawl (Phase 1). Powers alt/title checks (step 30)
 * and broken-image detection (statusCode enriched in Phase 2).
 */
export const images = pgTable(
  'images',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    auditId: uuid('audit_id')
      .notNull()
      .references(() => audits.id, { onDelete: 'cascade' }),
    pageUrl: text('page_url').notNull(),
    src: text('src').notNull(),
    alt: text('alt'), // null = missing
    title: text('title'),
    statusCode: integer('status_code'), // enriched Phase 2
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => ({
    auditPageIdx: index('images_audit_page_idx').on(t.auditId, t.pageUrl),
  }),
);

export type Image = typeof images.$inferSelect;
export type NewImage = typeof images.$inferInsert;
