import { sql } from 'drizzle-orm';
import type { Finding, Rule } from '../../rule.types';

/**
 * `dupe.content` — Duplicate pages by content hash.
 *
 * Severity: high. HTML pages only (content-type gated).
 *
 * SQL mechanism: an inner aggregate over fetched 2xx HTML pages with a non-null
 * `content_hash` (`GROUP BY content_hash HAVING count(*) > 1`) identifies the
 * shared hashes; joining that back to the page rows yields every page that
 * participates in a duplicate group. Hashes that are NULL (no body captured)
 * never group, so they are excluded up front.
 *
 * Emission: ONE finding per duplicate GROUP (not per page). The finding's `url`
 * is the group's origin — the shortest URL, alphabetical tiebreak, which tends
 * to surface the canonical/short page (e.g. `/` over `/uk/`). `detail.duplicateUrls`
 * lists the OTHER URLs sharing that exact content, so the page can present the
 * relationship ("origin + the URLs that duplicate it") directly instead of a
 * raw content hash. `duplicateCount` is the size of the whole group.
 *
 * Redirecting URLs are excluded (`redirect_chain` empty): `got` follows
 * redirects transparently, so a requested URL that 301s is persisted with the
 * FINAL page's 2xx status and the FINAL page's body/content_hash. That row has
 * no content of its own — it is the destination's — so it would falsely collide
 * with its own redirect target as a "duplicate". A non-empty `redirect_chain`
 * means the requested URL differs from where the body came from, so we treat it
 * as a redirect (not a content page) and exclude it from the group entirely.
 */
export const dupeContentRule: Rule = {
  id: 'dupe.content',
  description: 'Duplicate pages by content hash',
  severity: 'high',
  async run(db, auditId) {
    const result = await db.execute(sql`
      select p.url as url,
             p.content_hash as content_hash
      from pages p
      join (
        select content_hash
        from pages
        where audit_id = ${auditId}
          and status_class = '2xx'
          and (content_type is null or content_type like 'text/html%')
          and content_hash is not null
          and coalesce(jsonb_array_length(redirect_chain), 0) = 0
        group by content_hash
        having count(*) > 1
      ) g on g.content_hash = p.content_hash
      where p.audit_id = ${auditId}
        and p.status_class = '2xx'
        and (p.content_type is null or p.content_type like 'text/html%')
        and p.content_hash is not null
        and coalesce(jsonb_array_length(p.redirect_chain), 0) = 0
      order by p.content_hash, p.url
    `);

    // Group the flat page rows by content hash, then emit one finding per group.
    const groups = new Map<string, string[]>();
    for (const row of result.rows) {
      const hash = row.content_hash as string;
      const url = row.url as string;
      const urls = groups.get(hash);
      if (urls) urls.push(url);
      else groups.set(hash, [url]);
    }

    // Origin = shortest URL (alphabetical tiebreak) — favours the canonical/short
    // page; the rest are the URLs that duplicate it.
    const pickOrigin = (urls: string[]): string =>
      [...urls].sort((a, b) => a.length - b.length || a.localeCompare(b))[0];

    const findings: Finding[] = [];
    for (const [contentHash, urls] of groups) {
      const origin = pickOrigin(urls);
      const duplicateUrls = urls.filter((u) => u !== origin).sort();
      findings.push({
        url: origin,
        detail: {
          contentHash,
          duplicateCount: urls.length,
          duplicateUrls,
        },
      });
    }
    // Stable output: order groups by their origin URL.
    findings.sort((a, b) => (a.url ?? '').localeCompare(b.url ?? ''));
    return findings;
  },
};
