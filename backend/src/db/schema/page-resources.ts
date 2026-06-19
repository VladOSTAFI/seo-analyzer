import { boolean, index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { audits } from './audits';

/**
 * Sub-resources referenced from crawled pages (feature 09; reused by feature 11).
 *
 * One row per distinct `(audit_id, page_url, src)` resource the page links to —
 * images today (`kind='image'`), scripts/styles/fonts later (feature 11). The
 * byte-weight + format columns are populated by the best-effort image probe pass
 * ({@link import('../../enrich/link-verifier').LinkVerifierService.probeImages}),
 * gated OFF by default; `is_https` is the scheme of the resolved `src` and drives
 * the feature-11 `security.mixed-content` rule.
 *
 * Probe semantics mirror the other live passes: NOT strictly idempotent — a
 * re-run re-probes and overwrites bytes/format/status to reflect the current live
 * resource. `bytes`/`format`/`status_code` are null until probed.
 */
export const pageResources = pgTable(
  'page_resources',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    auditId: uuid('audit_id')
      .notNull()
      .references(() => audits.id, { onDelete: 'cascade' }),
    pageUrl: text('page_url').notNull(), // page the resource was referenced from
    src: text('src').notNull(), // resolved absolute resource URL
    kind: text('kind').notNull(), // 'image' | 'script' | 'style' | 'font' | 'other'
    isHttps: boolean('is_https').notNull(), // scheme of src (drives security.mixed-content)
    bytes: integer('bytes'), // transfer/content bytes; null = not probed
    format: text('format'), // 'webp'|'avif'|'jpeg'|'png'|'gif'|'svg'|...; null = unknown
    statusCode: integer('status_code'), // probe status; null = not probed
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => ({
    auditPageIdx: index('page_resources_audit_page_idx').on(t.auditId, t.pageUrl),
    auditKindIdx: index('page_resources_audit_kind_idx').on(t.auditId, t.kind),
  }),
);

export type PageResource = typeof pageResources.$inferSelect;
export type NewPageResource = typeof pageResources.$inferInsert;
