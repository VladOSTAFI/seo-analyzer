import { sql } from 'drizzle-orm';
import type { Finding, Rule } from '../../rule.types';
import { IMAGE_ALT_MAX_COMMAS, IMAGE_ALT_MAX_LEN } from './image-thresholds';

/**
 * `image.alt-quality` — Present-but-poor alt text.
 *
 * Severity: low. Confidence: medium (heuristic classification).
 *
 * Complements `image.alt-title` (which owns the missing/empty cases): this rule
 * grades the QUALITY of non-empty alt text, over the already-stored `alt`/`src`
 * (no extraction change). Scoped to rows where `alt is not null and alt <> ''`
 * and classified (first match wins):
 *   - `filename-as-alt` — alt equals the src basename (with or without its
 *     extension) — a CMS-default placeholder that conveys nothing;
 *   - `too-long` — `length(alt) > IMAGE_ALT_MAX_LEN` (default 125): concise,
 *     descriptive alt is best;
 *   - `keyword-stuffed` — a comma-list of `>= IMAGE_ALT_MAX_COMMAS` items
 *     (default 4), the portable stuffing heuristic from the plan.
 * Emits only rows where a quality issue was detected, deduped by distinct
 * `(page_url, src)`.
 *
 * Detail: `{ src, alt, qualityIssue }`.
 */
type QualityIssue = 'filename-as-alt' | 'too-long' | 'keyword-stuffed';

export const imageAltQualityRule: Rule = {
  id: 'image.alt-quality',
  description: 'Present alt text that is filename-as-alt, over-long, or keyword-stuffed',
  severity: 'low',
  confidence: 'medium',
  async run(db, auditId) {
    const result = await db.execute(sql`
      select page_url, src, alt, quality_issue
      from (
        select distinct page_url, src, alt,
          case
            when lower(alt) = lower(regexp_replace(src, '^.*/', ''))
              or lower(alt) = lower(regexp_replace(regexp_replace(src, '^.*/', ''), '\\.[a-z0-9]+$', ''))
              then 'filename-as-alt'
            when length(alt) > ${IMAGE_ALT_MAX_LEN} then 'too-long'
            when (length(alt) - length(replace(alt, ',', ''))) >= ${IMAGE_ALT_MAX_COMMAS}
              then 'keyword-stuffed'
            else null
          end as quality_issue
        from images
        where audit_id = ${auditId}
          and alt is not null
          and alt <> ''
      ) classified
      where quality_issue is not null
      order by page_url, src
    `);
    return result.rows.map(
      (row): Finding => ({
        url: row.page_url as string,
        confidence: 'medium',
        detail: {
          src: row.src as string,
          alt: row.alt as string,
          qualityIssue: row.quality_issue as QualityIssue,
        },
      }),
    );
  },
};
