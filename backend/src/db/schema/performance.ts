import {
  boolean,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { audits } from './audits';

/**
 * PageSpeed Insights / Core Web Vitals output (Phase 4) — one row per
 * (audit, page, strategy).
 *
 * `strategy` is the PSI device profile ('mobile' | 'desktop'), stored verbatim.
 *
 * Two metric families are captured:
 *  - Core Web Vitals FIELD data (CrUX real-user measurements): `lcpMs`, `cls`,
 *    `inpMs`. These are NULL for low-traffic URLs PSI has no field data for.
 *  - LAB metrics (Lighthouse synthetic run): `performanceScore` (0..100),
 *    `fcpMs`, `tbtMs`, `speedIndexMs` — the fallback when field data is absent.
 *
 * `usabilityFlags` is the list of failing/low-score audit ids (performance
 * opportunities + SEO/usability failures) surfaced by the perf.* rules.
 * `psiRaw` keeps the full untouched API response for forensic use.
 *
 * The `(auditId, pageUrl, strategy)` unique index enforces one row per page per
 * device profile, which both powers caching/idempotency (a re-run skips a
 * (page,strategy) pair that already has a row → quota-friendly) and keeps the
 * perf rule aggregations fast.
 */
export const performance = pgTable(
  'performance',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    auditId: uuid('audit_id')
      .notNull()
      .references(() => audits.id, { onDelete: 'cascade' }),
    pageUrl: text('page_url').notNull(),
    strategy: text('strategy').notNull(), // 'mobile' | 'desktop'

    // Core Web Vitals (field data)
    lcpMs: integer('lcp_ms'),
    cls: real('cls'),
    inpMs: integer('inp_ms'),

    // lab metrics
    performanceScore: real('performance_score'),
    fcpMs: integer('fcp_ms'),
    tbtMs: integer('tbt_ms'),
    speedIndexMs: integer('speed_index_ms'),

    usabilityFlags: jsonb('usability_flags').$type<string[]>().default([]),

    // Provenance of the Core Web Vitals numbers above. When PSI has no
    // page-level CrUX it returns ORIGIN-level aggregates in the same shape, so
    // identical CWV tuples get written to every page. `isOriginFallback` records
    // that, and `cwvSource` records whether the CWV came from CrUX field data,
    // the Lighthouse lab run, or were absent — so rules can collapse origin-level
    // data into one site-level finding and lower its confidence.
    isOriginFallback: boolean('is_origin_fallback').notNull().default(false),
    cwvSource: text('cwv_source'), // 'field' | 'lab' | 'none'

    psiRaw: jsonb('psi_raw'), // full API response
    fetchedAt: timestamp('fetched_at').notNull().defaultNow(),
  },
  (t) => ({
    auditPageStrategyIdx: uniqueIndex('perf_audit_page_strategy_idx').on(
      t.auditId,
      t.pageUrl,
      t.strategy,
    ),
  }),
);

export type Performance = typeof performance.$inferSelect;
export type NewPerformance = typeof performance.$inferInsert;
