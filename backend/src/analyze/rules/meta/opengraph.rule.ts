import { sql } from 'drizzle-orm';
import type { Finding, Rule } from '../../rule.types';

/** The persisted og_data shape (subset the rule validates). */
interface OgDataRow {
  ogTitle: string | null;
  ogDescription: string | null;
  ogImage: string | null;
  ogUrl: string | null;
  twitterCard: string | null;
}

/** Valid `twitter:card` values per the Twitter Cards spec. */
const VALID_TWITTER_CARDS = new Set(['summary', 'summary_large_image', 'app', 'player']);

/** True for a non-empty absolute http(s) URL. */
function isAbsoluteHttp(value: string | null): boolean {
  if (!value) return false;
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function isBlank(value: string | null): boolean {
  return value === null || value.trim().length === 0;
}

/**
 * `meta.opengraph` — missing / invalid Open Graph + Twitter Card social tags.
 *
 * Severity: low (kept out of the critical noise; promoted to medium per-row
 * when BOTH og:image and twitter:card are absent — no preview card at all).
 * Confidence: high (directly observed markup). Scoped to live HTML pages.
 *
 * SQL reads `og_data` for HTML 2xx pages; classification is JS (null vs partial
 * vs invalid). A page with no social tags at all (`og_data IS NULL`) emits a
 * single `no-social-metadata` issue rather than five.
 */
export const metaOpengraphRule: Rule = {
  id: 'meta.opengraph',
  description: 'Missing or invalid Open Graph / Twitter Card social metadata',
  severity: 'low',
  confidence: 'high',
  async run(db, auditId) {
    const res = await db.execute(sql`
      select url, og_data
      from pages
      where audit_id = ${auditId}
        and status_class = '2xx'
        and page_kind = 'html'
      order by url
    `);

    const findings: Finding[] = [];

    for (const row of res.rows) {
      const url = row.url as string;
      const og = row.og_data as OgDataRow | null;

      if (og === null) {
        findings.push({ url, detail: { issues: ['no-social-metadata'] } });
        continue;
      }

      const issues: string[] = [];
      if (isBlank(og.ogTitle)) issues.push('og:title-missing');
      if (isBlank(og.ogDescription)) issues.push('og:description-missing');
      if (isBlank(og.ogImage)) issues.push('og:image-missing');
      else if (!isAbsoluteHttp(og.ogImage)) issues.push('og:image-invalid');
      if (isBlank(og.ogUrl)) issues.push('og:url-missing');
      else if (!isAbsoluteHttp(og.ogUrl)) issues.push('og:url-invalid');
      const twitterCard = og.twitterCard;
      if (twitterCard === null || twitterCard.trim().length === 0)
        issues.push('twitter:card-missing');
      else if (!VALID_TWITTER_CARDS.has(twitterCard.trim().toLowerCase()))
        issues.push('twitter:card-invalid');

      if (issues.length === 0) continue;

      // No preview card at all (no og:image AND no twitter:card) → promote to medium.
      const noCardAtAll = isBlank(og.ogImage) && isBlank(og.twitterCard);

      findings.push({
        url,
        ...(noCardAtAll ? { severity: 'medium' as const } : {}),
        detail: {
          issues,
          ogTitle: og.ogTitle,
          ogImage: og.ogImage,
          twitterCard: og.twitterCard,
        },
      });
    }

    return findings;
  },
};
