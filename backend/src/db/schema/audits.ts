import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { auditStatus } from './enums';
import type { ScoreResult } from '../../report/report.score';
import { users } from './users';

/**
 * Per-audit scan profile (depth knob for the enrich stage's live network probes).
 *
 * - `standard` (default): the fast audit — runs everything EXCEPT the two SLOW
 *   live probes (image-weight probe and external-link probe). The cheap TLS cert
 *   probe still runs (env-gated as before).
 * - `full`: also runs the image and external-link probes (each still subject to
 *   its ops-level env kill-switch — a heavy probe runs iff profile is `full` AND
 *   its env flag is enabled).
 *
 * Single-sourced here and reused across the DTO/service/enrich layers rather than
 * restating the string literals. Stored as `text` (not a pgEnum) to stay
 * migration-light — the value space is validated by Zod at the API boundary.
 */
export type ScanProfile = 'standard' | 'full';

/**
 * Shape of the parsed robots.txt analysis persisted on the audit (feature 02).
 * One robots.txt per site, so it lives on the audit row (not a child table).
 * Null until the discovery pass runs (= not assessed).
 */
export interface RobotsAudit {
  present: boolean;
  reachable: boolean;
  statusCode: number | null;
  /** Global `Sitemap:` directive URLs (handed to the SitemapService, feature 03). */
  sitemapUrls: string[];
  groups: { userAgent: string; disallow: string[]; allow: string[] }[];
  issues: {
    kind:
      | 'disallow-all'
      | 'disallow-important'
      | 'disallow-assets'
      | 'unreachable'
      | 'no-sitemap-directive';
    detail: string;
    severity: string;
  }[];
}

/**
 * Per-file sitemap validity summary persisted on the audit (feature 03). Null
 * until the discovery pass runs. The per-URL rows live in `sitemap_entries`.
 */
export interface SitemapAudit {
  files: { url: string; valid: boolean; urlCount: number; bytes: number; errors: string[] }[];
  totalUrls: number;
}

/**
 * Root entity. One row per audit run; every other table FKs to audits.id.
 * Defined in Phase 0; child tables (pages, links, ...) arrive in later phases.
 */
export const audits = pgTable(
  'audits',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    startUrl: text('start_url').notNull(),
    status: auditStatus('status').notNull().default('created'),
    failedStage: text('failed_stage'), // set when status = 'failed'
    reportPath: text('report_path'), // set in Phase 5
    // Per-audit scan profile (depth knob): 'standard' (fast — skips the two SLOW
    // live probes) or 'full' (also runs the image + external-link probes). NOT
    // NULL with a 'standard' default so existing rows backfill to the fast audit.
    // Typed as ScanProfile via $type so reads/writes are the narrow union, not a
    // bare string.
    scanProfile: text('scan_profile').notNull().default('standard').$type<ScanProfile>(),
    // Live pipeline progress ({ stage, startedAt }), updated per stage so a
    // polling client can distinguish the long PSI stage from analysis without a
    // new audit_status enum value. Best-effort; null until the first stage runs.
    progress: jsonb('progress').$type<{ stage: string; startedAt: string }>(),
    // Coverage manifest written at the end of runAll: what was assessed vs.
    // skipped (externals verified, images probed, CWV source, inert rules) so
    // silent gaps become explicit "not assessed" statements in the report.
    coverage: jsonb('coverage').$type<Record<string, unknown>>(),
    // SEO health score (plan 12) written at the report stage: overall + per-
    // category 0–100 with formula inputs. Nullable; pre-report audits read null.
    score: jsonb('score').$type<ScoreResult>(),
    // robots.txt audit (feature 02): present/reachable/status, declared Sitemap:
    // directives, parsed user-agent groups, and the disallow-analysis issues the
    // `robots.blocks-important` rule reads. Best-effort; null until the discovery
    // pass runs (= not assessed → coverage manifest).
    robotsAudit: jsonb('robots_audit').$type<RobotsAudit>(),
    // XML sitemap audit (feature 03): per-file validity/url-count/bytes summary;
    // the per-URL rows live in `sitemap_entries`. Best-effort; null until run.
    sitemapAudit: jsonb('sitemap_audit').$type<SitemapAudit>(),
    // Phase A3 — the user who created this audit. NULLABLE on purpose for the
    // migration window: existing rows predate users and CLI-created audits have
    // no principal. Backfilled to a seeded admin and tightened to NOT NULL only
    // post-backfill (see docs/AUTHORIZATION_PLAN.md §5 / §10). Mirrors the FK
    // pattern in refresh-tokens.ts: cascade so deleting a user drops their audits.
    ownerId: uuid('owner_id').references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => ({
    ownerIdx: index('audits_owner_idx').on(t.ownerId),
  }),
);

export type Audit = typeof audits.$inferSelect;
export type NewAudit = typeof audits.$inferInsert;
