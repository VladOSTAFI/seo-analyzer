import { boolean, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { audits } from './audits';

/**
 * hreflang entries found during the crawl (Phase 1). Powers i18n checks
 * (step 29); reciprocity (`isReciprocal`) is enriched in Phase 2.
 */
export const hreflangEntries = pgTable(
  'hreflang_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    auditId: uuid('audit_id')
      .notNull()
      .references(() => audits.id, { onDelete: 'cascade' }),
    pageUrl: text('page_url').notNull(),
    lang: text('lang').notNull(), // "uk-UA", "x-default"
    href: text('href').notNull(),
    isReciprocal: boolean('is_reciprocal'), // enriched Phase 2
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => ({
    auditPageIdx: index('hreflang_audit_page_idx').on(t.auditId, t.pageUrl),
  }),
);

export type HreflangEntry = typeof hreflangEntries.$inferSelect;
export type NewHreflangEntry = typeof hreflangEntries.$inferInsert;
