import { classifyLink, normalizeUrl, resolveUrl, urlVariants } from './url.util';

describe('normalizeUrl', () => {
  it('lowercases scheme and host but preserves path case', () => {
    expect(normalizeUrl('HTTPS://Example.COM/Path')).toBe('https://example.com/Path');
  });

  it('strips the default http port (80)', () => {
    expect(normalizeUrl('http://example.com:80/foo')).toBe('http://example.com/foo');
  });

  it('strips the default https port (443)', () => {
    expect(normalizeUrl('https://example.com:443/foo')).toBe('https://example.com/foo');
  });

  it('keeps a non-default port', () => {
    expect(normalizeUrl('http://example.com:8080/foo')).toBe('http://example.com:8080/foo');
  });

  it('removes the fragment', () => {
    expect(normalizeUrl('https://example.com/foo#section')).toBe('https://example.com/foo');
  });

  it('sorts query params by key deterministically', () => {
    expect(normalizeUrl('https://example.com/?b=2&a=1&c=3')).toBe(
      'https://example.com/?a=1&b=2&c=3',
    );
  });

  it('treats bare origin as equivalent to origin with trailing slash', () => {
    expect(normalizeUrl('https://example.com')).toBe('https://example.com/');
    expect(normalizeUrl('https://example.com/')).toBe('https://example.com/');
  });

  it('preserves a trailing slash on a non-root path (no slash policy rewrite)', () => {
    expect(normalizeUrl('https://example.com/a/')).toBe('https://example.com/a/');
    expect(normalizeUrl('https://example.com/a')).toBe('https://example.com/a');
  });

  it('throws on an unparseable URL', () => {
    expect(() => normalizeUrl('not a url')).toThrow();
  });
});

describe('resolveUrl', () => {
  const base = 'https://example.com/dir/page';

  it('resolves a relative path against the base', () => {
    expect(resolveUrl(base, '../other')).toBe('https://example.com/other');
    expect(resolveUrl(base, 'child')).toBe('https://example.com/dir/child');
    expect(resolveUrl(base, '/root')).toBe('https://example.com/root');
  });

  it('returns an absolute URL normalized', () => {
    expect(resolveUrl(base, 'https://Other.com:443/X#f')).toBe('https://other.com/X');
  });

  it('returns null for non-http(s) schemes', () => {
    expect(resolveUrl(base, 'mailto:hi@example.com')).toBeNull();
    expect(resolveUrl(base, 'tel:+123456')).toBeNull();
    expect(resolveUrl(base, 'javascript:void(0)')).toBeNull();
    expect(resolveUrl(base, 'data:text/plain,hi')).toBeNull();
  });

  it('returns null for fragment-only and empty hrefs', () => {
    expect(resolveUrl(base, '#anchor')).toBeNull();
    expect(resolveUrl(base, '   ')).toBeNull();
    expect(resolveUrl(base, '')).toBeNull();
  });

  it('returns null for an unparseable href', () => {
    expect(resolveUrl(base, 'http://')).toBeNull();
  });
});

describe('classifyLink', () => {
  it('classifies same-host links as internal', () => {
    expect(classifyLink('https://example.com/a', 'https://example.com/b')).toBe('internal');
  });

  it('treats host case differences as internal', () => {
    expect(classifyLink('https://Example.com/a', 'https://example.COM/b')).toBe('internal');
  });

  it('classifies different hosts as external', () => {
    expect(classifyLink('https://example.com/a', 'https://other.com/b')).toBe('external');
  });

  it('treats www and non-www as different hosts (host equality)', () => {
    expect(classifyLink('https://example.com/a', 'https://www.example.com/b')).toBe('external');
  });

  it('returns external when a URL is unparseable', () => {
    expect(classifyLink('not a url', 'https://example.com')).toBe('external');
  });
});

describe('urlVariants', () => {
  it('produces www/non-www × http/https origin variants', () => {
    const variants = urlVariants('https://example.com/some/path');
    expect(variants.sort()).toEqual(
      [
        'http://example.com/',
        'http://www.example.com/',
        'https://example.com/',
        'https://www.example.com/',
      ].sort(),
    );
  });

  it('normalizes a www seed to the same variant set', () => {
    expect(urlVariants('https://www.example.com').sort()).toEqual(
      urlVariants('https://example.com').sort(),
    );
  });

  it('de-duplicates variants', () => {
    const variants = urlVariants('http://example.com');
    expect(new Set(variants).size).toBe(variants.length);
    expect(variants).toHaveLength(4);
  });
});
