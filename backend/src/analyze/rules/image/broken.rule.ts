import { sql } from 'drizzle-orm';
import type { Finding, Rule } from '../../rule.types';

/**
 * `image.broken` — Images returning 4xx/5xx.
 *
 * Severity: medium.
 *
 * SQL mechanism: `images` where `status_code >= 400`, deduped by distinct
 * `(page_url, src, status_code)`.
 *
 * LIMITATION: enrichment (Phase 2) only set `images.status_code` when the
 * image's `src` matched a crawled `pages.url`, so this rule fires rarely today.
 * A live HTTP HEAD-check pass over every image src is the intended way to
 * surface broken images and is a deferred enhancement — this rule deliberately
 * makes NO network calls and reads only the enriched column.
 */
export const imageBrokenRule: Rule = {
  id: 'image.broken',
  description: 'Images returning 4xx/5xx',
  severity: 'medium',
  async run(db, auditId) {
    const result = await db.execute(sql`
      select distinct page_url, src, status_code
      from images
      where audit_id = ${auditId}
        and status_code >= 400
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
