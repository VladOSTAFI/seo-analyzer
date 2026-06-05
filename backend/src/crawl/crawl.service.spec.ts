import { hreflangEntries, images, links, pages } from '../db/schema';
import type { Database } from '../db/db.types';
import type { Env } from '../config/env.validation';
import type { AuditRepository } from '../audit/audit.repository';
import type { ExtractService } from './extract.service';
import type { ExtractedPage } from './crawl.types';
import {
  CrawlService,
  deriveStatusClass,
  looksLikeSpaShell,
  toHreflangRows,
  toImageRows,
  toLinkRows,
  toPageRow,
} from './crawl.service';

const AUDIT_ID = '11111111-2222-3333-4444-555555555555';

function emptyExtracted(overrides: Partial<ExtractedPage> = {}): ExtractedPage {
  return {
    title: [],
    metaDescription: [],
    h1: [],
    h2: [],
    canonicalUrl: null,
    isSelfCanonical: null,
    metaRobots: null,
    xRobotsTag: null,
    relNext: null,
    relPrev: null,
    contentHash: null,
    links: [],
    images: [],
    hreflang: [],
    ...overrides,
  };
}

function collected(metaOverrides = {}, extracted = emptyExtracted()) {
  return {
    meta: {
      url: 'https://example.com/',
      finalUrl: 'https://example.com/',
      statusCode: 200,
      redirectChain: [],
      contentType: 'text/html',
      responseTimeMs: null,
      contentLengthBytes: 100,
      depth: 0,
      crawlSource: 'seed' as const,
      headers: {},
      html: '<html></html>',
      ...metaOverrides,
    },
    extracted,
  };
}

describe('deriveStatusClass', () => {
  it('buckets status codes correctly', () => {
    expect(deriveStatusClass(200)).toBe('2xx');
    expect(deriveStatusClass(204)).toBe('2xx');
    expect(deriveStatusClass(301)).toBe('3xx');
    expect(deriveStatusClass(404)).toBe('4xx');
    expect(deriveStatusClass(503)).toBe('5xx');
  });

  it('returns null for out-of-range codes', () => {
    expect(deriveStatusClass(0)).toBeNull();
    expect(deriveStatusClass(100)).toBeNull();
    expect(deriveStatusClass(600)).toBeNull();
  });
});

describe('looksLikeSpaShell', () => {
  it('flags a near-empty SPA root shell', () => {
    expect(looksLikeSpaShell('<html><body><div id="root"></div></body></html>')).toBe(true);
    expect(looksLikeSpaShell('<html><body><div id="app"></div></body></html>')).toBe(true);
  });

  it('does not flag a content-rich page', () => {
    const rich = `<html><body><p>${'word '.repeat(100)}</p></body></html>`;
    expect(looksLikeSpaShell(rich)).toBe(false);
  });
});

describe('row mappers', () => {
  it('toPageRow derives statusClass and passes arrays through to jsonb columns', () => {
    const extracted = emptyExtracted({
      title: ['A', 'B'],
      h1: ['Heading'],
      canonicalUrl: 'https://example.com/',
      isSelfCanonical: true,
      metaRobots: 'index,follow',
    });
    const row = toPageRow(AUDIT_ID, collected({ statusCode: 301 }, extracted));

    expect(row.auditId).toBe(AUDIT_ID);
    expect(row.statusClass).toBe('3xx');
    expect(row.title).toEqual(['A', 'B']);
    expect(row.h1).toEqual(['Heading']);
    expect(row.canonicalUrl).toBe('https://example.com/');
    expect(row.isSelfCanonical).toBe(true);
    expect(row.metaRobots).toBe('index,follow');
    expect(row.blockedByRobotsTxt).toBe(false);
    // url is normalized for the (auditId, url) unique index.
    expect(row.url).toBe('https://example.com/');
  });

  it('toLinkRows records both internal and external links with rel passed through', () => {
    const extracted = emptyExtracted({
      links: [
        { href: 'https://example.com/a', anchorText: 'A', type: 'internal', rel: [] },
        {
          href: 'https://other.com/x',
          anchorText: 'X',
          type: 'external',
          rel: ['nofollow', 'sponsored'],
        },
      ],
    });
    const rows = toLinkRows(AUDIT_ID, collected({ finalUrl: 'https://example.com/' }, extracted));

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ href: 'https://example.com/a', type: 'internal', rel: [] });
    expect(rows[1]).toMatchObject({
      href: 'https://other.com/x',
      type: 'external',
      rel: ['nofollow', 'sponsored'],
      sourceUrl: 'https://example.com/',
    });
  });

  it('toImageRows and toHreflangRows map onto pageUrl', () => {
    const extracted = emptyExtracted({
      images: [{ src: 'https://example.com/i.png', alt: 'alt', title: null }],
      hreflang: [{ lang: 'uk-UA', href: 'https://example.com/uk' }],
    });
    const c = collected({ finalUrl: 'https://example.com/p' }, extracted);

    expect(toImageRows(AUDIT_ID, c)).toEqual([
      {
        auditId: AUDIT_ID,
        pageUrl: 'https://example.com/p',
        src: 'https://example.com/i.png',
        alt: 'alt',
        title: null,
      },
    ]);
    expect(toHreflangRows(AUDIT_ID, c)).toEqual([
      {
        auditId: AUDIT_ID,
        pageUrl: 'https://example.com/p',
        lang: 'uk-UA',
        href: 'https://example.com/uk',
      },
    ]);
  });
});

