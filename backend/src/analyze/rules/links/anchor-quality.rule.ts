import { sql } from 'drizzle-orm';
import type { Finding, Rule, Severity } from '../../rule.types';

/**
 * Default generic-anchor phrases (case-insensitive, multilingual). Matched as
 * WHOLE trimmed strings (not substrings) so descriptive anchors containing these
 * words are not over-flagged. Overridable via the `LINK_GENERIC_ANCHORS` env var
 * (comma-separated). Read at rule-build time, same idiom as the other env-driven
 * rules in this package.
 */
const DEFAULT_GENERIC_ANCHORS = [
  'click here',
  'read more',
  'learn more',
  'more',
  'here',
  'this',
  'link',
  'подробнее',
  'читать далее',
  'тут',
  'сюди',
  'детальніше',
];

const genericAnchors = (
  process.env.LINK_GENERIC_ANCHORS
    ? process.env.LINK_GENERIC_ANCHORS.split(',')
    : DEFAULT_GENERIC_ANCHORS
)
  .map((s) => s.trim().toLowerCase())
  .filter((s) => s.length > 0);

/**
 * `links.anchor-quality` — Internal anchors that give Google no relevance signal.
 *
 * Severity: per-row override — `generic` → low, `empty`/`image-link-missing-alt`
 * → medium. Confidence: high.
 *
 * Set-based scan of `links` where `type = 'internal'`, classifying each anchor:
 *   - `image-link-missing-alt` — the `<a>` wraps only an `<img>` with no alt
 *     (`anchor_is_bare_image AND image_alt_missing`, captured at extraction time,
 *     feature 10 §3.4) — checked FIRST so a bare-image link is not also counted
 *     as `empty`;
 *   - `empty`   — `anchor_text is null or anchor_text = ''`;
 *   - `generic` — `lower(btrim(anchor_text))` is one of a configurable,
 *     multilingual generic-phrase list (whole-string match, not substring).
 *
 * External anchors are ignored (they matter far less for ranking). Findings are
 * emitted on the SOURCE page, deduped by distinct `(source_url, href, anchor_text)`.
 *
 * Detail: `{ href, anchorText, anchorIssue }`.
 */
type AnchorIssue = 'image-link-missing-alt' | 'empty' | 'generic';

export const linksAnchorQualityRule: Rule = {
  id: 'links.anchor-quality',
  description: 'Internal links with empty, generic, or image-only (no-alt) anchor text',
  severity: 'low',
  async run(db, auditId) {
    // Build the generic-anchor IN-list as a SQL value list.
    const genericList = sql.join(
      genericAnchors.map((a) => sql`${a}`),
      sql`, `,
    );

    const result = await db.execute(sql`
      select source_url, href, anchor_text, anchor_issue
      from (
        select distinct source_url, href, anchor_text,
          case
            when anchor_is_bare_image and image_alt_missing then 'image-link-missing-alt'
            when anchor_text is null or anchor_text = '' then 'empty'
            when lower(btrim(anchor_text)) in (${genericList}) then 'generic'
            else null
          end as anchor_issue
        from links
        where audit_id = ${auditId}
          and type = 'internal'
      ) classified
      where anchor_issue is not null
      order by source_url, href
    `);

    return result.rows.map((row): Finding => {
      const anchorIssue = row.anchor_issue as AnchorIssue;
      const severity: Severity = anchorIssue === 'generic' ? 'low' : 'medium';
      return {
        url: row.source_url as string,
        severity,
        detail: {
          href: row.href as string,
          anchorText: (row.anchor_text as string | null) ?? null,
          anchorIssue,
        },
      };
    });
  },
};
