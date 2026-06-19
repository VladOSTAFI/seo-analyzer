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
import { crawlSource, pageKind, statusClass } from './enums';

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
    // Resource classification, set at crawl-persist time from content_type +
    // crawl_source. Rules filter on `page_kind = 'html'` so non-content rows
    // (sitemap/feed) are never analyzed as HTML pages. Defaults to 'html' so
    // pre-existing rows keep their prior (HTML-only) behavior until backfilled.
    pageKind: pageKind('page_kind').notNull().default('html'),

    // metadata (arrays detect missing/duplicate/multiple)
    title: jsonb('title').$type<string[]>().notNull().default([]),
    metaDescription: jsonb('meta_description').$type<string[]>().notNull().default([]),
    h1: jsonb('h1').$type<string[]>().notNull().default([]),
    h2: jsonb('h2').$type<string[]>().notNull().default([]),

    // social metadata (Open Graph + Twitter Card). Nullable: absent → null =
    // "no social metadata". Pre-existing rows are NULL until a re-crawl backfills.
    ogData: jsonb('og_data').$type<{
      ogTitle: string | null;
      ogDescription: string | null;
      ogImage: string | null;
      ogUrl: string | null;
      ogType: string | null;
      ogSiteName: string | null;
      twitterCard: string | null;
      twitterTitle: string | null;
      twitterDescription: string | null;
      twitterImage: string | null;
    } | null>(),

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

    // ── Feature 08 (content semantics). All nullable/defaulted, backfill-safe.
    //   `htmlLang`/`charset`/`hasViewport` are the SHARED columns also read by
    //   feature 11 — defined ONCE here (08 owns them) to avoid a duplicate
    //   migration. ──────────────────────────────────────────────────────────
    wordCount: integer('word_count'), // visible-text word count
    htmlBytes: integer('html_bytes'), // raw HTML length, for content-to-code ratio
    htmlLang: text('html_lang'), // <html lang>, null if absent
    charset: text('charset'), // detected charset, null if absent
    hasViewport: boolean('has_viewport').default(false),
    headingsOutline: jsonb('headings_outline')
      .$type<{ level: number; text: string }[]>()
      .default([]),
    contentSimhash: text('content_simhash'), // 64-bit SimHash as a 64-char bit string; null if no body
    titlePx: integer('title_px'), // estimated SERP pixel width of title->>0
    descPx: integer('desc_px'), // estimated SERP pixel width of meta_description->>0

    // ── Feature 11 (HTTPS / security headers / mobile usability). Additive
    //   only; READS feature-08's htmlLang/charset/hasViewport above. ──────────
    viewportContent: text('viewport_content'), // raw <meta name=viewport> content attr; null = absent
    hsts: text('hsts'), // Strict-Transport-Security header value; null = absent
    cspPresent: boolean('csp_present').notNull().default(false), // Content-Security-Policy header present
    xContentTypeOptions: text('x_content_type_options'), // X-Content-Type-Options header value
    // Static mobile-usability heuristic hits (tiny inline fonts / fixed-width
    // overflow); medium-confidence estimate until the render path lands.
    mobileUsabilityIssues: jsonb('mobile_usability_issues').$type<string[]>().default([]),
    // Cert columns — set by the best-effort enrich TLS probe (gated). null = not checked.
    certValid: boolean('cert_valid'),
    certDaysToExpiry: integer('cert_days_to_expiry'),

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