describe('CrawlService.crawl', () => {
  function makeEnv(): Env {
    return {
      DATABASE_URL: 'postgres://u:p@localhost:5432/db',
      DB_POOL_SIZE: 10,
      PSI_API_KEY: '',
      CRAWL_MAX_PAGES: 5,
      CRAWL_CONCURRENCY: 2,
      CRAWL_RATE_LIMIT: 5,
      PSI_MAX_SAMPLES: 20,
      LINK_VERIFY_ENABLED: true,
      LINK_VERIFY_CONCURRENCY: 5,
      LINK_VERIFY_TIMEOUT_MS: 10000,
      LINK_VERIFY_RETRIES: 2,
      LINK_VERIFY_USER_AGENT: 'TestBrowser/1.0',
      LINK_VERIFY_MAX: 500,
      OUTPUT_DIR: './output',
      API_PORT: 3000,
      JWT_ACCESS_TTL: '15m',
      JWT_REFRESH_TTL: '30d',
      AUTH_BCRYPT_OR_ARGON: 'argon2id',
      AUTH_LOGIN_MAX_ATTEMPTS: 5,
      AUTH_LOGIN_WINDOW_SEC: 900,
    };
  }

  function makeDeps() {
    const txDelete = jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue(undefined) });
    const txInsert = jest.fn().mockReturnValue({ values: jest.fn().mockResolvedValue(undefined) });
    const tx = { delete: txDelete, insert: txInsert };
    const transaction = jest.fn(async (cb: (t: typeof tx) => Promise<void>) => cb(tx));
    const db = { transaction } as unknown as Database;

    const audits = {
      assertExists: jest.fn().mockResolvedValue({ id: AUDIT_ID, startUrl: 'https://example.com/' }),
      setStatus: jest.fn().mockResolvedValue(undefined),
      markFailed: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<AuditRepository>;

    const extract = { extract: jest.fn() } as unknown as jest.Mocked<ExtractService>;

    return { db, tx, txDelete, txInsert, transaction, audits, extract };
  }

  it('sets status to crawling and leaves it there on success', async () => {
    const { db, audits, extract } = makeDeps();
    const service = new CrawlService(db, makeEnv(), audits, extract);
    // Stub the crawler so we do not hit the network.
    jest
      .spyOn(service as unknown as { runCrawler: () => Promise<unknown[]> }, 'runCrawler')
      .mockResolvedValue([]);

    await service.crawl(AUDIT_ID);

    expect(audits.assertExists).toHaveBeenCalledWith(AUDIT_ID);
    expect(audits.setStatus).toHaveBeenCalledWith(AUDIT_ID, 'crawling');
    expect(audits.markFailed).not.toHaveBeenCalled();
  });

  it('persists with a delete-before-insert transaction (idempotency) and returns counts', async () => {
    const { db, tx, txDelete, txInsert, transaction, audits, extract } = makeDeps();
    const service = new CrawlService(db, makeEnv(), audits, extract);

    const page = collected(
      { url: 'https://example.com/', finalUrl: 'https://example.com/' },
      emptyExtracted({
        links: [{ href: 'https://other.com/x', anchorText: null, type: 'external', rel: [] }],
        images: [{ src: 'https://example.com/i.png', alt: null, title: null }],
        hreflang: [{ lang: 'x-default', href: 'https://example.com/' }],
      }),
    );
    jest
      .spyOn(service as unknown as { runCrawler: () => Promise<unknown[]> }, 'runCrawler')
      .mockResolvedValue([page]);

    const summary = await service.crawl(AUDIT_ID);

    expect(transaction).toHaveBeenCalledTimes(1);
    // Deletes happen for all four tables before any insert.
    expect(txDelete).toHaveBeenCalledWith(pages);
    expect(txDelete).toHaveBeenCalledWith(links);
    expect(txDelete).toHaveBeenCalledWith(images);
    expect(txDelete).toHaveBeenCalledWith(hreflangEntries);
    const deleteOrder = txDelete.mock.invocationCallOrder;
    const insertOrder = txInsert.mock.invocationCallOrder;
    expect(Math.max(...deleteOrder)).toBeLessThan(Math.min(...insertOrder));

    expect(summary).toEqual({ pages: 1, links: 1, images: 1, hreflang: 1 });
    void tx;
  });

  it('calls markFailed(crawl) and rethrows on failure', async () => {
    const { db, audits, extract } = makeDeps();
    const service = new CrawlService(db, makeEnv(), audits, extract);
    const boom = new Error('boom');
    jest
      .spyOn(service as unknown as { runCrawler: () => Promise<unknown[]> }, 'runCrawler')
      .mockRejectedValue(boom);

    await expect(service.crawl(AUDIT_ID)).rejects.toBe(boom);
    expect(audits.markFailed).toHaveBeenCalledWith(AUDIT_ID, 'crawl');
  });
});
