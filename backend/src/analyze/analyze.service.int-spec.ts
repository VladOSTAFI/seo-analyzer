import { eq } from 'drizzle-orm';
import { AuditRepository } from '../audit/audit.repository';
import type { Database } from '../db/db.types';
import { findings } from '../db/schema';
import { AnalyzeService } from './analyze.service';
import { RULES } from './rule.registry';
import {
  cleanupAudit,
  closePool,
  createAudit,
  getDb,
  seedPages,
} from '../../test/int/rule-harness';

/**
 * Example integration test proving the harness + engine wire end-to-end against
 * a live Postgres (run via `npm run test:int`). It seeds one page, runs the real
 * {@link AnalyzeService.analyze}, and asserts the engine ran all rules, the
 * delete-then-insert was idempotent, and a well-formed summary came back.
 *
 * With Wave-1 STUB rules every `run()` returns [], so we expect zero findings —
 * the value here is exercising the transaction/guard/summary plumbing, not rule
 * SQL. Wave 2's per-rule specs assert real findings via the same harness.
 */
describe('AnalyzeService (integration)', () => {
  const db = getDb() as unknown as Database;
  const service = new AnalyzeService(db, new AuditRepository(db));
  let auditId: string;

  afterAll(async () => {
    await closePool();
  });

  beforeEach(async () => {
    auditId = await createAudit();
    await seedPages(auditId, [{ url: 'https://example.test/' }]);
  });

  afterEach(async () => {
    await cleanupAudit(auditId);
  });

  it('runs every registered rule and returns a zero-filled summary', async () => {
    const summary = await service.analyze(auditId);

    expect(summary.rulesRun).toBe(RULES.length);
    expect(summary.rulesRun).toBe(31);
    expect(summary.failedRules).toEqual([]);
    expect(summary.totalFindings).toBe(0);
    expect(summary.bySeverity).toEqual({
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      info: 0,
    });
    expect(summary.byRule).toEqual({});
  });

  it('persists nothing for stub rules and is idempotent (delete-then-insert)', async () => {
    await service.analyze(auditId);
    await service.analyze(auditId); // re-run must not accumulate

    const rows = await getDb().select().from(findings).where(eq(findings.auditId, auditId));
    expect(rows).toHaveLength(0);
  });

  it('rejects an audit with no crawled pages', async () => {
    const emptyAuditId = await createAudit();
    try {
      await expect(service.analyze(emptyAuditId)).rejects.toThrow(/No crawled pages/);
    } finally {
      await cleanupAudit(emptyAuditId);
    }
  });
});
