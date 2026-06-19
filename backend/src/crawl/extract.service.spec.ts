import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ExtractService } from './extract.service';
import type { ExtractInput } from './crawl.types';

function fixture(name: string): string {
  return readFileSync(join(__dirname, '__fixtures__', name), 'utf8');
}

function makeInput(overrides: Partial<ExtractInput> & { html: string }): ExtractInput {
  return {
    url: 'https://example.com/widgets',
    finalUrl: 'https://example.com/widgets',
    statusCode: 200,
    headers: {},
    ...overrides,
  };
}

function sha256OfText(visible: string): string {
  const normalized = visible.replace(/\s+/g, ' ').trim().toLowerCase();
  return createHash('sha256').update(normalized, 'utf8').digest('hex');
}

describe('ExtractService', () => {
  let service: ExtractService;

  beforeEach(() => {
    service = new ExtractService();
  });

  describe('full page fixture', () => {
    const run = () => service.extract(makeInput({ html: fixture('full-page.html') }));

    it('extracts a single trimmed title', () => {
      expect(run().title).toEqual(['Best Widgets — Buy Online']);
    });

    it('extracts meta description with case-insensitive name match, trimmed', () => {
      expect(run().metaDescription).toEqual(['The best widgets you can buy online today.']);
    });

    it('collapses internal whitespace in headings', () => {
      const page = run();
      expect(page.h1).toEqual(['Widgets for Everyone']);
      expect(page.h2).toEqual(['Featured', 'Categories']);
    });

    it('resolves canonical absolute and computes self-canonical', () => {
      const page = run();
      expect(page.canonicalUrl).toBe('https://example.com/widgets');
      expect(page.isSelfCanonical).toBe(true);
    });

    it('reads meta robots', () => {
      expect(run().metaRobots).toBe('index, follow');
    });

    it('resolves rel next / prev absolute', () => {
      const page = run();
      expect(page.relNext).toBe('https://example.com/widgets?page=2');
      expect(page.relPrev).toBe('https://example.com/widgets?page=0');
    });

    it('extracts hreflang alternates', () => {
      expect(run().hreflang).toEqual([
        { lang: 'en-US', href: 'https://example.com/widgets' },
        { lang: 'uk-UA', href: 'https://example.com/uk/widgets' },
        { lang: 'x-default', href: 'https://example.com/widgets' },
      ]);
    });

    it('extracts links: skips mailto/fragment, keeps duplicates, classifies, parses rel', () => {
      const page = run();
      expect(page.links).toEqual([
        {
          href: 'https://example.com/about',
          anchorText: 'About us',
          type: 'internal',
          rel: [],
          anchorIsBareImage: false,
          imageAltMissing: false,
        },
        {
          href: 'https://external.example.org/partner',
          anchorText: 'Partner',
          type: 'external',
          // rel tokens lowercased + deduped, order preserved.
          rel: ['nofollow', 'sponsored'],
          anchorIsBareImage: false,
          imageAltMissing: false,
        },
        {
          href: 'https://example.com/about',
          anchorText: 'About again',
          type: 'internal',
          rel: [],
          anchorIsBareImage: false,
          imageAltMissing: false,
        },
        {
          href: 'https://example.com/contact',
          anchorText: 'Contact Us',
          type: 'internal',
          rel: [],
          anchorIsBareImage: false,
          imageAltMissing: false,
        },
      ]);
    });

    it('extracts images: alt absent => null, alt="" => "", data-src fallback, skips empty src', () => {
      const page = run();
      expect(page.images).toEqual([
        {
          src: 'https://example.com/img/hero.png',
          alt: 'Hero banner',
          title: 'Hero',
          width: null,
          height: null,
          loading: null,
          hasSrcset: false,
          hasSizes: false,
        },
        {
          src: 'https://example.com/img/decorative.png',
          alt: '',
          title: null,
          width: null,
          height: null,
          loading: null,
          hasSrcset: false,
          hasSizes: false,
        },
        {
          src: 'https://example.com/img/no-alt.png',
          alt: null,
          title: null,
          width: null,
          height: null,
          loading: null,
          hasSrcset: false,
          hasSizes: false,
        },
        {
          src: 'https://example.com/img/lazy.png',
          alt: 'Lazy loaded',
          title: null,
          width: null,
          height: null,
          loading: null,
          hasSrcset: false,
          hasSizes: false,
        },
      ]);
    });

    it('computes a content hash that excludes script/style text', () => {
      const hash = run().contentHash;
      expect(hash).not.toBeNull();
      expect(hash).not.toContain('should not be hashed');
      // The same visible body text (script/style stripped) hashes identically.
      const visible =
        'Widgets for Everyone Featured Categories ' +
        'Some intro text about widgets and gadgets. ' +
        'About us Partner Email Jump About again Contact Us';
      expect(hash).toBe(sha256OfText(visible));
    });
  });

  describe('missing-everything page', () => {
    it('returns empty arrays / nulls and never throws', () => {
      const page = service.extract(makeInput({ html: fixture('empty.html') }));
      expect(page.title).toEqual([]);
      expect(page.metaDescription).toEqual([]);
      expect(page.h1).toEqual([]);
      expect(page.h2).toEqual([]);
      expect(page.canonicalUrl).toBeNull();
      expect(page.isSelfCanonical).toBeNull();
      expect(page.metaRobots).toBeNull();
      expect(page.xRobotsTag).toBeNull();
      expect(page.relNext).toBeNull();
      expect(page.relPrev).toBeNull();
      expect(page.contentHash).toBeNull();
      expect(page.links).toEqual([]);
      expect(page.images).toEqual([]);
      expect(page.hreflang).toEqual([]);
    });

    it('handles a completely empty string without throwing', () => {
      expect(() => service.extract(makeInput({ html: '' }))).not.toThrow();
      const page = service.extract(makeInput({ html: '' }));
      expect(page.title).toEqual([]);
      expect(page.contentHash).toBeNull();
    });
  });

  describe('multiple titles / h1 / descriptions', () => {
    const run = () => service.extract(makeInput({ html: fixture('multi-title-h1.html') }));

    it('collects all titles', () => {
      expect(run().title).toEqual(['First Title', 'Second Title']);
    });

    it('collects all meta descriptions', () => {
      expect(run().metaDescription).toEqual(['First description', 'Second description']);
    });

    it('collects all non-empty h1s, dropping whitespace-only', () => {
      expect(run().h1).toEqual(['First H1', 'Second H1']);
    });
  });

  describe('canonical self vs cross-page', () => {
    it('isSelfCanonical true when canonical matches finalUrl ignoring trailing differences', () => {
      const html =
        '<html><head><link rel="canonical" href="https://example.com/page"></head><body>x</body></html>';
      const page = service.extract(
        makeInput({ html, url: 'https://example.com/page', finalUrl: 'https://example.com/page' }),
      );
      expect(page.isSelfCanonical).toBe(true);
    });

    it('isSelfCanonical false when canonical points to a different page', () => {
      const html =
        '<html><head><link rel="canonical" href="https://example.com/other"></head><body>x</body></html>';
      const page = service.extract(
        makeInput({ html, url: 'https://example.com/page', finalUrl: 'https://example.com/page' }),
      );
      expect(page.canonicalUrl).toBe('https://example.com/other');
      expect(page.isSelfCanonical).toBe(false);
    });

    it('isSelfCanonical null when no canonical declared', () => {
      const page = service.extract(makeInput({ html: '<html><body>x</body></html>' }));
      expect(page.isSelfCanonical).toBeNull();
    });

    it('resolves a relative canonical against finalUrl', () => {
      const html = '<html><head><link rel="canonical" href="/page"></head><body>x</body></html>';
      const page = service.extract(
        makeInput({ html, finalUrl: 'https://example.com/page', url: 'https://example.com/page' }),
      );
      expect(page.canonicalUrl).toBe('https://example.com/page');
      expect(page.isSelfCanonical).toBe(true);
    });
  });

  describe('base URL fallback', () => {
    it('uses url when finalUrl is empty', () => {
      const html = '<html><body><a href="/rel">x</a></body></html>';
      const page = service.extract(
        makeInput({ html, finalUrl: '', url: 'https://fallback.example.com/start' }),
      );
      expect(page.links[0].href).toBe('https://fallback.example.com/rel');
    });
  });

  describe('link classification', () => {
    it('classifies same-host as internal and different-host as external', () => {
      const html =
        '<html><body>' +
        '<a href="https://example.com/a">a</a>' +
        '<a href="https://other.com/b">b</a>' +
        '</body></html>';
      const page = service.extract(makeInput({ html }));
      expect(page.links.map((l) => l.type)).toEqual(['internal', 'external']);
    });

    it('returns null anchor text for empty / whitespace-only anchors', () => {
      const html = '<html><body><a href="/x">   </a></body></html>';
      const page = service.extract(makeInput({ html }));
      expect(page.links[0].anchorText).toBeNull();
    });
  });

  describe('x-robots-tag header', () => {
    it('reads a string header value case-insensitively', () => {
      const page = service.extract(
        makeInput({ html: '<html></html>', headers: { 'X-Robots-Tag': 'noindex' } }),
      );
      expect(page.xRobotsTag).toBe('noindex');
    });

    it('joins an array header value with ", "', () => {
      const page = service.extract(
        makeInput({
          html: '<html></html>',
          headers: { 'x-robots-tag': ['noindex', 'nofollow'] },
        }),
      );
      expect(page.xRobotsTag).toBe('noindex, nofollow');
    });

    it('is null when the header is absent', () => {
      const page = service.extract(makeInput({ html: '<html></html>', headers: {} }));
      expect(page.xRobotsTag).toBeNull();
    });

    it('is null when the header value is undefined', () => {
      const page = service.extract(
        makeInput({ html: '<html></html>', headers: { 'x-robots-tag': undefined } }),
      );
      expect(page.xRobotsTag).toBeNull();
    });
  });

  describe('contentHash stability', () => {
    it('same visible text in differently-formatted HTML hashes identically', () => {
      const a = service.extract(
        makeInput({ html: '<html><body><p>Hello   World</p></body></html>' }),
      );
      const b = service.extract(
        makeInput({
          html: '<html><body>\n  <div>Hello</div>\n  <span>World</span>\n</body></html>',
        }),
      );
      expect(a.contentHash).toBe(b.contentHash);
      expect(a.contentHash).not.toBeNull();
    });

    it('different visible text hashes differently', () => {
      const a = service.extract(makeInput({ html: '<html><body>Hello World</body></html>' }));
      const b = service.extract(makeInput({ html: '<html><body>Goodbye World</body></html>' }));
      expect(a.contentHash).not.toBe(b.contentHash);
    });

    it('is null when the page has no visible text (only script/style)', () => {
      const page = service.extract(
        makeInput({
          html: '<html><body><script>var x=1;</script><style>a{}</style></body></html>',
        }),
      );
      expect(page.contentHash).toBeNull();
    });

    it('is deterministic across repeated calls on the same input', () => {
      const input = makeInput({ html: fixture('full-page.html') });
      expect(service.extract(input).contentHash).toBe(service.extract(input).contentHash);
    });
  });

  describe('determinism', () => {
    it('produces deep-equal output for the same input', () => {
      const input = makeInput({ html: fixture('full-page.html') });
      expect(service.extract(input)).toEqual(service.extract(input));
    });
  });

  describe('image static signals (feature 09)', () => {
    it('parses width/height/loading and srcset/sizes on the <img> itself', () => {
      const html =
        '<html><body>' +
        '<img src="/a.jpg" width="800" height="600" loading="LAZY" srcset="/a-2x.jpg 2x" sizes="100vw">' +
        '</body></html>';
      const page = service.extract(makeInput({ html }));
      expect(page.images).toEqual([
        {
          src: 'https://example.com/a.jpg',
          alt: null,
          title: null,
          width: 800,
          height: 600,
          loading: 'lazy',
          hasSrcset: true,
          hasSizes: true,
        },
      ]);
    });

    it('treats non-integer dimensions (e.g. 100%, auto) as null', () => {
      const html = '<html><body><img src="/b.jpg" width="100%" height="auto"></body></html>';
      const img = service.extract(makeInput({ html })).images[0];
      expect(img.width).toBeNull();
      expect(img.height).toBeNull();
    });

    it('folds a parent <picture><source srcset> into hasSrcset', () => {
      const html =
        '<html><body><picture>' +
        '<source srcset="/c.webp" type="image/webp">' +
        '<img src="/c.jpg">' +
        '</picture></body></html>';
      const img = service.extract(makeInput({ html })).images[0];
      expect(img.src).toBe('https://example.com/c.jpg');
      expect(img.hasSrcset).toBe(true);
    });

    it('a bare <img> reports no responsive hints and null loading', () => {
      const img = service.extract(
        makeInput({ html: '<html><body><img src="/d.png"></body></html>' }),
      ).images[0];
      expect(img.hasSrcset).toBe(false);
      expect(img.hasSizes).toBe(false);
      expect(img.loading).toBeNull();
    });
  });

  describe('image-link anchor signals (feature 10)', () => {
    it('flags an <a> wrapping only an <img> with no alt', () => {
      const html = '<html><body><a href="/p"><img src="/x.png"></a></body></html>';
      const link = service.extract(makeInput({ html })).links[0];
      expect(link.anchorIsBareImage).toBe(true);
      expect(link.imageAltMissing).toBe(true);
      expect(link.anchorText).toBeNull();
    });

    it('a bare image link WITH alt is bare-image but not missing-alt', () => {
      const html = '<html><body><a href="/p"><img src="/x.png" alt="Logo"></a></body></html>';
      const link = service.extract(makeInput({ html })).links[0];
      expect(link.anchorIsBareImage).toBe(true);
      expect(link.imageAltMissing).toBe(false);
    });

    it('an <a> with text AND an <img> is NOT a bare-image link', () => {
      const html = '<html><body><a href="/p">Read <img src="/x.png"></a></body></html>';
      const link = service.extract(makeInput({ html })).links[0];
      expect(link.anchorIsBareImage).toBe(false);
      expect(link.imageAltMissing).toBe(false);
      expect(link.anchorText).toBe('Read');
    });

    it('a text-only <a> is neither bare-image nor missing-alt', () => {
      const html = '<html><body><a href="/p">Plain text</a></body></html>';
      const link = service.extract(makeInput({ html })).links[0];
      expect(link.anchorIsBareImage).toBe(false);
      expect(link.imageAltMissing).toBe(false);
    });
  });

  describe('feature 08: content semantics', () => {
    it('extracts htmlLang, charset (meta charset), hasViewport, wordCount, simhash, pixel widths', () => {
      const html =
        '<!doctype html><html lang="en-US"><head>' +
        '<meta charset="utf-8">' +
        '<meta name="viewport" content="width=device-width, initial-scale=1">' +
        '<title>Best Widgets Online</title>' +
        '<meta name="description" content="A short description of widgets for sale.">' +
        '</head><body><h1>Widgets</h1> <p>One two three four five six.</p></body></html>';
      const page = service.extract(makeInput({ html }));
      expect(page.htmlLang).toBe('en-US');
      expect(page.charset).toBe('utf-8');
      expect(page.hasViewport).toBe(true);
      // visible words: "widgets one two three four five six." => 7 tokens
      expect(page.wordCount).toBe(7);
      expect(page.htmlBytes).toBe(Buffer.byteLength(html, 'utf8'));
      expect(page.contentSimhash).toMatch(/^[01]{64}$/);
      expect(page.titlePx).toBeGreaterThan(0);
      expect(page.descPx).toBeGreaterThan(0);
    });

    it('detects charset from a http-equiv Content-Type meta', () => {
      const html =
        '<html><head><meta http-equiv="Content-Type" content="text/html; charset=ISO-8859-1">' +
        '</head><body>x</body></html>';
      expect(service.extract(makeInput({ html })).charset).toBe('iso-8859-1');
    });

    it('hasViewport is false / charset null / htmlLang null when absent', () => {
      const page = service.extract(makeInput({ html: '<html><head></head><body>x</body></html>' }));
      expect(page.hasViewport).toBe(false);
      expect(page.charset).toBeNull();
      expect(page.htmlLang).toBeNull();
    });

    it('collects the heading outline in document order, keeping empty headings', () => {
      const html =
        '<html><body><h1>Top</h1><h3>Skipped</h3><h2></h2><h2>Sec</h2></body></html>';
      expect(service.extract(makeInput({ html })).headingsOutline).toEqual([
        { level: 1, text: 'Top' },
        { level: 3, text: 'Skipped' },
        { level: 2, text: '' },
        { level: 2, text: 'Sec' },
      ]);
    });

    it('contentSimhash is deterministic and null for a no-body page', () => {
      const input = makeInput({ html: '<html><body>Hello there friend of mine indeed</body></html>' });
      expect(service.extract(input).contentSimhash).toBe(service.extract(input).contentSimhash);
      const empty = service.extract(
        makeInput({ html: '<html><body><script>var a=1</script></body></html>' }),
      );
      expect(empty.contentSimhash).toBeNull();
    });

    it('pixel widths are null when title/description are absent', () => {
      const page = service.extract(makeInput({ html: '<html><body>x</body></html>' }));
      expect(page.titlePx).toBeNull();
      expect(page.descPx).toBeNull();
    });

    it('a wide-glyph title has a larger pixel width than a narrow-glyph one of equal length', () => {
      const wide = service.extract(
        makeInput({ html: '<html><head><title>WWWWWWWWWW</title></head><body>x</body></html>' }),
      );
      const narrow = service.extract(
        makeInput({ html: '<html><head><title>iiiiiiiiii</title></head><body>x</body></html>' }),
      );
      expect(wide.titlePx!).toBeGreaterThan(narrow.titlePx!);
    });
  });

  describe('feature 11: sub-resources + security headers + mobile usability', () => {
    it('collects script/style/font/iframe sub-resources with is_https, dedup per (kind,src)', () => {
      const html =
        '<html><head>' +
        '<script src="https://cdn.example.com/a.js"></script>' +
        '<script src="http://cdn.example.com/b.js"></script>' +
        '<link rel="stylesheet" href="https://example.com/s.css">' +
        '<link rel="preload" as="font" href="https://example.com/f.woff2">' +
        '</head><body>' +
        '<iframe src="http://other.example/embed"></iframe>' +
        '<script src="https://cdn.example.com/a.js"></script>' + // dup -> deduped
        '</body></html>';
      const resources = service.extract(makeInput({ html })).resources;
      expect(resources).toEqual([
        { src: 'https://cdn.example.com/a.js', kind: 'script', isHttps: true },
        { src: 'http://cdn.example.com/b.js', kind: 'script', isHttps: false },
        { src: 'https://example.com/s.css', kind: 'style', isHttps: true },
        { src: 'https://example.com/f.woff2', kind: 'font', isHttps: true },
        { src: 'http://other.example/embed', kind: 'other', isHttps: false },
      ]);
    });

    it('captures HSTS / CSP presence / X-Content-Type-Options from headers', () => {
      const page = service.extract(
        makeInput({
          html: '<html></html>',
          headers: {
            'Strict-Transport-Security': 'max-age=63072000',
            'Content-Security-Policy': "default-src 'self'",
            'X-Content-Type-Options': 'nosniff',
          },
        }),
      );
      expect(page.security.hsts).toBe('max-age=63072000');
      expect(page.security.cspPresent).toBe(true);
      expect(page.security.xContentTypeOptions).toBe('nosniff');
    });

    it('security header signals default to null/false when absent', () => {
      const page = service.extract(makeInput({ html: '<html></html>', headers: {} }));
      expect(page.security.hsts).toBeNull();
      expect(page.security.cspPresent).toBe(false);
      expect(page.security.xContentTypeOptions).toBeNull();
    });

    it('captures the raw viewport content attribute', () => {
      const page = service.extract(
        makeInput({
          html: '<html><head><meta name="viewport" content="width=device-width, user-scalable=no"></head><body>x</body></html>',
        }),
      );
      expect(page.security.viewportContent).toBe('width=device-width, user-scalable=no');
    });

    it('flags tiny inline fonts and fixed-width overflow as mobile-usability issues', () => {
      const html =
        '<html><body>' +
        '<p style="font-size: 9px">tiny</p>' +
        '<div style="width: 1200px">wide</div>' +
        '</body></html>';
      const issues = service.extract(makeInput({ html })).security.mobileUsabilityIssues.sort();
      expect(issues).toEqual(['fixed-width-overflow', 'tiny-font']);
    });

    it('emits no mobile-usability issues for legible / fluid markup', () => {
      const html =
        '<html><body><p style="font-size: 16px">ok</p><div style="width: 100%">ok</div></body></html>';
      expect(service.extract(makeInput({ html })).security.mobileUsabilityIssues).toEqual([]);
    });
  });

});
