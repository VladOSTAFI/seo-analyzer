import { InvalidArgumentError } from '../common/errors';
import type { Database } from '../db/db.types';
import type { AuditRepository } from '../audit/audit.repository';
import type { LinkVerifierService } from './link-verifier';
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

/** Default verify result: the pass ran but found nothing to clear. */
const DEFAULT_VERIFY = {
  linksVerified: 0,
  falsePositivesCleared: 0,
  verifyInconclusive: 0,
};

const DEFAULT_EXTERNAL_PROBE = { externalsVerified: 0, truncated: false };
const DEFAULT_IMAGE_PROBE = { imagesVerified: 0, truncated: false };

function makeDeps(
  opts: {
    pageCount?: number;
    counts?: CannedCounts;
    verify?: typeof DEFAULT_VERIFY;
    externalProbe?: typeof DEFAULT_EXTERNAL_PROBE;
    imageProbe?: typeof DEFAULT_IMAGE_PROBE;
  } = {},
) {
  const pageCount = opts.pageCount ?? 5;
  const counts = opts.counts ?? DEFAULT_COUNTS;
  const verify = opts.verify ?? DEFAULT_VERIFY;
  const externalProbe = opts.externalProbe ?? DEFAULT_EXTERNAL_PROBE;
  const imageProbe = opts.imageProbe ?? DEFAULT_IMAGE_PROBE;

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

  // Top-level db.execute serves the pages-count guard AND, post-verification,
  // the recomputed broken-links count. Both are single-`n` count SELECTs.
  const dbExecute = jest.fn().mockResolvedValue(countResult(pageCount));
  const db = { execute: dbExecute, transaction } as unknown as Database;

  const auditRepo = {
    assertExists: jest.fn().mockResolvedValue({ id: AUDIT_ID, startUrl: 'https://example.com/' }),
    setStatus: jest.fn().mockResolvedValue(undefined),
    markFailed: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<AuditRepository>;

  const linkVerifier = {
    verifyBrokenLinks: jest.fn().mockResolvedValue(verify),
    probeExternalLinks: jest.fn().mockResolvedValue(externalProbe),
    probeImages: jest.fn().mockResolvedValue(imageProbe),
  } as unknown as jest.Mocked<LinkVerifierService>;

  return { db, dbExecute, tx, txExecute, transaction, auditRepo, linkVerifier, counts };
}

describe('EnrichService.enrich', () => {
  it('asserts existence then sets status to enriching before any work', async () => {
    const { db, auditRepo, linkVerifier } = makeDeps();
    const service = new EnrichService(db, auditRepo, linkVerifier);

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
    const { db, auditRepo, transaction, linkVerifier } = makeDeps({ pageCount: 0 });
    const service = new EnrichService(db, auditRepo, linkVerifier);

    await expect(service.enrich(AUDIT_ID)).rejects.toBeInstanceOf(InvalidArgumentError);
    await expect(service.enrich(AUDIT_ID)).rejects.toThrow(/audit:crawl/);

    expect(auditRepo.setStatus).not.toHaveBeenCalled();
    expect(auditRepo.markFailed).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
    expect(linkVerifier.verifyBrokenLinks).not.toHaveBeenCalled();
    expect(linkVerifier.probeExternalLinks).not.toHaveBeenCalled();
    expect(linkVerifier.probeImages).not.toHaveBeenCalled();
  });

  it('runs all enrichment work inside a single transaction', async () => {
    const { db, auditRepo, transaction, linkVerifier } = makeDeps();
    const service = new EnrichService(db, auditRepo, linkVerifier);

    await service.enrich(AUDIT_ID);

    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it('runs the live verification pass AFTER the transaction commits', async () => {
    const { db, auditRepo, transaction, linkVerifier } = makeDeps();
    const service = new EnrichService(db, auditRepo, linkVerifier);

    await service.enrich(AUDIT_ID);

    expect(linkVerifier.verifyBrokenLinks).toHaveBeenCalledWith(AUDIT_ID);
    const txOrder = transaction.mock.invocationCallOrder[0];
    const verifyOrder = (linkVerifier.verifyBrokenLinks as jest.Mock).mock.invocationCallOrder[0];
    expect(txOrder).toBeLessThan(verifyOrder);
  });

  it('runs the external probe pass AFTER the transaction commits', async () => {
    const { db, auditRepo, transaction, linkVerifier } = makeDeps();
    const service = new EnrichService(db, auditRepo, linkVerifier);

    await service.enrich(AUDIT_ID);

    expect(linkVerifier.probeExternalLinks).toHaveBeenCalledWith(AUDIT_ID);
    const txOrder = transaction.mock.invocationCallOrder[0];
    const probeOrder = (linkVerifier.probeExternalLinks as jest.Mock).mock.invocationCallOrder[0];
    expect(txOrder).toBeLessThan(probeOrder);
  });

  it('runs the image probe pass AFTER the transaction commits', async () => {
    const { db, auditRepo, transaction, linkVerifier } = makeDeps();
    const service = new EnrichService(db, auditRepo, linkVerifier);

    await service.enrich(AUDIT_ID);

    expect(linkVerifier.probeImages).toHaveBeenCalledWith(AUDIT_ID);
    const txOrder = transaction.mock.invocationCallOrder[0];
    const probeOrder = (linkVerifier.probeImages as jest.Mock).mock.invocationCallOrder[0];
    expect(txOrder).toBeLessThan(probeOrder);
  });

  it('marks the audit failed at stage "enrich" and rethrows on a txn error', async () => {
    const { db, auditRepo, transaction, linkVerifier } = makeDeps();
    const boom = new Error('boom');
    // Force the transaction body to throw.
    transaction.mockImplementationOnce(async () => {
      throw boom;
    });
    const service = new EnrichService(db, auditRepo, linkVerifier);

    await expect(service.enrich(AUDIT_ID)).rejects.toBe(boom);
    expect(auditRepo.markFailed).toHaveBeenCalledWith(AUDIT_ID, 'enrich');
  });

  it('returns an EnrichSummary assembled from the canned counts (zero verify + probe by default)', async () => {
    const { db, auditRepo, counts, linkVerifier } = makeDeps();
    const service = new EnrichService(db, auditRepo, linkVerifier);

    const summary = await service.enrich(AUDIT_ID);

    expect(summary).toEqual({
      ...counts,
      ...DEFAULT_VERIFY,
      externalsVerified: 0,
      externalsTruncated: false,
      imagesVerified: 0,
      imagesTruncated: false,
    });
  });

  it('folds the verification counts into the summary and recomputes broken when false positives cleared', async () => {
    const verify = { linksVerified: 4, falsePositivesCleared: 3, verifyInconclusive: 1 };
    const { db, dbExecute, auditRepo, counts, linkVerifier } = makeDeps({ verify });
    // The pages-count guard returns 5; the post-verification broken recount
    // returns 1 (down from the in-txn count of 2 after clearing 3 positives —
    // numbers here are illustrative, the recount is authoritative).
    dbExecute.mockResolvedValueOnce(countResult(5)).mockResolvedValueOnce(countResult(1));
    const service = new EnrichService(db, auditRepo, linkVerifier);

    const summary = await service.enrich(AUDIT_ID);

    expect(summary.linksVerified).toBe(4);
    expect(summary.falsePositivesCleared).toBe(3);
    expect(summary.verifyInconclusive).toBe(1);
    // brokenLinks reflects the post-verification recount, not the in-txn count.
    expect(summary.brokenLinks).toBe(1);
    expect(summary.brokenLinks).not.toBe(counts.brokenLinks);
  });

  it('does NOT recompute broken when no false positives were cleared', async () => {
    const verify = { linksVerified: 2, falsePositivesCleared: 0, verifyInconclusive: 2 };
    const { db, dbExecute, auditRepo, counts, linkVerifier } = makeDeps({ verify });
    const service = new EnrichService(db, auditRepo, linkVerifier);

    const summary = await service.enrich(AUDIT_ID);

    // Only the pages-count guard hit db.execute — no recount SELECT.
    expect(dbExecute).toHaveBeenCalledTimes(1);
    expect(summary.brokenLinks).toBe(counts.brokenLinks);
  });

  it('leaves status at enriching on success (no failed/extra transition)', async () => {
    const { db, auditRepo, linkVerifier } = makeDeps();
    const service = new EnrichService(db, auditRepo, linkVerifier);

    await service.enrich(AUDIT_ID);

    expect(auditRepo.setStatus).toHaveBeenCalledTimes(1);
    expect(auditRepo.setStatus).toHaveBeenCalledWith(AUDIT_ID, 'enriching');
    expect(auditRepo.markFailed).not.toHaveBeenCalled();
  });

  it('folds external probe counts into the summary', async () => {
    const externalProbe = { externalsVerified: 15, truncated: true };
    const { db, auditRepo, linkVerifier } = makeDeps({ externalProbe });
    const service = new EnrichService(db, auditRepo, linkVerifier);

    const summary = await service.enrich(AUDIT_ID);

    expect(summary.externalsVerified).toBe(15);
    expect(summary.externalsTruncated).toBe(true);
  });

  it('folds image probe counts into the summary', async () => {
    const imageProbe = { imagesVerified: 8, truncated: false };
    const { db, auditRepo, linkVerifier } = makeDeps({ imageProbe });
    const service = new EnrichService(db, auditRepo, linkVerifier);

    const summary = await service.enrich(AUDIT_ID);

    expect(summary.imagesVerified).toBe(8);
    expect(summary.imagesTruncated).toBe(false);
  });

  it('external probe failure does not fail enrich (best-effort contract)', async () => {
    const { db, auditRepo, linkVerifier } = makeDeps();
    // probeExternalLinks resolves (not rejects) even on error — that is the
    // contract of the best-effort wrapper inside LinkVerifierService. Simulate
    // the wrapper already having caught and swallowed an internal error:
    (linkVerifier.probeExternalLinks as jest.Mock).mockResolvedValueOnce({
      externalsVerified: 0,
      truncated: false,
    });
    const service = new EnrichService(db, auditRepo, linkVerifier);

    // Must not throw.
    await expect(service.enrich(AUDIT_ID)).resolves.toBeDefined();
    expect(auditRepo.markFailed).not.toHaveBeenCalled();
  });

  it('image probe failure does not fail enrich (best-effort contract)', async () => {
    const { db, auditRepo, linkVerifier } = makeDeps();
    (linkVerifier.probeImages as jest.Mock).mockResolvedValueOnce({
      imagesVerified: 0,
      truncated: false,
    });
    const service = new EnrichService(db, auditRepo, linkVerifier);

    await expect(service.enrich(AUDIT_ID)).resolves.toBeDefined();
    expect(auditRepo.markFailed).not.toHaveBeenCalled();
  });
});
