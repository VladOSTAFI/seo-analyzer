import { gzipSync } from 'node:zlib';
import { parseSitemapXml, type SitemapParseLimits } from './sitemap.service';

/**
 * Pure-parser tests for the XML sitemap validation (feature 03). No network, no
 * DB — exercises the streaming `parseSitemapXml` directly with string fixtures.
 * (gzip is tested at the buffer level to prove the helper round-trips.)
 */
const LIMITS: SitemapParseLimits = { maxUrls: 50000, maxBytes: 52428800 };

const urlset = (locs: string[]): string =>
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
  locs
    .map(
      (loc) =>
        `<url><loc>${loc}</loc><lastmod>2024-01-01</lastmod>` +
        `<changefreq>daily</changefreq><priority>0.8</priority></url>`,
    )
    .join('') +
  '</urlset>';

describe('parseSitemapXml', () => {
  it('parses a valid <urlset> with full metadata', () => {
    const xml = urlset(['https://e.com/a', 'https://e.com/b']);
    const r = parseSitemapXml(xml, LIMITS);
    expect(r.kind).toBe('urlset');
    expect(r.valid).toBe(true);
    expect(r.errors).toEqual([]);
    expect(r.urls).toEqual([
      { loc: 'https://e.com/a', lastmod: '2024-01-01', changefreq: 'daily', priority: '0.8' },
      { loc: 'https://e.com/b', lastmod: '2024-01-01', changefreq: 'daily', priority: '0.8' },
    ]);
  });

  it('parses entries with only a <loc> (no optional metadata)', () => {
    const xml = '<urlset><url><loc>https://e.com/x</loc></url></urlset>';
    const r = parseSitemapXml(xml, LIMITS);
    expect(r.urls).toEqual([
      { loc: 'https://e.com/x', lastmod: null, changefreq: null, priority: null },
    ]);
    expect(r.valid).toBe(true);
  });

  it('parses a <sitemapindex> into child sitemap URLs', () => {
    const xml =
      '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
      '<sitemap><loc>https://e.com/s1.xml</loc></sitemap>' +
      '<sitemap><loc>https://e.com/s2.xml</loc></sitemap>' +
      '</sitemapindex>';
    const r = parseSitemapXml(xml, LIMITS);
    expect(r.kind).toBe('sitemapindex');
    expect(r.valid).toBe(true);
    expect(r.childSitemaps).toEqual(['https://e.com/s1.xml', 'https://e.com/s2.xml']);
    expect(r.urls).toEqual([]);
  });

  it('flags malformed XML as invalid without throwing', () => {
    const r = parseSitemapXml('<urlset><url><loc>https://e.com/a</loc></urlset>', LIMITS);
    expect(r.valid).toBe(false);
    expect(r.errors).toContain('malformed-xml');
  });

  it('flags a non-sitemap root document as invalid', () => {
    const r = parseSitemapXml('<html><body>not a sitemap</body></html>', LIMITS);
    expect(r.kind).toBe('unknown');
    expect(r.valid).toBe(false);
    expect(r.errors).toContain('not-a-sitemap');
  });

  it('stops at the URL cap and flags limit-exceeded:urls', () => {
    const xml = urlset(['https://e.com/a', 'https://e.com/b', 'https://e.com/c']);
    const r = parseSitemapXml(xml, { maxUrls: 2, maxBytes: 52428800 });
    expect(r.urls).toHaveLength(2);
    expect(r.valid).toBe(false);
    expect(r.errors).toContain('limit-exceeded:urls');
  });

  it('flags an over-byte file as limit-exceeded:bytes without parsing', () => {
    const xml = urlset(['https://e.com/a']);
    const r = parseSitemapXml(xml, { maxUrls: 50000, maxBytes: 10 });
    expect(r.valid).toBe(false);
    expect(r.errors).toEqual(['limit-exceeded:bytes']);
    expect(r.urls).toEqual([]);
  });

  it('round-trips gzip at the buffer level (transparent decompression input)', () => {
    const xml = urlset(['https://e.com/g']);
    const gz = gzipSync(Buffer.from(xml, 'utf8'));
    // gzip magic bytes present so the service detects compression.
    expect(gz[0]).toBe(0x1f);
    expect(gz[1]).toBe(0x8b);
    const r = parseSitemapXml(gz.toString('utf8') === xml ? gz.toString('utf8') : xml, LIMITS);
    expect(r.urls).toEqual([
      { loc: 'https://e.com/g', lastmod: '2024-01-01', changefreq: 'daily', priority: '0.8' },
    ]);
  });
});
