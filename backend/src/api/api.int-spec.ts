import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import supertest from 'supertest';
import { AppModule } from '../app.module';
import { AuditService } from '../audit/audit.service';
import { cleanupAudit, closePool, createAudit, seedFindings } from '../../test/int/rule-harness';

/**
 * End-to-end integration test for the Phase 7 REST API. Boots the REAL
 * {@link AppModule} over the live DB (Nest testing + supertest) and exercises
 * every route through the full HTTP stack — the ZodValidationPipe, the global
 * AppErrorFilter, the controller, and the real {@link AuditQueryService}/
 * {@link AuditService} against Postgres.
 *
 * NO LIVE NETWORK: `POST /audits` would otherwise trigger a real crawl via
 * `runInBackground`. We spy on the booted {@link AuditService} and stub
 * `runInBackground` to a no-op, so the POST acknowledges (202 + new id, row
 * inserted) WITHOUT any outbound traffic. Every audit created here is tracked
 * and cleaned up; the spy is restored and the pool closed in teardown.
 */
describe('Audits REST API (e2e, live DB)', () => {
  let app: INestApplication;
  let http: supertest.Agent;
  let runSpy: jest.SpyInstance;

  // Every audit id we create (seeded or via POST) — cleaned up in afterAll.
  const created = new Set<string>();
  let seededId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    http = supertest(app.getHttpServer());

    // Stub the background pipeline so POST never reaches the network.
    const auditService = app.get(AuditService);
    runSpy = jest.spyOn(auditService, 'runInBackground').mockResolvedValue(undefined);

    // Seed a known audit with a spread of findings for the read endpoints.
    seededId = await createAudit('https://seeded.test');
    created.add(seededId);
    await seedFindings(seededId, [
      { ruleId: 'meta.title.missing', severity: 'high', url: 'https://seeded.test/a' },
      { ruleId: 'meta.title.missing', severity: 'high', url: 'https://seeded.test/b' },
      { ruleId: 'meta.h1.missing', severity: 'medium', url: 'https://seeded.test/a' },
      { ruleId: 'link.broken.internal', severity: 'critical', url: 'https://seeded.test/c' },
      { ruleId: 'perf.lcp', severity: 'low', url: null },
    ]);
  });

  afterAll(async () => {
    runSpy?.mockRestore();
    for (const id of created) {
      await cleanupAudit(id);
    }
    await app.close();
    await closePool();
  });

  describe('POST /audits', () => {
    it('returns 202 with { id, status: created } and inserts the row (no network)', async () => {
      const res = await http.post('/audits').send({ url: 'https://example.com' }).expect(202);

      expect(res.body).toMatchObject({ status: 'created' });
      expect(typeof res.body.id).toBe('string');
      created.add(res.body.id);

      expect(runSpy).toHaveBeenCalledWith(res.body.id);

      // The row is immediately queryable via the detail endpoint.
      const detail = await http.get(`/audits/${res.body.id}`).expect(200);
      expect(detail.body.id).toBe(res.body.id);
      expect(detail.body.startUrl).toBe('https://example.com/');
    });

    it('returns 400 for an invalid URL (AppErrorFilter maps InvalidArgumentError)', async () => {
      await http.post('/audits').send({ url: 'not-a-url' }).expect(400);
    });

    it('returns 400 for an empty body (ZodValidationPipe)', async () => {
      await http.post('/audits').send({}).expect(400);
    });
  });

  describe('GET /audits', () => {
    it('returns 200 with a paginated envelope including the seeded audit', async () => {
      const res = await http.get('/audits').query({ limit: 200, offset: 0 }).expect(200);

      expect(Array.isArray(res.body.items)).toBe(true);
      expect(typeof res.body.total).toBe('number');
      expect(res.body.limit).toBe(200);
      expect(res.body.offset).toBe(0);

      const ids = res.body.items.map((a: { id: string }) => a.id);
      expect(ids).toContain(seededId);
    });
  });

  describe('GET /audits/:id', () => {
    it('returns 200 with findingsTotal and a fully-keyed bySeverity rollup', async () => {
      const res = await http.get(`/audits/${seededId}`).expect(200);

      expect(res.body.id).toBe(seededId);
      expect(res.body.findingsTotal).toBe(5);
      expect(Object.keys(res.body.bySeverity).sort()).toEqual(
        ['critical', 'high', 'info', 'low', 'medium'].sort(),
      );
      expect(res.body.bySeverity.high).toBe(2);
      expect(res.body.bySeverity.critical).toBe(1);
    });

    it('returns 404 for an unknown audit id', async () => {
      await http.get(`/audits/${randomUUID()}`).expect(404);
    });
  });

  describe('GET /audits/:id/findings', () => {
    it('returns 200 with severity-filtered items and pagination fields', async () => {
      const res = await http
        .get(`/audits/${seededId}/findings`)
        .query({ severity: 'high' })
        .expect(200);

      expect(res.body.total).toBe(2);
      expect(res.body.items).toHaveLength(2);
      for (const f of res.body.items) {
        expect(f.severity).toBe('high');
      }
      expect(res.body.limit).toBe(50);
      expect(res.body.offset).toBe(0);
    });

    it('returns 404 for findings of an unknown audit', async () => {
      await http.get(`/audits/${randomUUID()}/findings`).expect(404);
    });
  });

  describe('GET /audits/:id/report', () => {
    it('returns 409 when the audit has no report generated yet', async () => {
      await http.get(`/audits/${seededId}/report`).expect(409);
    });

    it('returns 404 for the report of an unknown audit', async () => {
      await http.get(`/audits/${randomUUID()}/report`).expect(404);
    });
  });
});
