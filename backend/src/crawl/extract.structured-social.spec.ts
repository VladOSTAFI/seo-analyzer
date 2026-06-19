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

describe('ExtractService — structured data (JSON-LD)', () => {
  let service: ExtractService;
  beforeEach(() => {
    service = new ExtractService();
  });

  const run = (name: string) => service.extract(makeInput({ html: fixture(name) })).structuredData;

  it('parses a valid Gym/LocalBusiness into one valid node', () => {
    const sd = run('jsonld-localbusiness.html');
    expect(sd).toHaveLength(1);
    expect(sd[0]!.type).toBe('Gym');
    expect(sd[0]!.valid).toBe(true);
    expect(sd[0]!.errors).toEqual([]);
  });

  it('flags an incomplete LocalBusiness (missing geo/telephone/hours) as recommended gaps', () => {
    const sd = run('jsonld-localbusiness-incomplete.html');
    expect(sd).toHaveLength(1);
    expect(sd[0]!.type).toBe('LocalBusiness');
    // address + name present → still valid, but recommended NAP props missing.
    expect(sd[0]!.valid).toBe(true);
    const props = sd[0]!.errors.map((e) => e.prop);
    expect(props).toEqual(expect.arrayContaining(['telephone', 'geo', 'openingHours']));
  });

  it('flattens a single object with @graph into one node per graph member', () => {
    const sd = run('jsonld-graph.html');
    expect(sd.map((n) => n.type)).toEqual(['Organization', 'BreadcrumbList', 'WebSite']);
  });

  it('flattens a top-level array into one node per element', () => {
    const sd = run('jsonld-array.html');
    expect(sd.map((n) => n.type)).toEqual(['Organization', 'BreadcrumbList']);
  });

  it('records a syntactically-broken block without throwing', () => {
    const sd = run('jsonld-broken.html');
    expect(sd).toHaveLength(1);
    expect(sd[0]!.type).toBeNull();
    expect(sd[0]!.valid).toBe(false);
    expect(sd[0]!.errors[0]!.code).toBe('json-syntax');
  });

  it('parses Product + FAQPage from two separate scripts, both valid', () => {
    const sd = run('jsonld-product-faq.html');
    expect(sd.map((n) => n.type)).toEqual(['Product', 'FAQPage']);
    expect(sd.every((n) => n.valid)).toBe(true);
  });

  it('returns an empty array when no JSON-LD is present', () => {
    expect(run('empty.html')).toEqual([]);
  });

  it('strips the schema.org URL prefix from @type', () => {
    const sd = service.extract(
      makeInput({
        html: '<script type="application/ld+json">{"@type":"https://schema.org/Organization","name":"X","url":"https://x"}</script>',
      }),
    ).structuredData;
    expect(sd[0]!.type).toBe('Organization');
  });

  it('never throws on malformed HTML / empty input', () => {
    expect(() => service.extract(makeInput({ html: '' }))).not.toThrow();
  });
});

describe('ExtractService — Open Graph / Twitter Card', () => {
  let service: ExtractService;
  beforeEach(() => {
    service = new ExtractService();
  });

  const run = (name: string, finalUrl?: string) =>
    service.extract(makeInput({ html: fixture(name), ...(finalUrl ? { finalUrl } : {}) })).ogData;

  it('reads all OG + Twitter tags, resolves images/url absolute, first-value-wins', () => {
    const og = run('og-full.html');
    expect(og).not.toBeNull();
    expect(og!.ogTitle).toBe('Best Widgets — Buy Online'); // first wins over duplicate
    expect(og!.ogDescription).toBe('Shop the best widgets.');
    expect(og!.ogImage).toBe('https://example.com/img/widgets-card.png'); // resolved
    expect(og!.ogUrl).toBe('https://example.com/widgets');
    expect(og!.ogType).toBe('website');
    expect(og!.ogSiteName).toBe('Example');
    expect(og!.twitterCard).toBe('summary_large_image');
    expect(og!.twitterImage).toBe('https://example.com/img/twitter-card.png');
  });

  it('returns null fields for absent tags on a partial page', () => {
    const og = run('og-partial.html');
    expect(og).not.toBeNull();
    expect(og!.ogTitle).toBe('Only a title');
    expect(og!.ogDescription).toBeNull();
    expect(og!.ogImage).toBeNull();
    expect(og!.twitterCard).toBeNull();
  });

  it('returns null when no social tags exist at all', () => {
    expect(run('empty.html')).toBeNull();
  });

  it('keeps an invalid twitter:card value verbatim for the rule to classify', () => {
    const og = run('og-invalid.html');
    expect(og!.twitterCard).toBe('banner');
  });

  it('never throws on empty input', () => {
    expect(() => service.extract(makeInput({ html: '' }))).not.toThrow();
  });
});
