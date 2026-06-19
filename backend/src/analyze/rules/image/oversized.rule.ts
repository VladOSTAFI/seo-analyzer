import { sql } from 'drizzle-orm';
import type { Finding, Rule } from '../../rule.types';
import { IMAGE_MAX_BYTES } from './image-thresholds';

/**
 * `image.oversized` — Images whose transfer weight exceeds the byte budget.
 *
 * Severity: medium. Confidence: high.
 *
 * The actionable root cause behind PSI's generic `uses-optimized-images`: a
 * specific, per-image "this file is too heavy" finding. Set-based scan of
 * `page_resources` image rows where `bytes >= IMAGE_MAX_BYTES` (default 200 KB),
 * deduped by distinct `(page_url, src)`. Reads only the byte weight populated by
 * the image probe (IMAGE_VERIFY_ENABLED) — silent until that pass runs.
 *
 * Detail: `{ src, bytes, format }`.
 */
export const imageOversizedRule: Rule = {
  id: 'image.oversized',
  description: 'Images heavier than the byte budget (compress / resize)',
  severity: 'medium',
  async run(db, auditId) {
    const result = await db.execute(sql`
      select distinct page_url, src, bytes, format
      from page_resources
      where audit_id = ${auditId}
        and kind = 'image'
        and bytes is not null
        and bytes >= ${IMAGE_MAX_BYTES}
      order by page_url, src
    `);
    return result.rows.map(
      (row): Finding => ({
        url: row.page_url as string,
        detail: {
          src: row.src as string,
          bytes: row.bytes as number,
          format: (row.format as string | null) ?? null,
        },
      }),
    );
  },
};
