import { InvalidArgumentError } from '../common/errors';
import type { Database } from '../db/db.types';
import type { AuditRepository } from '../audit/audit.repository';
import type { Env } from '../config/env.validation';
import type { PsiClient, PsiMetrics, PsiStrategy } from './psi.types';
import { PerformanceService, deriveTemplateKey, selectSamples } from './performance.service';
import type { SampleCandidate } from './performance.types';

const AUDIT_ID = '11111111-2222-3333-4444-555555555555';

/** Build a node-postgres-shaped result wrapping a single `n` count. */
function countResult(n: number): { rows: Record<string, unknown>[] } {
  return { rows: [{ n }] };
}

/** Canned PSI metrics — deterministic so persistence mapping is assertable. */
function metrics(over: Partial<PsiMetrics> = {}): PsiMetrics {
  return {
    lcpMs: 4000,
    cls: 0.05,
    inpMs: 180,
    performanceScore: 55,
    fcpMs: 1800,
    tbtMs: 250,
    speedIndexMs: 3000,
    usabilityFlags: ['unsized-images'],
    raw: { ok: true },
    ...over,
  };
}

interface MockDeps {
  /** Page-count returned by the guard `select count(*)` on db.execute. */
  pageCount?: number;
  /** Rows returned by the candidate-sampling `select ... from pages` on db.execute. */
  candidates?: SampleCandidate[];
  /** Existing (pageUrl, strategy) pairs returned by db.select().from(performance). */
  existing?: { pageUrl: string; strategy: PsiStrategy }[];
  /** PSI_MAX_SAMPLES. */
  cap?: number;
  /** Optional custom psi.fetch implementation. */
  psiFetch?: jest.Mock;
}

