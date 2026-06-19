import type { Database } from '../db/db.types';
import type { Env } from '../config/env.validation';
import { LinkVerifierService } from './link-verifier';

const AUDIT_ID = '11111111-2222-3333-4444-555555555555';

/** node-postgres-shaped result wrapping rows. */
function rowsResult(rows: Record<string, unknown>[]): { rows: Record<string, unknown>[] } {
  return { rows };
}

/** Leading SQL keyword (lowercased) of a drizzle `sql` query. */
function leadingKeyword(query: { queryChunks?: unknown }): string {
  const chunks = query.queryChunks as { value?: string[] }[] | undefined;
  const firstText = chunks?.[0]?.value?.[0] ?? '';
  const match = firstText.trim().match(/^[a-z]+/i);
  return (match?.[0] ?? '').toLowerCase();
}

/** Full SQL text of a drizzle `sql` query, lowercased — for asserting set/clear. */
function sqlText(query: { queryChunks?: unknown }): string {
  const chunks = query.queryChunks as { value?: string[] }[] | undefined;
  return (chunks ?? [])
    .map((c) => c.value?.join(' ') ?? '')
    .join(' ')
    .toLowerCase();
}

function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    LINK_VERIFY_ENABLED: true,
    LINK_VERIFY_CONCURRENCY: 5,
    LINK_VERIFY_TIMEOUT_MS: 10000,
    LINK_VERIFY_RETRIES: 2,
    LINK_VERIFY_USER_AGENT: 'TestBrowser/1.0',
    LINK_VERIFY_MAX: 500,
    EXTERNAL_VERIFY_ENABLED: false,
    IMAGE_VERIFY_ENABLED: false,
    EXTERNAL_VERIFY_MAX: 200,
    EXTERNAL_VERIFY_PER_HOST: 20,
    ...overrides,
  } as unknown as Env;
}

/**
 * Build a verifier whose DB returns the given distinct broken hrefs from the
 * SELECT and records every UPDATE issued. `updates` captures the lowercased SQL
 * text of each UPDATE so tests can assert clear-vs-refresh behaviour.
 */
function makeVerifier(distinctHrefs: string[], env: Env = makeEnv()) {
  const updates: string[] = [];
  const execute = jest.fn(async (query: { queryChunks?: unknown }) => {
    if (leadingKeyword(query) === 'select') {
      return rowsResult(distinctHrefs.map((href) => ({ href })));
    }
    updates.push(sqlText(query));
    return rowsResult([]);
  });
  const db = { execute } as unknown as Database;
  const service = new LinkVerifierService(db, env);
  return { service, execute, updates };
}

/**
 * Build a verifier for the external/image probe passes.
 * The SELECT returns `rows` (may have `href` or `src` key depending on the pass).
 */
function makeProbeVerifier(selectRows: Record<string, string>[], env: Env = makeEnv()) {
  const updates: string[] = [];
  const execute = jest.fn(async (query: { queryChunks?: unknown }) => {
    if (leadingKeyword(query) === 'select') {
      return rowsResult(selectRows);
    }
    updates.push(sqlText(query));
    return rowsResult([]);
  });
  const db = { execute } as unknown as Database;
  const service = new LinkVerifierService(db, env);
  return { service, execute, updates };
}

/** A fetch mock returning a Response with the given status (body is a no-op stream). */
function okResponse(status: number): Response {
  return {
    status,
    body: { cancel: jest.fn().mockResolvedValue(undefined) },
  } as unknown as Response;
}

