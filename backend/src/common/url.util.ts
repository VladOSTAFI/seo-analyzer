/**
 * Shared URL utilities used by both the crawler (dedup) and the enrichment stage
 * (link JOIN matching). These MUST be the single source of truth for URL
 * canonicalization: if crawl and enrich normalized differently, the link→page
 * joins would silently miss (see §8 of the implementation plan).
 *
 * Trailing-slash policy: the path is preserved as-is (we do NOT strip or append
 * trailing slashes on arbitrary paths, because `/a` and `/a/` can legitimately be
 * different resources). The one normalization we apply is at the bare origin:
 * `https://h` and `https://h/` are treated as equivalent (both canonicalize to
 * `https://h/`), since the URL spec already treats those as the same resource.
 */

/** True for http: / https: only. */
function isHttpProtocol(protocol: string): boolean {
  return protocol === 'http:' || protocol === 'https:';
}

/**
 * Canonicalize a URL string:
 *  - lowercase the scheme and host,
 *  - strip the default port (80 for http, 443 for https),
 *  - remove any #fragment,
 *  - sort query parameters by key (stable, preserves duplicate keys' values),
 *  - preserve the path verbatim (bare origin normalizes to a single "/").
 *
 * Throws if `input` is not a parseable absolute URL.
 */
export function normalizeUrl(input: string): string {
  const u = new URL(input);

  u.protocol = u.protocol.toLowerCase();
  u.hostname = u.hostname.toLowerCase();
  u.hash = '';

  // Strip default ports. WHATWG URL already drops these when the protocol
  // matches, but be explicit for non-default-but-equivalent inputs.
  if (
    (u.protocol === 'http:' && u.port === '80') ||
    (u.protocol === 'https:' && u.port === '443')
  ) {
    u.port = '';
  }

  // Sort query params deterministically by key.
  u.searchParams.sort();

  return u.toString();
}

/**
 * Resolve a possibly-relative `href` against `base` into an absolute URL.
 * Returns null for non-http(s) schemes (mailto:, tel:, javascript:, data:),
 * fragment-only links (`#foo`), and anything unparseable.
 */
export function resolveUrl(base: string, href: string): string | null {
  const raw = href.trim();
  if (!raw || raw.startsWith('#')) {
    return null;
  }

  let resolved: URL;
  try {
    resolved = new URL(raw, base);
  } catch {
    return null;
  }

  if (!isHttpProtocol(resolved.protocol)) {
    return null;
  }

  return normalizeUrl(resolved.toString());
}

/**
 * Classify a link relative to its source page. Kept deliberately simple: two
 * URLs are internal when their (normalized) hostnames match exactly. Returns
 * 'external' if either URL is unparseable.
 */
export function classifyLink(fromUrl: string, toUrl: string): 'internal' | 'external' {
  try {
    const from = new URL(fromUrl).hostname.toLowerCase();
    const to = new URL(toUrl).hostname.toLowerCase();
    return from === to ? 'internal' : 'external';
  } catch {
    return 'external';
  }
}

/**
 * Generate the www/non-www × http/https variants of a seed URL (origin only,
 * normalized). Used by the main-mirror check to probe whether the site is
 * reachable on multiple host/scheme variants without a canonical redirect.
 * Returns a de-duplicated list. Throws if `seedUrl` is unparseable.
 */
export function urlVariants(seedUrl: string): string[] {
  const u = new URL(seedUrl);
  const host = u.hostname.toLowerCase();
  const bareHost = host.startsWith('www.') ? host.slice(4) : host;
  const wwwHost = `www.${bareHost}`;

  const variants: string[] = [];
  for (const scheme of ['http', 'https']) {
    for (const h of [bareHost, wwwHost]) {
      variants.push(normalizeUrl(`${scheme}://${h}/`));
    }
  }

  return [...new Set(variants)];
}
