import { boolean, index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { audits } from './audits';

/**
 * Images found during the crawl (Phase 1). Powers alt/title checks (step 30)
 * and broken-image detection (statusCode enriched in Phase 2).
 *
 * Feature 09 adds the static HTML signals captured at extraction time
 * (`width`/`height`/`loading`/`hasSrcset`/`hasSizes`) that drive the
 * unsized-images / responsive / lazy-loading rules. Byte weight + format are NOT
 * stored here — they live in `page_resources` (populated by the image probe).
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

    // Static HTML signals (feature 09, extraction-time; additive).
    width: integer('width'), // intrinsic width attr; null = absent
    height: integer('height'), // intrinsic height attr; null = absent
    loading: text('loading'), // 'lazy' | 'eager' | null
    hasSrcset: boolean('has_srcset').notNull().default(false),
    hasSizes: boolean('has_sizes').notNull().default(false),

    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => ({
    auditPageIdx: index('images_audit_page_idx').on(t.auditId, t.pageUrl),
  }),
);

export type Image = typeof images.$inferSelect;
export type NewImage = typeof images.$inferInsert;