describe('LinkVerifierService.verifyBrokenLinks', () => {
  const realFetch = global.fetch;

  afterEach(() => {
    global.fetch = realFetch;
    jest.restoreAllMocks();
  });

  it('clears the flag for a link that now returns 200 (false positive)', async () => {
    global.fetch = jest.fn().mockResolvedValue(okResponse(200)) as unknown as typeof fetch;
    const { service, updates } = makeVerifier(['https://bestpet.com.ua/beaphar']);

    const result = await service.verifyBrokenLinks(AUDIT_ID);

    expect(result).toEqual({
      linksVerified: 1,
      falsePositivesCleared: 1,
      verifyInconclusive: 0,
    });
    // One UPDATE that clears the flag (is_broken = false).
    expect(updates).toHaveLength(1);
    expect(updates[0]).toContain('set is_broken = false');
  });

  it('keeps the flag (and refreshes status) for a link still returning 500', async () => {
    global.fetch = jest.fn().mockResolvedValue(okResponse(500)) as unknown as typeof fetch;
    const { service, updates } = makeVerifier(['https://example.com/down']);

    const result = await service.verifyBrokenLinks(AUDIT_ID);

    expect(result).toEqual({
      linksVerified: 1,
      falsePositivesCleared: 0,
      verifyInconclusive: 0,
    });
    // The single UPDATE only refreshes target_status_code — it must NOT clear.
    expect(updates).toHaveLength(1);
    expect(updates[0]).not.toContain('set is_broken = false');
    expect(updates[0]).toContain('target_status_code');
  });

  it('treats a fetch error/timeout as inconclusive and leaves the flag untouched (no UPDATE)', async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new Error('The operation timed out')) as unknown as typeof fetch;
    // retries=0 so the test does not wait on backoff.
    const { service, updates, execute } = makeVerifier(
      ['https://example.com/flaky'],
      makeEnv({ LINK_VERIFY_RETRIES: 0 }),
    );

    const result = await service.verifyBrokenLinks(AUDIT_ID);

    expect(result).toEqual({
      linksVerified: 1,
      falsePositivesCleared: 0,
      verifyInconclusive: 1,
    });
    // No UPDATE was issued — only the SELECT ran.
    expect(updates).toHaveLength(0);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('retries transient errors then succeeds (clears on the eventual 200)', async () => {
    const fetchMock = jest
      .fn()
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockResolvedValueOnce(okResponse(200));
    global.fetch = fetchMock as unknown as typeof fetch;
    const { service, updates } = makeVerifier(
      ['https://example.com/transient'],
      makeEnv({ LINK_VERIFY_RETRIES: 2 }),
    );

    const result = await service.verifyBrokenLinks(AUDIT_ID);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.falsePositivesCleared).toBe(1);
    expect(updates[0]).toContain('set is_broken = false');
  });

  it('skips the entire pass when LINK_VERIFY_ENABLED=false (no fetch, no DB)', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    const { service, execute } = makeVerifier(
      ['https://example.com/whatever'],
      makeEnv({ LINK_VERIFY_ENABLED: false }),
    );

    const result = await service.verifyBrokenLinks(AUDIT_ID);

    expect(result).toEqual({
      linksVerified: 0,
      falsePositivesCleared: 0,
      verifyInconclusive: 0,
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });

  it('deduplicates: a distinct target is fetched once and applied to all rows for that href', async () => {
    // The SELECT DISTINCT already collapses duplicates; the verifier fetches one
    // URL per distinct href. Two distinct hrefs ⇒ exactly two fetches.
    const fetchMock = jest.fn().mockResolvedValue(okResponse(200));
    global.fetch = fetchMock as unknown as typeof fetch;
    const { service } = makeVerifier(['https://a.example/x', 'https://b.example/y']);

    const result = await service.verifyBrokenLinks(AUDIT_ID);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.linksVerified).toBe(2);
    expect(result.falsePositivesCleared).toBe(2);
  });

  it('skips non-http(s) targets without fetching them', async () => {
    const fetchMock = jest.fn().mockResolvedValue(okResponse(200));
    global.fetch = fetchMock as unknown as typeof fetch;
    const { service } = makeVerifier(['mailto:hi@example.com', 'https://ok.example/page']);

    const result = await service.verifyBrokenLinks(AUDIT_ID);

    // Only the https target is fetched; the mailto: is skipped.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('https://ok.example/page', expect.anything());
    expect(result.linksVerified).toBe(1);
  });

  it('uses the configured browser User-Agent (NOT the crawl bot UA)', async () => {
    const fetchMock = jest.fn().mockResolvedValue(okResponse(200));
    global.fetch = fetchMock as unknown as typeof fetch;
    const { service } = makeVerifier(
      ['https://example.com/ua'],
      makeEnv({ LINK_VERIFY_USER_AGENT: 'Mozilla/5.0 RealBrowser' }),
    );

    await service.verifyBrokenLinks(AUDIT_ID);

    const [, init] = fetchMock.mock.calls[0];
    expect((init.headers as Record<string, string>)['User-Agent']).toBe('Mozilla/5.0 RealBrowser');
    expect((init.headers as Record<string, string>)['User-Agent']).not.toContain('SEO-Audit-Bot');
  });

  it('never throws even if the DB SELECT itself fails (best-effort contract)', async () => {
    const execute = jest.fn().mockRejectedValue(new Error('db gone'));
    const db = { execute } as unknown as Database;
    const service = new LinkVerifierService(db, makeEnv());

    await expect(service.verifyBrokenLinks(AUDIT_ID)).resolves.toEqual({
      linksVerified: 0,
      falsePositivesCleared: 0,
      verifyInconclusive: 0,
    });
  });
});

