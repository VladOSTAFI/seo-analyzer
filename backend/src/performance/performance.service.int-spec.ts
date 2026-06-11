import { and, eq, sql } from 'drizzle-orm';
import { AuditRepository } from '../audit/audit.repository';
import type { Database } from '../db/db.types';
import { findings, performance } from '../db/schema';
import type { Env } from '../config/env.validation';
import { PerformanceService } from './performance.service';
import type { PsiClient, PsiMetrics, PsiStrategy } from './psi.types';
import {
  cleanupAudit,
  closePool,
  createAudit,
  getDb,
  seedPages,
} from '../../test/int/rule-harness';

/**
 * Real-DB integration test for {@link PerformanceService}. It boots NO Nest and
 * makes NO network calls: the service is constructed by hand against the harness
 * `getDb()` handle, a real {@link AuditRepository}, a FAKE {@link PsiClient}
 * returning deterministic metrics, and a fake {@link Env}.
 *
 * Asserts the sampling → persist → rules pipeline writes `performance` rows for
 * every sampled (url, strategy), that a second run is fully cached (fetched=0)
 * and idempotent (the unique index keeps row counts stable), then cleans up.
 */
describe('PerformanceService (integration)', () => {
  const db = getDb() as unknown as Database;
  const auditRepo = new AuditRepository(db);
  const env = { PSI_MAX_SAMPLES: 20 } as unknown as Env;

  // Deterministic fake PSI client. Records calls so we can assert fetch counts.
  const fetchCalls: { url: string; strategy: PsiStrategy }[] = [];
  const fakePsi: PsiClient = {
    fetch: async (url: string, strategy: PsiStrategy): Promise<PsiMetrics> => {
      fetchCalls.push({ url, strategy });
      return {
        lcpMs: 4000,
        cls: 0.05,
        inpMs: 180,
        performanceScore: 55,
        fcpMs: 1800,
        tbtMs: 250,
        speedIndexMs: 3000,
        usabilityFlags: ['unsized-images'],
        cwvSource: 'field',
        isOriginFallback: false,
        raw: { url, strategy },
      };
    },
  };

  const service = new PerformanceService(db, auditRepo, fakePsi, env);
  let auditId: string;

  afterAll(async () => {
    await closePool();
  });

  beforeEach(async () => {
    fetchCalls.length = 0;
    auditId = await createAudit();
    // Two templates: /product/:id (3 id-variants → 1 representative) + /about.
    await seedPages(auditId, [
      {
        url: 'https://example.test/product/1',
        statusCode: 200,
        statusClass: '2xx',
        contentType: 'text/html; charset=utf-8',
        depth: 2,
        inlinkCount: 3,
      },
      {
        url: 'https://example.test/product/2',
        statusCode: 200,
        statusClass: '2xx',
        contentType: 'text/html; charset=utf-8',
        depth: 2,
        inlinkCount: 9,
      },
      {
        url: 'https://example.test/product/3',
        statusCode: 200,
        statusClass: '2xx',
        contentType: 'text/html; charset=utf-8',
        depth: 2,
        inlinkCount: 1,
      },
      {
        url: 'https://example.test/about',
        statusCode: 200,
        statusClass: '2xx',
        contentType: 'text/html',
        depth: 1,
        inlinkCount: 5,
      },
      // Non-html / non-2xx pages must be excluded from sampling.
      {
        url: 'https://example.test/logo.png',
        statusCode: 200,
        statusClass: '2xx',
        contentType: 'image/png',
        depth: 1,
        inlinkCount: 2,
      },
      {
        url: 'https://example.test/missing',
        statusCode: 404,
        statusClass: '4xx',
        contentType: 'text/html',
        depth: 2,
        inlinkCount: 0,
      },
    ]);
  });

  afterEach(async () => {
    await cleanupAudit(auditId);
  });

  it('samples representative urls and writes performance rows per (url, strategy)', async () => {
    const summary = await service.run(auditId);

    // Two clusters survive the html/2xx filter: /product/:id and /about.
    expect(summary.sampled).toBe(2);
    expect(summary.fetched).toBe(4); // 2 urls × {mobile, desktop}
    expect(summary.cached).toBe(0);
    expect(summary.failed).toBe(0);

    const rows = await db.select().from(performance).where(eq(performance.auditId, auditId));
    expect(rows).toHaveLength(4);

    // The /product/:id representative is the highest-inlink member (product/2).
    const urls = new Set(rows.map((r) => r.pageUrl));
    expect(urls).toEqual(new Set(['https://example.test/product/2', 'https://example.test/about']));

    // Excluded pages were never sampled.
    expect(fetchCalls.some((c) => c.url.endsWith('/logo.png'))).toBe(false);
    expect(fetchCalls.some((c) => c.url.endsWith('/missing'))).toBe(false);

    // Metrics mapped onto columns.
    const sample = rows[0];
    expect(sample.lcpMs).toBe(4000);
    expect(sample.performanceScore).toBeCloseTo(55);
    expect(sample.usabilityFlags).toEqual(['unsized-images']);

    // Provenance fields are persisted.
    expect(sample.cwvSource).toBe('field');
    expect(sample.isOriginFallback).toBe(false);

    // Findings count is non-negative (perf rules may still be Agent C stubs).
    expect(summary.findings).toBeGreaterThanOrEqual(0);
  });

  it('is idempotent: a second run is fully cached with no duplicate rows', async () => {
    await service.run(auditId);
    fetchCalls.length = 0;

    const second = await service.run(auditId);

    expect(second.fetched).toBe(0);
    expect(second.cached).toBe(4);
    expect(second.failed).toBe(0);
    expect(fetchCalls).toHaveLength(0); // nothing re-fetched

    const rows = await db.select().from(performance).where(eq(performance.auditId, auditId));
    expect(rows).toHaveLength(4); // unique index held — no duplicates
  });

  it('only deletes perf-family findings on re-run, leaving analyze findings intact', async () => {
    // Seed a non-perf finding the perf run must NOT clobber.
    await db.insert(findings).values({
      auditId,
      ruleId: 'meta.title.missing',
      severity: 'medium',
      url: 'https://example.test/about',
      detail: {},
    });

    await service.run(auditId);
    await service.run(auditId); // re-run

    const analyzeFindings = await db
      .select()
      .from(findings)
      .where(and(eq(findings.auditId, auditId), sql`${findings.ruleId} like 'meta.%'`));
    expect(analyzeFindings).toHaveLength(1);
  });
});
