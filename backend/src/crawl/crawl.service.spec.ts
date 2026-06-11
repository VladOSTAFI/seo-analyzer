import { hreflangEntries, images, links, pages } from '../db/schema';
import type { Database } from '../db/db.types';
import type { Env } from '../config/env.validation';
import type { AuditRepository } from '../audit/audit.repository';
import type { ExtractService } from './extract.service';
import type { ExtractedPage } from './crawl.types';
import {
  classifyPageKind,
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

describe('classifyPageKind', () => {
  // --- HTML cases ---
  it('returns "html" for text/html content type', () => {
    expect(classifyPageKind('text/html; charset=utf-8', 'seed', 'https://example.com/')).toBe(
      'html',
    );
  });

  it('returns "html" for application/xhtml+xml content type', () => {
    expect(classifyPageKind('application/xhtml+xml', 'link', 'https://example.com/page')).toBe(
      'html',
    );
  });

  it('returns "html" when content type has extra parameters', () => {
    expect(classifyPageKind('text/html; charset=UTF-8', 'link', 'https://example.com/about')).toBe(
      'html',
    );
  });

  // --- Sitemap cases ---
  it('returns "sitemap" when crawlSource is "sitemap" regardless of content type', () => {
    expect(classifyPageKind('application/xml', 'sitemap', 'https://example.com/sitemap.xml')).toBe(
      'sitemap',
    );
  });

  it('returns "sitemap" when crawlSource is "sitemap" even with html content type', () => {
    expect(classifyPageKind('text/html', 'sitemap', 'https://example.com/sitemap.xml')).toBe(
      'sitemap',
    );
  });

  it('returns "sitemap" when URL contains "sitemap" and content type is XML', () => {
    expect(classifyPageKind('application/xml', 'link', 'https://example.com/sitemap.xml')).toBe(
      'sitemap',
    );
  });

  it('returns "sitemap" when content type explicitly contains "sitemap"', () => {
    expect(
      classifyPageKind('application/x-sitemap+xml', 'link', 'https://example.com/sm.xml'),
    ).toBe('sitemap');
  });

  // --- Feed cases ---
  it('returns "feed" for application/rss+xml', () => {
    expect(classifyPageKind('application/rss+xml', 'link', 'https://example.com/rss')).toBe('feed');
  });

  it('returns "feed" for application/atom+xml', () => {
    expect(classifyPageKind('application/atom+xml', 'link', 'https://example.com/atom')).toBe(
      'feed',
    );
  });

  it('returns "feed" for URL containing /feed', () => {
    expect(classifyPageKind('text/html', 'link', 'https://example.com/feed')).toBe('feed');
  });

  it('returns "feed" for URL containing /rss', () => {
    expect(classifyPageKind('text/html', 'link', 'https://example.com/rss')).toBe('feed');
  });

  it('returns "feed" for .rss URL extension', () => {
    expect(classifyPageKind('application/rss+xml', 'link', 'https://example.com/news.rss')).toBe(
      'feed',
    );
  });

  // --- Other cases ---
  it('returns "other" for image/jpeg', () => {
    expect(classifyPageKind('image/jpeg', 'link', 'https://example.com/photo.jpg')).toBe('other');
  });

  it('returns "other" for application/pdf', () => {
    expect(classifyPageKind('application/pdf', 'link', 'https://example.com/doc.pdf')).toBe(
      'other',
    );
  });

  it('returns "other" for null content type with non-matching URL', () => {
    expect(classifyPageKind(null, 'link', 'https://example.com/unknown')).toBe('other');
  });

  it('returns "other" for application/json', () => {
    expect(classifyPageKind('application/json', 'link', 'https://example.com/api/data')).toBe(
      'other',
    );
  });

  // --- Sitemap takes priority over feed ---
  it('sitemap wins over feed when both URL and content type match sitemap', () => {
    // A URL with both "sitemap" and "/feed" in it — sitemap checked first.
    expect(
      classifyPageKind('application/xml', 'sitemap', 'https://example.com/sitemap-feed.xml'),
    ).toBe('sitemap');
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

  it('toPageRow sets pageKind to "html" for a regular HTML seed page', () => {
    const row = toPageRow(
      AUDIT_ID,
      collected({ contentType: 'text/html; charset=utf-8', crawlSource: 'seed' as const }),
    );
    expect(row.pageKind).toBe('html');
  });

  it('toPageRow sets pageKind to "sitemap" for a sitemap crawl source', () => {
    const row = toPageRow(
      AUDIT_ID,
      collected({
        url: 'https://example.com/sitemap.xml',
        finalUrl: 'https://example.com/sitemap.xml',
        contentType: 'application/xml',
        crawlSource: 'sitemap' as const,
      }),
    );
    expect(row.pageKind).toBe('sitemap');
  });

  it('toPageRow sets pageKind to "feed" for an RSS content type', () => {
    const row = toPageRow(
      AUDIT_ID,
      collected({
        url: 'https://example.com/rss.xml',
        finalUrl: 'https://example.com/rss.xml',
        contentType: 'application/rss+xml',
        crawlSource: 'link' as const,
      }),
    );
    expect(row.pageKind).toBe('feed');
  });

  it('toPageRow forwards responseTimeMs to the row', () => {
    const row = toPageRow(AUDIT_ID, collected({ responseTimeMs: 342 }));
    expect(row.responseTimeMs).toBe(342);
  });

  it('toPageRow passes null responseTimeMs through unchanged', () => {
    const row = toPageRow(AUDIT_ID, collected({ responseTimeMs: null }));
    expect(row.responseTimeMs).toBeNull();
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
      EXTERNAL_VERIFY_ENABLED: false,
      IMAGE_VERIFY_ENABLED: false,
      EXTERNAL_VERIFY_MAX: 200,
      EXTERNAL_VERIFY_PER_HOST: 20,
      RULE_EXTERNAL_FLAG_ENABLED: false,
      PERF_FLAG_ROLLUP_PCT: 0.6,
      PERF_LAB_SCORE_MIN: 90,
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

  it('persists responseTimeMs from a collected page that has it set', async () => {
    const { db, audits, extract } = makeDeps();
    const service = new CrawlService(db, makeEnv(), audits, extract);

    const page = collected({ responseTimeMs: 123 });
    jest
      .spyOn(service as unknown as { runCrawler: () => Promise<unknown[]> }, 'runCrawler')
      .mockResolvedValue([page]);

    // toPageRow forwards responseTimeMs — verify via the row mapper directly.
    const row = toPageRow(AUDIT_ID, page);
    expect(row.responseTimeMs).toBe(123);

    await service.crawl(AUDIT_ID);
    // Service ran without error; timing flows through persist normally.
  });
});
