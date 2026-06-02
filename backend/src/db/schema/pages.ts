import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { audits } from './audits';
import { crawlSource, statusClass } from './enums';

/**
 * Core crawl output (Phase 1) — one row per crawled URL.
 *
 * Metadata columns (title/metaDescription/h1/h2) are jsonb string arrays: storing
 * *all* occurrences lets one column power three checks (missing = empty array,
 * multiple = jsonb_array_length > 1, duplicate = GROUP BY the first element).
 */
export const pages = pgTable(
  'pages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    auditId: uuid('audit_id')
      .notNull()
      .references(() => audits.id, { onDelete: 'cascade' }),

    // identity & response
    url: text('url').notNull(),
    finalUrl: text('final_url'),
    statusCode: integer('status_code'),
    statusClass: statusClass('status_class'),
    redirectChain: jsonb('redirect_chain')
      .$type<{ url: string; statusCode: number }[]>()
      .default([]),
    contentType: text('content_type'),
    responseTimeMs: integer('response_time_ms'),
    contentLengthBytes: integer('content_length_bytes'),
    depth: integer('depth').notNull().default(0),
    crawlSource: crawlSource('crawl_source').notNull().default('link'),

    // metadata (arrays detect missing/duplicate/multiple)
    title: jsonb('title').$type<string[]>().notNull().default([]),
    metaDescription: jsonb('meta_description').$type<string[]>().notNull().default([]),
    h1: jsonb('h1').$type<string[]>().notNull().default([]),
    h2: jsonb('h2').$type<string[]>().notNull().default([]),

    // indexability
    canonicalUrl: text('canonical_url'),
    isSelfCanonical: boolean('is_self_canonical'),
    metaRobots: text('meta_robots'),
    xRobotsTag: text('x_robots_tag'),
    blockedByRobotsTxt: boolean('blocked_by_robots_txt').default(false),

    // pagination
    relNext: text('rel_next'),
    relPrev: text('rel_prev'),

    // dup detection
    contentHash: text('content_hash'),

    // enrichment (filled Phase 2)
    inlinkCount: integer('inlink_count').default(0),

    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => ({
    auditUrlIdx: uniqueIndex('pages_audit_url_idx').on(t.auditId, t.url),
    auditStatusIdx: index('pages_audit_status_idx').on(t.auditId, t.statusClass),
    auditHashIdx: index('pages_audit_hash_idx').on(t.auditId, t.contentHash),
    auditCanonicalIdx: index('pages_audit_canonical_idx').on(t.auditId, t.canonicalUrl),
  }),
);

export type Page = typeof pages.$inferSelect;
export type NewPage = typeof pages.$inferInsert;
