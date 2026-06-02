import { InvalidArgumentError } from '../common/errors';
import type { Database } from '../db/db.types';
import type { AuditRepository } from '../audit/audit.repository';
import { EnrichService } from './enrich.service';

const AUDIT_ID = '11111111-2222-3333-4444-555555555555';

/** Build a node-postgres-shaped result wrapping a single `n` count. */
function countResult(n: number): { rows: Record<string, unknown>[] } {
  return { rows: [{ n }] };
}

/**
 * The leading SQL keyword of a drizzle `sql` query, lowercased. The first chunk
 * is a `{ value: ['<sql text>'] }` object, so we read the first token of that
 * text. This lets the test tell the summary SELECTs apart from the enrichment
 * UPDATEs (some UPDATEs embed a correlated `count(*)`, so anchoring on the first
 * keyword — `select` vs `update` — is the reliable discriminator).
 */
function leadingKeyword(query: { queryChunks?: unknown }): string {
  const chunks = query.queryChunks as { value?: string[] }[] | undefined;
  const firstText = chunks?.[0]?.value?.[0] ?? '';
  const match = firstText.trim().match(/^[a-z]+/i);
  return (match?.[0] ?? '').toLowerCase();
}

/**
 * Canned counts the summary SELECTs return, in the order `collectSummary`
 * issues them. The guard pages-count is handled separately on `db.execute`.
 */
interface CannedCounts {
  linksResolved: number;
  redirectLinks: number;
  brokenLinks: number;
  pagesWithInlinks: number;
  imagesResolved: number;
  hreflangReciprocal: number;
  redirectChainPages: number;
  redirectLoopPages: number;
}

const DEFAULT_COUNTS: CannedCounts = {
  linksResolved: 12,
  redirectLinks: 3,
  brokenLinks: 2,
  pagesWithInlinks: 7,
  imagesResolved: 1,
  hreflangReciprocal: 4,
  redirectChainPages: 2,
  redirectLoopPages: 1,
};

function makeDeps(opts: { pageCount?: number; counts?: CannedCounts } = {}) {
  const pageCount = opts.pageCount ?? 5;
  const counts = opts.counts ?? DEFAULT_COUNTS;

  // The tx executor: UPDATEs resolve to an empty result; the eight summary
  // SELECTs (collectSummary) resolve to the canned counts in issue order. A
  // summary SELECT is identified by its leading `select` keyword.
  const summaryQueue = [
    counts.linksResolved,
    counts.redirectLinks,
    counts.brokenLinks,
    counts.pagesWithInlinks,
    counts.imagesResolved,
    counts.hreflangReciprocal,
    counts.redirectChainPages,
    counts.redirectLoopPages,
  ];
  let summaryIdx = 0;
  const txExecute = jest.fn(async (query: { queryChunks?: unknown }) => {
    if (leadingKeyword(query) === 'select') {
      return countResult(summaryQueue[summaryIdx++] ?? 0);
    }
    return { rows: [] };
  });
  const tx = { execute: txExecute };

  const transaction = jest.fn(async (cb: (t: typeof tx) => Promise<unknown>) => cb(tx));

  // Top-level db.execute serves only the pages-count guard.
  const dbExecute = jest.fn().mockResolvedValue(countResult(pageCount));
  const db = { execute: dbExecute, transaction } as unknown as Database;

  const auditRepo = {
    assertExists: jest.fn().mockResolvedValue({ id: AUDIT_ID, startUrl: 'https://example.com/' }),
    setStatus: jest.fn().mockResolvedValue(undefined),
    markFailed: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<AuditRepository>;

  return { db, dbExecute, tx, txExecute, transaction, auditRepo, counts };
}

describe('EnrichService.enrich', () => {
  it('asserts existence then sets status to enriching before any work', async () => {
    const { db, auditRepo } = makeDeps();
    const service = new EnrichService(db, auditRepo);

    await service.enrich(AUDIT_ID);

    expect(auditRepo.assertExists).toHaveBeenCalledWith(AUDIT_ID);
    expect(auditRepo.setStatus).toHaveBeenCalledWith(AUDIT_ID, 'enriching');
    // assertExists runs before setStatus.
    const assertOrder = auditRepo.assertExists.mock.invocationCallOrder[0];
    const setStatusOrder = auditRepo.setStatus.mock.invocationCallOrder[0];
    expect(assertOrder).toBeLessThan(setStatusOrder);
    expect(auditRepo.markFailed).not.toHaveBeenCalled();
  });

  it('throws InvalidArgumentError and does NOT setStatus when there are zero crawled pages', async () => {
    const { db, auditRepo, transaction } = makeDeps({ pageCount: 0 });
    const service = new EnrichService(db, auditRepo);

    await expect(service.enrich(AUDIT_ID)).rejects.toBeInstanceOf(InvalidArgumentError);
    await expect(service.enrich(AUDIT_ID)).rejects.toThrow(/audit:crawl/);

    expect(auditRepo.setStatus).not.toHaveBeenCalled();
    expect(auditRepo.markFailed).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it('runs all enrichment work inside a single transaction', async () => {
    const { db, auditRepo, transaction } = makeDeps();
    const service = new EnrichService(db, auditRepo);

    await service.enrich(AUDIT_ID);

    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it('marks the audit failed at stage "enrich" and rethrows on a txn error', async () => {
    const { db, auditRepo, transaction } = makeDeps();
    const boom = new Error('boom');
    // Force the transaction body to throw.
    transaction.mockImplementationOnce(async () => {
      throw boom;
    });
    const service = new EnrichService(db, auditRepo);

    await expect(service.enrich(AUDIT_ID)).rejects.toBe(boom);
    expect(auditRepo.markFailed).toHaveBeenCalledWith(AUDIT_ID, 'enrich');
  });

  it('returns an EnrichSummary assembled from the canned counts', async () => {
    const { db, auditRepo, counts } = makeDeps();
    const service = new EnrichService(db, auditRepo);

    const summary = await service.enrich(AUDIT_ID);

    expect(summary).toEqual(counts);
  });

  it('leaves status at enriching on success (no failed/extra transition)', async () => {
    const { db, auditRepo } = makeDeps();
    const service = new EnrichService(db, auditRepo);

    await service.enrich(AUDIT_ID);

    expect(auditRepo.setStatus).toHaveBeenCalledTimes(1);
    expect(auditRepo.setStatus).toHaveBeenCalledWith(AUDIT_ID, 'enriching');
    expect(auditRepo.markFailed).not.toHaveBeenCalled();
  });
});
