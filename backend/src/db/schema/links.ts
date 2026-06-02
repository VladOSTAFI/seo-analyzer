import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { audits } from './audits';
import { linkType } from './enums';

/**
 * Every outlink found during the crawl (Phase 1), enriched in Phase 2.
 * Drives redirect/broken-link/inlink analysis.
 */
export const links = pgTable(
  'links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    auditId: uuid('audit_id')
      .notNull()
      .references(() => audits.id, { onDelete: 'cascade' }),

    sourceUrl: text('source_url').notNull(),
    href: text('href').notNull(), // resolved absolute URL
    anchorText: text('anchor_text'),
    type: linkType('type').notNull(),
    rel: jsonb('rel').$type<string[]>().notNull().default([]),

    // enrichment (Phase 2)
    targetStatusCode: integer('target_status_code'),
    isRedirect: boolean('is_redirect'),
    isBroken: boolean('is_broken'),

    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => ({
    auditHrefIdx: index('links_audit_href_idx').on(t.auditId, t.href),
    auditSourceIdx: index('links_audit_source_idx').on(t.auditId, t.sourceUrl),
    auditFlagsIdx: index('links_audit_flags_idx').on(t.auditId, t.isBroken, t.isRedirect),
  }),
);

export type Link = typeof links.$inferSelect;
export type NewLink = typeof links.$inferInsert;
