import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '../../src/db/schema';
import {
  audits,
  findings,
  hreflangEntries,
  images,
  links,
  pages,
  performance,
} from '../../src/db/schema';
import type { NewFinding } from '../../src/db/schema';
import type { Finding, Rule, RuleDb } from '../../src/analyze/rule.types';

/**
 * Real-DB integration test harness for the Phase 3 SQL rules.
 *
 * Wave 2 per-rule tests (`<name>.rule.int-spec.ts`) build on this: seed a tiny,
 * fully-isolated audit, run a single {@link Rule}, assert the emitted findings,
 * then clean up. It talks to a live Postgres via its OWN `pg` Pool + Drizzle
 * (NOT the Nest DI container) over `DATABASE_URL`, so it never boots the app.
 *
 * Isolation contract: every helper is scoped by `auditId`. Each test creates its
 * own audit id ({@link createAudit}) and tears it down ({@link cleanupAudit}),
 * so tests on the shared DB never collide even if run concurrently. Call
 * {@link closePool} once in a global `afterAll`.
 */

const DEFAULT_URL = 'postgres://seo:seo@localhost:5432/seo_audit';

let pool: Pool | undefined;
let db: NodePgDatabase<typeof schema> | undefined;

/** Lazily create (or return) the shared pool + Drizzle handle for the suite. */
export function getDb(): NodePgDatabase<typeof schema> {
  if (!db) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL ?? DEFAULT_URL });
    db = drizzle(pool, { schema });
  }
  return db;
}

/** Close the shared pool. Call once from a global `afterAll` hook. Safe to call twice. */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = undefined;
    db = undefined;
  }
}

/** Insert a fresh `audits` row and return its id. `startUrl` defaults to a stub. */
export async function createAudit(startUrl = 'https://example.test'): Promise<string> {
  const id = randomUUID();
  await getDb().insert(audits).values({ id, startUrl, status: 'analyzing' });
  return id;
}

/** Delete the audit row → cascades to pages/links/images/hreflang/findings/performance. */
export async function cleanupAudit(auditId: string): Promise<void> {
  await getDb().delete(audits).where(eq(audits.id, auditId));
}

/**
 * A page seed. Only `url` is required; everything else has a sensible default so
 * a test specifies just the columns it cares about. `auditId` is injected by
 * {@link seedPages}, so omit it here.
 */
export type SeedPage = Partial<Omit<typeof pages.$inferInsert, 'auditId'>> & { url: string };

/** Bulk-insert pages for `auditId`. Returns the number of rows inserted. */
export async function seedPages(auditId: string, rows: SeedPage[]): Promise<number> {
  if (rows.length === 0) return 0;
  await getDb()
    .insert(pages)
    .values(rows.map((r) => ({ ...r, auditId })));
  return rows.length;
}

/** A link seed. `sourceUrl`, `href`, `type` are required (no meaningful default). */
export type SeedLink = Partial<Omit<typeof links.$inferInsert, 'auditId'>> & {
  sourceUrl: string;
  href: string;
  type: 'internal' | 'external';
};

/** Bulk-insert links for `auditId`. Returns the number of rows inserted. */
export async function seedLinks(auditId: string, rows: SeedLink[]): Promise<number> {
  if (rows.length === 0) return 0;
  await getDb()
    .insert(links)
    .values(rows.map((r) => ({ ...r, auditId })));
  return rows.length;
}

/** An image seed. `pageUrl` + `src` required; `alt`/`title`/`statusCode` optional. */
export type SeedImage = Partial<Omit<typeof images.$inferInsert, 'auditId'>> & {
  pageUrl: string;
  src: string;
};

/** Bulk-insert images for `auditId`. Returns the number of rows inserted. */
export async function seedImages(auditId: string, rows: SeedImage[]): Promise<number> {
  if (rows.length === 0) return 0;
  await getDb()
    .insert(images)
    .values(rows.map((r) => ({ ...r, auditId })));
  return rows.length;
}

/** A hreflang seed. `pageUrl`, `lang`, `href` required; `isReciprocal` optional. */
export type SeedHreflang = Partial<Omit<typeof hreflangEntries.$inferInsert, 'auditId'>> & {
  pageUrl: string;
  lang: string;
  href: string;
};

/** Bulk-insert hreflang entries for `auditId`. Returns the number of rows inserted. */
export async function seedHreflang(auditId: string, rows: SeedHreflang[]): Promise<number> {
  if (rows.length === 0) return 0;
  await getDb()
    .insert(hreflangEntries)
    .values(rows.map((r) => ({ ...r, auditId })));
  return rows.length;
}

/** A performance seed. `pageUrl` + `strategy` required; all PSI metric columns optional. */
export type SeedPerformance = Partial<Omit<typeof performance.$inferInsert, 'auditId'>> & {
  pageUrl: string;
  strategy: 'mobile' | 'desktop';
};

/** Bulk-insert performance rows for `auditId`. Returns the number of rows inserted. */
export async function seedPerformance(auditId: string, rows: SeedPerformance[]): Promise<number> {
  if (rows.length === 0) return 0;
  await getDb()
    .insert(performance)
    .values(rows.map((r) => ({ ...r, auditId })));
  return rows.length;
}

/**
 * A finding seed. `ruleId` + `severity` required; `url` is nullable (site-wide
 * findings) and `detail` defaults to {} (matches the column default). `auditId`
 * is injected by {@link seedFindings}, so omit it here.
 *
 * Phase 5 (report) tests use this to seed the `findings` table directly — the
 * report layer reads ONLY from `findings`, so a report test never needs to
 * crawl/enrich/analyze: just seed the exact findings it asserts on.
 */
export type SeedFinding = Partial<Omit<NewFinding, 'auditId'>> & {
  ruleId: string;
  severity: NewFinding['severity'];
};

/** Bulk-insert findings for `auditId`. Returns the number of rows inserted. */
export async function seedFindings(auditId: string, rows: SeedFinding[]): Promise<number> {
  if (rows.length === 0) return 0;
  await getDb()
    .insert(findings)
    .values(rows.map((r) => ({ ...r, auditId })));
  return rows.length;
}

/**
 * Run a single {@link Rule} against the seeded `auditId` using the shared db as
 * the {@link RuleDb}, and return its findings. This is the unit a Wave 2 per-rule
 * test asserts on — it does NOT persist to the `findings` table (the engine owns
 * that); it just exercises the rule's read SQL.
 */
export async function runRule(rule: Rule, auditId: string): Promise<Finding[]> {
  const ruleDb: RuleDb = getDb();
  return rule.run(ruleDb, auditId);
}
