import { sql } from 'drizzle-orm';
import type { Finding, Rule } from '../../rule.types';

/**
 * `image.broken` — Images returning 4xx/5xx.
 *
 * Severity: medium.
 *
 * SQL mechanism: an image is broken when its enriched status is >= 400 in EITHER
 * source — the legacy `images.status_code` (set when an image src matched a
 * crawled page, or by the image probe) OR the new `page_resources` image rows
 * (populated by the feature-09 image probe, gated by IMAGE_VERIFY_ENABLED). The
 * UNION+DISTINCT folds both so a broken image is reported once per
 * `(page_url, src, status_code)`.
 *
 * This rule makes NO network calls — it reads only the enriched columns. It is
 * silent until the probe pass runs (IMAGE_VERIFY_ENABLED, default off), unless an
 * image src happened to be crawled as a page.
 */
export const imageBrokenRule: Rule = {
  id: 'image.broken',
  description: 'Images returning 4xx/5xx',
  severity: 'medium',
  async run(db, auditId) {
    const result = await db.execute(sql`
      select distinct page_url, src, status_code
      from (
        select page_url, src, status_code
        from images
        where audit_id = ${auditId}
          and status_code >= 400
        union
        select page_url, src, status_code
        from page_resources
        where audit_id = ${auditId}
          and kind = 'image'
          and status_code >= 400
      ) broken
      order by page_url, src
    `);
    return result.rows.map(
      (row): Finding => ({
        url: row.page_url as string,
        detail: {
          src: row.src as string,
          statusCode: row.status_code as number,
        },
      }),
    );
  },
};