describe('LinkVerifierService.probeExternalLinks', () => {
  const realFetch = global.fetch;

  afterEach(() => {
    global.fetch = realFetch;
    jest.restoreAllMocks();
  });

  it('is disabled by default (EXTERNAL_VERIFY_ENABLED=false) — no fetch, no DB', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    const { service, execute } = makeProbeVerifier(
      [{ href: 'https://external.com/page' }],
      makeEnv({ EXTERNAL_VERIFY_ENABLED: false }),
    );

    const result = await service.probeExternalLinks(AUDIT_ID);

    expect(result).toEqual({ externalsVerified: 0, truncated: false });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });

  it('probes external hrefs and updates target_status_code + is_broken when enabled', async () => {
    const fetchMock = jest.fn().mockResolvedValue(okResponse(200));
    global.fetch = fetchMock as unknown as typeof fetch;
    const { service, updates } = makeProbeVerifier(
      [{ href: 'https://external.com/page' }],
      makeEnv({ EXTERNAL_VERIFY_ENABLED: true }),
    );

    const result = await service.probeExternalLinks(AUDIT_ID);

    expect(result.externalsVerified).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // The UPDATE must set target_status_code and is_broken.
    expect(updates).toHaveLength(1);
    expect(updates[0]).toContain('target_status_code');
    expect(updates[0]).toContain('is_broken');
  });

  it('marks is_broken=true when external returns 404', async () => {
    const fetchMock = jest.fn().mockResolvedValue(okResponse(404));
    global.fetch = fetchMock as unknown as typeof fetch;
    const { service, updates } = makeProbeVerifier(
      [{ href: 'https://gone.com/page' }],
      makeEnv({ EXTERNAL_VERIFY_ENABLED: true }),
    );

    await service.probeExternalLinks(AUDIT_ID);

    expect(updates).toHaveLength(1);
    expect(updates[0]).toContain('is_broken');
  });

  it('skips non-http(s) hrefs without fetching them', async () => {
    const fetchMock = jest.fn().mockResolvedValue(okResponse(200));
    global.fetch = fetchMock as unknown as typeof fetch;
    const { service } = makeProbeVerifier(
      [{ href: 'mailto:nobody@example.com' }, { href: 'https://ok.com/page' }],
      makeEnv({ EXTERNAL_VERIFY_ENABLED: true }),
    );

    const result = await service.probeExternalLinks(AUDIT_ID);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.externalsVerified).toBe(1);
  });

  it('enforces per-host budget (EXTERNAL_VERIFY_PER_HOST)', async () => {
    const fetchMock = jest.fn().mockResolvedValue(okResponse(200));
    global.fetch = fetchMock as unknown as typeof fetch;
    // Three URLs from the same host; per-host cap is 1.
    const hrefs = [
      { href: 'https://bighost.com/a' },
      { href: 'https://bighost.com/b' },
      { href: 'https://bighost.com/c' },
    ];
    const { service } = makeProbeVerifier(
      hrefs,
      makeEnv({
        EXTERNAL_VERIFY_ENABLED: true,
        EXTERNAL_VERIFY_PER_HOST: 1,
        EXTERNAL_VERIFY_MAX: 100,
      }),
    );

    const result = await service.probeExternalLinks(AUDIT_ID);

    // Only 1 from bighost.com should be probed.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.externalsVerified).toBe(1);
    expect(result.truncated).toBe(true);
  });

  it('enforces global cap (EXTERNAL_VERIFY_MAX)', async () => {
    const fetchMock = jest.fn().mockResolvedValue(okResponse(200));
    global.fetch = fetchMock as unknown as typeof fetch;
    // Five distinct hosts, global cap of 2.
    const hrefs = ['a', 'b', 'c', 'd', 'e'].map((h) => ({ href: `https://${h}.com/page` }));
    const { service } = makeProbeVerifier(
      hrefs,
      makeEnv({
        EXTERNAL_VERIFY_ENABLED: true,
        EXTERNAL_VERIFY_MAX: 2,
        EXTERNAL_VERIFY_PER_HOST: 10,
      }),
    );

    const result = await service.probeExternalLinks(AUDIT_ID);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.externalsVerified).toBe(2);
    expect(result.truncated).toBe(true);
  });

  it('never throws when the DB SELECT fails (best-effort contract)', async () => {
    const execute = jest.fn().mockRejectedValue(new Error('db error'));
    const db = { execute } as unknown as Database;
    const service = new LinkVerifierService(db, makeEnv({ EXTERNAL_VERIFY_ENABLED: true }));

    await expect(service.probeExternalLinks(AUDIT_ID)).resolves.toEqual({
      externalsVerified: 0,
      truncated: false,
    });
  });

  it('never throws when fetch fails (best-effort contract)', async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new Error('network error')) as unknown as typeof fetch;
    const { service } = makeProbeVerifier(
      [{ href: 'https://flaky.com/page' }],
      makeEnv({ EXTERNAL_VERIFY_ENABLED: true }),
    );

    // Should not throw.
    await expect(service.probeExternalLinks(AUDIT_ID)).resolves.toBeDefined();
  });
});

