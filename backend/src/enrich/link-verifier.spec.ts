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

/**
 * A fetch mock for the image probe: carries a `headers.get()` (Content-Length /
 * Content-Type) plus a cancellable body. `contentLength`/`contentType` may be
 * null to simulate a header-less response (forces the GET stream-count path).
 */
function imageResponse(
  status: number,
  opts: { contentLength?: number | null; contentType?: string | null } = {},
): Response {
  const { contentLength = 12345, contentType = 'image/jpeg' } = opts;
  const headers = {
    get: (name: string): string | null => {
      const n = name.toLowerCase();
      if (n === 'content-length') return contentLength === null ? null : String(contentLength);
      if (n === 'content-type') return contentType;
      return null;
    },
  };
  return {
    status,
    headers,
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
    const fetchMock = jest.fn().mockResolvedValue(imageResponse(200));
    global.fetch = fetchMock as unknown as typeof fetch;
    const { service, updates } = makeProbeVerifier(
      [{ src: 'https://cdn.example.com/img.jpg' }],
      makeEnv({ IMAGE_VERIFY_ENABLED: true }),
    );

    const result = await service.probeImages(AUDIT_ID);

    expect(result.imagesVerified).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // Two UPDATEs per src: images.status_code AND page_resources (status/bytes/format).
    expect(updates).toHaveLength(2);
    expect(updates.some((u) => u.includes('update images'))).toBe(true);
    const pr = updates.find((u) => u.includes('page_resources'));
    expect(pr).toBeDefined();
    expect(pr).toContain('bytes');
    expect(pr).toContain('format');
  });

  it('enforces per-host budget for images', async () => {
    const fetchMock = jest.fn().mockResolvedValue(imageResponse(200));
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
    const fetchMock = jest.fn().mockResolvedValue(imageResponse(200));
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
    const fetchMock = jest.fn().mockResolvedValue(imageResponse(200));
    global.fetch = fetchMock as unknown as typeof fetch;
    const { service } = makeProbeVerifier(
      [{ src: 'data:image/png;base64,abc' }, { src: 'https://cdn.example.com/ok.jpg' }],
      makeEnv({ IMAGE_VERIFY_ENABLED: true }),
    );

    const result = await service.probeImages(AUDIT_ID);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.imagesVerified).toBe(1);
  });

  it('records bytes + format from HEAD Content-Length/Content-Type', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(imageResponse(200, { contentLength: 204800, contentType: 'image/webp' }));
    global.fetch = fetchMock as unknown as typeof fetch;
    const { service, updates } = makeProbeVerifier(
      [{ src: 'https://cdn.example.com/hero.webp' }],
      makeEnv({ IMAGE_VERIFY_ENABLED: true }),
    );

    await service.probeImages(AUDIT_ID);

    // HEAD alone supplied a usable Content-Length → exactly one fetch.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const pr = updates.find((u) => u.includes('page_resources'));
    expect(pr).toBeDefined();
    expect(pr).toContain('bytes');
    expect(pr).toContain('format');
  });

  it('falls back to GET when HEAD is 405 (HEAD-unsupported origin)', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(imageResponse(405, { contentLength: null }))
      .mockResolvedValueOnce(imageResponse(200, { contentLength: 99999 }));
    global.fetch = fetchMock as unknown as typeof fetch;
    const { service } = makeProbeVerifier(
      [{ src: 'https://cdn.example.com/x.jpg' }],
      makeEnv({ IMAGE_VERIFY_ENABLED: true }),
    );

    await service.probeImages(AUDIT_ID);

    // HEAD (405) then GET fallback ⇒ two fetches for the one src.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [, headInit] = fetchMock.mock.calls[0];
    const [, getInit] = fetchMock.mock.calls[1];
    expect(headInit.method).toBe('HEAD');
    expect(getInit.method).toBe('GET');
  });

  it('GETs and stream-counts the body when no Content-Length header is present', async () => {
    // HEAD has no Content-Length → GET; GET also lacks it → stream-count.
    const chunks = [new Uint8Array(1000), new Uint8Array(500)];
    let i = 0;
    const reader = {
      read: jest.fn().mockImplementation(async () => {
        if (i < chunks.length) return { done: false, value: chunks[i++] };
        return { done: true, value: undefined };
      }),
      cancel: jest.fn().mockResolvedValue(undefined),
    };
    const streamingGet = {
      status: 200,
      headers: {
        get: (n: string): string | null =>
          n.toLowerCase() === 'content-type' ? 'image/png' : null,
      },
      body: { getReader: () => reader, cancel: jest.fn().mockResolvedValue(undefined) },
    } as unknown as Response;

    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(imageResponse(200, { contentLength: null }))
      .mockResolvedValueOnce(streamingGet);
    global.fetch = fetchMock as unknown as typeof fetch;
    const { service } = makeProbeVerifier(
      [{ src: 'https://cdn.example.com/nolen.png' }],
      makeEnv({ IMAGE_VERIFY_ENABLED: true }),
    );

    await service.probeImages(AUDIT_ID);

    // HEAD (no length) then GET (no length) ⇒ stream-counted via the reader.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(reader.read).toHaveBeenCalled();
  });
});

describe('LinkVerifierService.verifyCerts (cert probe)', () => {
  const ORIG = process.env.SECURITY_VERIFY_ENABLED;
  afterEach(() => {
    if (ORIG === undefined) delete process.env.SECURITY_VERIFY_ENABLED;
    else process.env.SECURITY_VERIFY_ENABLED = ORIG;
    jest.restoreAllMocks();
  });

  it('is a no-op when SECURITY_VERIFY_ENABLED is off (no SELECT, zero hosts)', async () => {
    delete process.env.SECURITY_VERIFY_ENABLED;
    const execute = jest.fn(async () => rowsResult([]));
    const service = new LinkVerifierService({ execute } as unknown as Database, makeEnv());
    const res = await service.verifyCerts(AUDIT_ID);
    expect(res).toEqual({ hostsChecked: 0 });
    expect(execute).not.toHaveBeenCalled();
  });

  it('probes one cert per distinct host and updates the cert columns when enabled', async () => {
    process.env.SECURITY_VERIFY_ENABLED = 'true';
    const updates: string[] = [];
    const execute = jest.fn(async (query: { queryChunks?: unknown }) => {
      if (leadingKeyword(query) === 'select') {
        return rowsResult([
          { eff_url: 'https://a.example/page1' },
          { eff_url: 'https://a.example/page2' }, // same host → one probe
          { eff_url: 'https://b.example/' },
        ]);
      }
      updates.push(sqlText(query));
      return rowsResult([]);
    });
    const service = new LinkVerifierService({ execute } as unknown as Database, makeEnv());
    // Stub the TLS probe so the test never opens a socket.
    jest
      .spyOn(service as unknown as { probeCert: (h: string) => Promise<unknown> }, 'probeCert')
      .mockResolvedValue({ valid: true, daysToExpiry: 42 });

    const res = await service.verifyCerts(AUDIT_ID);

    expect(res).toEqual({ hostsChecked: 2 }); // a.example + b.example
    expect(updates).toHaveLength(2);
    for (const u of updates) expect(u).toContain('update pages');
  });

  it('never throws and reports zero when the pass errors (best-effort)', async () => {
    process.env.SECURITY_VERIFY_ENABLED = '1';
    const execute = jest.fn(async () => {
      throw new Error('boom');
    });
    const service = new LinkVerifierService({ execute } as unknown as Database, makeEnv());
    await expect(service.verifyCerts(AUDIT_ID)).resolves.toEqual({ hostsChecked: 0 });
  });
});
