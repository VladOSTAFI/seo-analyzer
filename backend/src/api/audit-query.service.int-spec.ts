import {
  cleanupAudit,
  closePool,
  createAudit,
  getDb,
  seedFindings,
} from '../../test/int/rule-harness';
import type { Database } from '../db/db.types';
import { AuditQueryService } from './audit-query.service';
import { DEFAULT_LIMIT } from './api.types';

/**
 * Integration tests for {@link AuditQueryService} against the live Postgres the
 * rule harness owns. The service only uses `db.execute`, so we construct it
 * directly on the harness Drizzle handle (bound to the same schema) rather than
 * booting a Nest module. Everything is scoped by a per-test `auditId` and torn
 * down in `afterEach`, so concurrent runs on the shared DB never collide.
 */
describe('AuditQueryService (int)', () => {
  let service: AuditQueryService;
  let auditId: string;

  beforeAll(() => {
    service = new AuditQueryService(getDb() as unknown as Database);
  });

  beforeEach(async () => {
    auditId = await createAudit();
  });

  afterEach(async () => {
    await cleanupAudit(auditId);
  });

  afterAll(async () => {
    await closePool();
  });

  describe('listAudits', () => {
    it('paginates, reports the full total, and orders newest-first', async () => {
      // Three extra audits created in sequence; combined with the beforeEach
      // audit there are at least four, so newest-first ordering is observable.
      const a = await createAudit('https://a.test');
      const b = await createAudit('https://b.test');
      const c = await createAudit('https://c.test');

      try {
        const firstPage = await service.listAudits({ limit: 2, offset: 0 });

        expect(firstPage.limit).toBe(2);
        expect(firstPage.offset).toBe(0);
        expect(firstPage.items).toHaveLength(2);
        // total counts ALL audits in the table, not just the page.
        expect(firstPage.total).toBeGreaterThanOrEqual(4);
        // Newest-first: c was inserted last, then b, then a.
        const ids = firstPage.items.map((i) => i.id);
        expect(ids[0]).toBe(c);
        expect(ids[1]).toBe(b);

        // ISO date strings, nullable columns null until set.
        const top = firstPage.items[0];
        expect(top.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
        expect(top.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
        expect(top.failedStage).toBeNull();
        expect(top.reportPath).toBeNull();
        expect(top.startUrl).toBe('https://c.test');

        // Offset advances the window: page 2 starts at the third-newest.
        const secondPage = await service.listAudits({ limit: 2, offset: 2 });
        expect(secondPage.offset).toBe(2);
        expect(secondPage.items.map((i) => i.id)).toContain(a);
        expect(secondPage.total).toBe(firstPage.total);
      } finally {
        await cleanupAudit(a);
        await cleanupAudit(b);
        await cleanupAudit(c);
      }
    });
  });

  describe('getAudit', () => {
    it('returns undefined for an id that does not exist', async () => {
      const result = await service.getAudit('00000000-0000-0000-0000-000000000000');
      expect(result).toBeUndefined();
    });

    it('zero-fills every severity and sums findingsTotal over the rollup', async () => {
      await seedFindings(auditId, [
        { ruleId: 'r.critical', severity: 'critical', url: 'https://t/1' },
        { ruleId: 'r.high.a', severity: 'high', url: 'https://t/2' },
        { ruleId: 'r.high.b', severity: 'high', url: 'https://t/3' },
        { ruleId: 'r.low', severity: 'low', url: null },
      ]);

      const result = await service.getAudit(auditId);

      expect(result).toBeDefined();
      expect(result?.id).toBe(auditId);
      expect(result?.findingsTotal).toBe(4);
      // Every severity key present; absent severities zero-filled.
      expect(result?.bySeverity).toEqual({
        critical: 1,
        high: 2,
        medium: 0,
        low: 1,
        info: 0,
      });
    });

    it('returns an all-zero rollup for an audit with no findings', async () => {
      const result = await service.getAudit(auditId);

      expect(result?.findingsTotal).toBe(0);
      expect(result?.bySeverity).toEqual({
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
        info: 0,
      });
    });
  });

  describe('auditExists', () => {
    it('is true for a seeded audit and false for a random uuid', async () => {
      await expect(service.auditExists(auditId)).resolves.toBe(true);
      await expect(service.auditExists('11111111-1111-1111-1111-111111111111')).resolves.toBe(
        false,
      );
    });
  });

  describe('listFindings', () => {
    beforeEach(async () => {
      await seedFindings(auditId, [
        { ruleId: 'rule.b', severity: 'high', url: 'https://t/b1' },
        { ruleId: 'rule.b', severity: 'high', url: 'https://t/b2' },
        { ruleId: 'rule.a', severity: 'critical', url: 'https://t/a1' },
        { ruleId: 'rule.c', severity: 'low', url: null },
        { ruleId: 'rule.c', severity: 'low', url: 'https://t/c1' },
      ]);
    });

    it('orders by severity rank then rule_id then url (nulls last)', async () => {
      const result = await service.listFindings(auditId, {
        limit: DEFAULT_LIMIT,
        offset: 0,
      });

      expect(result.total).toBe(5);
      expect(result.items).toHaveLength(5);
      // critical first, then both highs, then the lows.
      expect(result.items.map((f) => f.severity)).toEqual([
        'critical',
        'high',
        'high',
        'low',
        'low',
      ]);
      // Within the two lows: a real url sorts before NULL (nulls last).
      const lows = result.items.filter((f) => f.severity === 'low');
      expect(lows[0].url).toBe('https://t/c1');
      expect(lows[1].url).toBeNull();

      // detail defaults to {} and createdAt is an ISO string.
      expect(result.items[0].detail).toEqual({});
      expect(result.items[0].createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('filters by severity and reflects the filter in total', async () => {
      const result = await service.listFindings(auditId, {
        limit: DEFAULT_LIMIT,
        offset: 0,
        severity: 'high',
      });

      expect(result.total).toBe(2);
      expect(result.items).toHaveLength(2);
      expect(result.items.every((f) => f.severity === 'high')).toBe(true);
    });

    it('filters by ruleId and reflects the filter in total', async () => {
      const result = await service.listFindings(auditId, {
        limit: DEFAULT_LIMIT,
        offset: 0,
        ruleId: 'rule.c',
      });

      expect(result.total).toBe(2);
      expect(result.items).toHaveLength(2);
      expect(result.items.every((f) => f.ruleId === 'rule.c')).toBe(true);
    });

    it('paginates while total stays the unpaged (filtered) count', async () => {
      const page1 = await service.listFindings(auditId, { limit: 2, offset: 0 });
      const page2 = await service.listFindings(auditId, { limit: 2, offset: 2 });

      expect(page1.total).toBe(5);
      expect(page2.total).toBe(5);
      expect(page1.items).toHaveLength(2);
      expect(page2.items).toHaveLength(2);
      // No overlap between consecutive pages.
      const overlap = page1.items
        .map((f) => f.id)
        .filter((id) => page2.items.some((f) => f.id === id));
      expect(overlap).toHaveLength(0);
    });
  });
});