describe('LinkVerifierService.probeImages', () => {
  const realFetch = global.fetch;

  afterEach(() => {
    global.fetch = realFetch;
    jest.restoreAllMocks();
  });

  it('is disabled by default (IMAGE_VERIFY_ENABLED=false) — no fetch, no DB', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    const { service, execute } = makeProbeVerifier(
      [{ src: 'https://cdn.example.com/img.jpg' }],
      makeEnv({ IMAGE_VERIFY_ENABLED: false }),
    );

    const result = await service.probeImages(AUDIT_ID);

    expect(result).toEqual({ imagesVerified: 0, truncated: false });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });

  it('probes image srcs and updates status_code when enabled', async () => {
    const fetchMock = jest.fn().mockResolvedValue(okResponse(200));
    global.fetch = fetchMock as unknown as typeof fetch;
    const { service, updates } = makeProbeVerifier(
      [{ src: 'https://cdn.example.com/img.jpg' }],
      makeEnv({ IMAGE_VERIFY_ENABLED: true }),
    );

    const result = await service.probeImages(AUDIT_ID);

    expect(result.imagesVerified).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(updates).toHaveLength(1);
    expect(updates[0]).toContain('status_code');
  });

  it('enforces per-host budget for images', async () => {
    const fetchMock = jest.fn().mockResolvedValue(okResponse(200));
    global.fetch = fetchMock as unknown as typeof fetch;
    const srcs = [
      { src: 'https://cdn.example.com/img1.jpg' },
      { src: 'https://cdn.example.com/img2.jpg' },
      { src: 'https://cdn.example.com/img3.jpg' },
    ];
    const { service } = makeProbeVerifier(
      srcs,
      makeEnv({
        IMAGE_VERIFY_ENABLED: true,
        EXTERNAL_VERIFY_PER_HOST: 1,
        EXTERNAL_VERIFY_MAX: 100,
      }),
    );

    const result = await service.probeImages(AUDIT_ID);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.imagesVerified).toBe(1);
    expect(result.truncated).toBe(true);
  });

  it('enforces global cap for images', async () => {
    const fetchMock = jest.fn().mockResolvedValue(okResponse(200));
    global.fetch = fetchMock as unknown as typeof fetch;
    const srcs = ['a', 'b', 'c', 'd'].map((h) => ({ src: `https://${h}.cdn.com/img.jpg` }));
    const { service } = makeProbeVerifier(
      srcs,
      makeEnv({ IMAGE_VERIFY_ENABLED: true, EXTERNAL_VERIFY_MAX: 2, EXTERNAL_VERIFY_PER_HOST: 10 }),
    );

    const result = await service.probeImages(AUDIT_ID);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.imagesVerified).toBe(2);
    expect(result.truncated).toBe(true);
  });

  it('never throws when the DB SELECT fails (best-effort contract)', async () => {
    const execute = jest.fn().mockRejectedValue(new Error('db error'));
    const db = { execute } as unknown as Database;
    const service = new LinkVerifierService(db, makeEnv({ IMAGE_VERIFY_ENABLED: true }));

    await expect(service.probeImages(AUDIT_ID)).resolves.toEqual({
      imagesVerified: 0,
      truncated: false,
    });
  });

  it('skips non-http(s) image srcs', async () => {
    const fetchMock = jest.fn().mockResolvedValue(okResponse(200));
    global.fetch = fetchMock as unknown as typeof fetch;
    const { service } = makeProbeVerifier(
      [{ src: 'data:image/png;base64,abc' }, { src: 'https://cdn.example.com/ok.jpg' }],
      makeEnv({ IMAGE_VERIFY_ENABLED: true }),
    );

    const result = await service.probeImages(AUDIT_ID);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.imagesVerified).toBe(1);
  });
});
