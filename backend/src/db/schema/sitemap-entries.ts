import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { audits } from './audits';

/**
 * XML-sitemap output (Phase 2, feature 03) — one row per `<loc>` discovered in
 * the site's sitemap(s), deduped by normalized URL.
 *
 * The `SitemapService` discovery sub-step parses the sitemaps declared in
 * robots.txt (`audits.robots_audit.sitemapUrls`, feature 02), falling back to
 * `/sitemap.xml`, and inserts one row per listed URL (delete-then-insert per
 * audit for idempotency). It then fills the diff/join columns with a single
 * set-based UPDATE against `pages` (matched by normalized url), so the
 * `sitemap.*` rules — and feature 04's orphan diff — read pre-joined data with
 * no row-by-row Node work:
 *  - `inCrawl`         — does a `pages` row exist for this loc in this audit?
 *  - `statusCode`      — copied from the matching page (null when not crawled).
 *  - `isSelfCanonical` — copied from the matching page.
 *  - `isNoindex`       — derived from the page's meta_robots / x_robots_tag.
 *
 * `(audit_id, loc)` is unique so the delete-then-insert dedup holds and the join
 * back to `pages.url` is index-backed.
 */
export const sitemapEntries = pgTable(
  'sitemap_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    auditId: uuid('audit_id')
      .notNull()
      .references(() => audits.id, { onDelete: 'cascade' }),

    loc: text('loc').notNull(), // normalized URL from <loc>
    sourceSitemap: text('source_sitemap'), // which sitemap file listed it (index files)
    lastmod: text('lastmod'), // raw <lastmod> (string; not all are valid dates)
    changefreq: text('changefreq'),
    priority: text('priority'),

    // diff/join results, filled by a set-based UPDATE after the crawl:
    inCrawl: boolean('in_crawl').notNull().default(false),
    statusCode: integer('status_code'), // from matching pages row, null if not crawled
    isSelfCanonical: boolean('is_self_canonical'),
    isNoindex: boolean('is_noindex'), // derived from pages.meta_robots / x_robots_tag

    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => ({
    auditLocIdx: uniqueIndex('sitemap_entries_audit_loc_idx').on(t.auditId, t.loc),
    auditInCrawlIdx: index('sitemap_entries_audit_incrawl_idx').on(t.auditId, t.inCrawl),
  }),
);

export type SitemapEntry = typeof sitemapEntries.$inferSelect;
export type NewSitemapEntry = typeof sitemapEntries.$inferInsert;