function makeDeps(opts: MockDeps = {}) {
  const pageCount = opts.pageCount ?? 5;
  const candidates = opts.candidates ?? [];
  const existing = opts.existing ?? [];
  const cap = opts.cap ?? 20;

  // db.execute serves the guard count first, then the candidate sampling SELECT.
  const dbExecute = jest.fn(async (query: { queryChunks?: unknown }) => {
    const chunks = query.queryChunks as { value?: string[] }[] | undefined;
    const firstText = (chunks?.[0]?.value?.[0] ?? '').toLowerCase();
    if (firstText.includes('count(*)')) return countResult(pageCount);
    // candidate-sampling SELECT
    return {
      rows: candidates.map((c) => ({
        url: c.url,
        inlink_count: c.inlinkCount,
        depth: c.depth,
      })),
    };
  });

  // db.select().from(performance).where() → existing pairs.
  const where = jest.fn().mockResolvedValue(existing);
  const from = jest.fn().mockReturnValue({ where });
  const dbSelect = jest.fn().mockReturnValue({ from });

  // db.insert(performance).values().onConflictDoUpdate()
  const onConflictDoUpdate = jest.fn().mockResolvedValue(undefined);
  const insertValues = jest.fn().mockReturnValue({ onConflictDoUpdate });
  const dbInsert = jest.fn().mockReturnValue({ values: insertValues });

  // tx used inside db.transaction(cb): delete().where(); insert().values().
  const txDeleteWhere = jest.fn().mockResolvedValue(undefined);
  const txDelete = jest.fn().mockReturnValue({ where: txDeleteWhere });
  const txInsertValues = jest.fn().mockResolvedValue(undefined);
  const txInsert = jest.fn().mockReturnValue({ values: txInsertValues });
  const txExecute = jest.fn().mockResolvedValue({ rows: [] });
  const tx = { delete: txDelete, insert: txInsert, execute: txExecute };
  const transaction = jest.fn(async (cb: (t: typeof tx) => Promise<unknown>) => cb(tx));

  const db = {
    execute: dbExecute,
    select: dbSelect,
    insert: dbInsert,
    transaction,
  } as unknown as Database;

  const auditRepo = {
    assertExists: jest.fn().mockResolvedValue({ id: AUDIT_ID, startUrl: 'https://example.com/' }),
    setStatus: jest.fn().mockResolvedValue(undefined),
    markFailed: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<AuditRepository>;

  const psiFetch = opts.psiFetch ?? (jest.fn(async () => metrics()) as unknown as jest.Mock);
  const psi: PsiClient = { fetch: psiFetch as PsiClient['fetch'] };

  const env = { PSI_MAX_SAMPLES: cap } as unknown as Env;

  return {
    db,
    dbExecute,
    insertValues,
    transaction,
    txDeleteWhere,
    auditRepo,
    psi,
    psiFetch,
    env,
  };
}

function service(deps: ReturnType<typeof makeDeps>): PerformanceService {
  return new PerformanceService(deps.db, deps.auditRepo, deps.psi, deps.env);
}

describe('deriveTemplateKey (pure)', () => {
  it('collapses numeric id segments to :id', () => {
    expect(deriveTemplateKey('https://x.test/product/42')).toBe('/product/:id');
    expect(deriveTemplateKey('https://x.test/product/99?ref=1')).toBe('/product/:id');
  });

  it('collapses uuid and long-hex segments to :id', () => {
    expect(deriveTemplateKey('https://x.test/u/123e4567-e89b-12d3-a456-426614174000')).toBe(
      '/u/:id',
    );
    expect(deriveTemplateKey('https://x.test/asset/deadbeefcafe')).toBe('/asset/:id');
  });

  it('leaves slug segments intact and normalizes root', () => {
    expect(deriveTemplateKey('https://x.test/blog/hello-world')).toBe('/blog/hello-world');
    expect(deriveTemplateKey('https://x.test/')).toBe('/');
  });
});

describe('selectSamples (pure)', () => {
  it('dedupes id-variant urls into one representative per template', () => {
    const candidates: SampleCandidate[] = [
      { url: 'https://x.test/product/1', inlinkCount: 3, depth: 2 },
      { url: 'https://x.test/product/2', inlinkCount: 9, depth: 2 },
      { url: 'https://x.test/product/3', inlinkCount: 1, depth: 2 },
      { url: 'https://x.test/about', inlinkCount: 5, depth: 1 },
      { url: 'https://x.test/', inlinkCount: 50, depth: 0 },
    ];
    const samples = selectSamples(candidates, 20);

    // Three distinct templates: /product/:id, /about, /
    expect(samples).toHaveLength(3);
    const byKey = Object.fromEntries(samples.map((s) => [s.templateKey, s.url]));
    // Representative of /product/:id is the highest-inlink member (product/2).
    expect(byKey['/product/:id']).toBe('https://x.test/product/2');
    expect(byKey['/about']).toBe('https://x.test/about');
    expect(byKey['/']).toBe('https://x.test/');
  });

  it('caps at the sample limit favouring the most common templates', () => {
    const candidates: SampleCandidate[] = [
      // /product/:id has 3 members → most common.
      { url: 'https://x.test/product/1', inlinkCount: 1, depth: 2 },
      { url: 'https://x.test/product/2', inlinkCount: 1, depth: 2 },
      { url: 'https://x.test/product/3', inlinkCount: 1, depth: 2 },
      // /blog/:id has 2 members.
      { url: 'https://x.test/blog/1', inlinkCount: 1, depth: 2 },
      { url: 'https://x.test/blog/2', inlinkCount: 1, depth: 2 },
      // /about has 1 member.
      { url: 'https://x.test/about', inlinkCount: 1, depth: 1 },
    ];
    const samples = selectSamples(candidates, 2);

    expect(samples).toHaveLength(2);
    const keys = samples.map((s) => s.templateKey);
    expect(keys).toContain('/product/:id'); // biggest cluster always kept
    expect(keys).toContain('/blog/:id'); // second-biggest kept
    expect(keys).not.toContain('/about'); // smallest dropped by cap
  });

  it('tie-breaks representative by depth then url', () => {
    const candidates: SampleCandidate[] = [
      { url: 'https://x.test/p/2', inlinkCount: 4, depth: 3 },
      { url: 'https://x.test/p/1', inlinkCount: 4, depth: 1 }, // same inlinks, shallower → wins
      { url: 'https://x.test/p/3', inlinkCount: 4, depth: 3 },
    ];
    const [sample] = selectSamples(candidates, 20);
    expect(sample.url).toBe('https://x.test/p/1');
  });
});

describe('PerformanceService.run', () => {
  it('asserts existence and rejects an audit with zero crawled pages (guard, no markFailed)', async () => {
    const deps = makeDeps({ pageCount: 0 });
    const svc = service(deps);

    await expect(svc.run(AUDIT_ID)).rejects.toBeInstanceOf(InvalidArgumentError);
    await expect(svc.run(AUDIT_ID)).rejects.toThrow(/audit:crawl/);
    expect(deps.auditRepo.assertExists).toHaveBeenCalledWith(AUDIT_ID);
    // The guard sits OUTSIDE the run() try (mirrors analyze.service): a guard
    // rejection is a user/input error, not a stage failure, so the audit is NOT
    // marked failed and no PSI work happens.
    expect(deps.auditRepo.markFailed).not.toHaveBeenCalled();
    expect(deps.psiFetch).not.toHaveBeenCalled();
  });

  it('samples (caps + dedupes by template key) and fetches both strategies', async () => {
    const deps = makeDeps({
      cap: 1,
      candidates: [
        { url: 'https://x.test/product/1', inlinkCount: 2, depth: 2 },
        { url: 'https://x.test/product/2', inlinkCount: 9, depth: 2 },
        { url: 'https://x.test/product/3', inlinkCount: 1, depth: 2 },
        { url: 'https://x.test/about', inlinkCount: 1, depth: 1 },
      ],
    });
    const svc = service(deps);

    const summary = await svc.run(AUDIT_ID);

    // cap=1 + biggest cluster (/product/:id) → 1 sampled url, 2 strategies fetched.
    expect(summary.sampled).toBe(1);
    expect(summary.fetched).toBe(2);
    expect(summary.cached).toBe(0);
    expect(summary.failed).toBe(0);
    // Both fetches target the cluster representative (product/2 — highest inlinks).
    expect(deps.psiFetch).toHaveBeenCalledTimes(2);
    expect(deps.psiFetch).toHaveBeenCalledWith('https://x.test/product/2', 'mobile');
    expect(deps.psiFetch).toHaveBeenCalledWith('https://x.test/product/2', 'desktop');
  });

  it('skips cached (url,strategy) pairs and counts them as cached', async () => {
    const deps = makeDeps({
      candidates: [{ url: 'https://x.test/about', inlinkCount: 1, depth: 1 }],
      // mobile already cached; desktop missing.
      existing: [{ pageUrl: 'https://x.test/about', strategy: 'mobile' }],
    });
    const svc = service(deps);

    const summary = await svc.run(AUDIT_ID);

    expect(summary.sampled).toBe(1);
    expect(summary.cached).toBe(1);
    expect(summary.fetched).toBe(1);
    // PSI called ONLY for the uncached desktop pair.
    expect(deps.psiFetch).toHaveBeenCalledTimes(1);
    expect(deps.psiFetch).toHaveBeenCalledWith('https://x.test/about', 'desktop');
    expect(deps.psiFetch).not.toHaveBeenCalledWith('https://x.test/about', 'mobile');
  });

  it('counts a PSI fetch rejection as failed and does not abort the run', async () => {
    const psiFetch = jest
      .fn()
      .mockRejectedValueOnce(new Error('429 quota')) // mobile fails
      .mockResolvedValueOnce(metrics()); // desktop succeeds
    const deps = makeDeps({
      candidates: [{ url: 'https://x.test/about', inlinkCount: 1, depth: 1 }],
      psiFetch,
    });
    const svc = service(deps);

    const summary = await svc.run(AUDIT_ID);

    expect(summary.failed).toBe(1);
    expect(summary.fetched).toBe(1);
    expect(psiFetch).toHaveBeenCalledTimes(2);
    // The run still completed and produced a summary (no throw).
    expect(deps.auditRepo.markFailed).not.toHaveBeenCalled();
  });

  it('returns a zero-filled bySeverity and zero findings for stub perf rules', async () => {
    const deps = makeDeps({
      candidates: [{ url: 'https://x.test/about', inlinkCount: 1, depth: 1 }],
    });
    const svc = service(deps);

    const summary = await svc.run(AUDIT_ID);

    expect(summary.findings).toBe(0);
    expect(summary.bySeverity).toEqual({
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      info: 0,
    });
  });

  it('marks the audit failed at stage "perf" and rethrows on a fatal DB error', async () => {
    const deps = makeDeps({
      candidates: [{ url: 'https://x.test/about', inlinkCount: 1, depth: 1 }],
    });
    const boom = new Error('connection reset');
    deps.transaction.mockImplementationOnce(async () => {
      throw boom;
    });
    const svc = service(deps);

    await expect(svc.run(AUDIT_ID)).rejects.toBe(boom);
    expect(deps.auditRepo.markFailed).toHaveBeenCalledWith(AUDIT_ID, 'perf');
  });

  it('does NOT advance audit status on success', async () => {
    const deps = makeDeps({
      candidates: [{ url: 'https://x.test/about', inlinkCount: 1, depth: 1 }],
    });
    const svc = service(deps);

    await svc.run(AUDIT_ID);

    expect(deps.auditRepo.setStatus).not.toHaveBeenCalled();
    expect(deps.auditRepo.markFailed).not.toHaveBeenCalled();
  });
});
