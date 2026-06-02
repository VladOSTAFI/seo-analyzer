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
        { href: 'https://example.com/about', anchorText: 'About us', type: 'internal', rel: [] },
        {
          href: 'https://external.example.org/partner',
          anchorText: 'Partner',
          type: 'external',
          // rel tokens lowercased + deduped, order preserved.
          rel: ['nofollow', 'sponsored'],
        },
        { href: 'https://example.com/about', anchorText: 'About again', type: 'internal', rel: [] },
        {
          href: 'https://example.com/contact',
          anchorText: 'Contact Us',
          type: 'internal',
          rel: [],
        },
      ]);
    });

    it('extracts images: alt absent => null, alt="" => "", data-src fallback, skips empty src', () => {
      const page = run();
      expect(page.images).toEqual([
        { src: 'https://example.com/img/hero.png', alt: 'Hero banner', title: 'Hero' },
        { src: 'https://example.com/img/decorative.png', alt: '', title: null },
        { src: 'https://example.com/img/no-alt.png', alt: null, title: null },
        { src: 'https://example.com/img/lazy.png', alt: 'Lazy loaded', title: null },
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
});
