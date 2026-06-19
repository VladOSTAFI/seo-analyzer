import { sql } from 'drizzle-orm';
import type { Finding, Rule } from '../../rule.types';
import { IMAGE_LEGACY_MIN_BYTES } from './image-thresholds';

/**
 * `image.legacy-format` — Non-next-gen images large enough to benefit from WebP/AVIF.
 *
 * Severity: low. Confidence: high.
 *
 * The root cause behind PSI's `uses-webp-images`: a legacy raster format
 * (jpeg/png/gif) where a next-gen format (WebP/AVIF) would cut bytes. Set-based
 * scan of `page_resources` image rows where `format in ('jpeg','png','gif')` AND
 * `bytes >= IMAGE_LEGACY_MIN_BYTES` (default 50 KB) so tiny icons/sprites are not
 * flagged. Reads only the format/bytes populated by the image probe
 * (IMAGE_VERIFY_ENABLED) — silent until that pass runs. Deduped by distinct
 * `(page_url, src)`.
 *
 * Detail: `{ src, bytes, format }`.
 */
export const imageLegacyFormatRule: Rule = {
  id: 'image.legacy-format',
  description: 'Legacy-format images that should be served as WebP/AVIF',
  severity: 'low',
  async run(db, auditId) {
    const result = await db.execute(sql`
      select distinct page_url, src, bytes, format
      from page_resources
      where audit_id = ${auditId}
        and kind = 'image'
        and format in ('jpeg', 'png', 'gif')
        and bytes is not null
        and bytes >= ${IMAGE_LEGACY_MIN_BYTES}
      order by page_url, src
    `);
    return result.rows.map(
      (row): Finding => ({
        url: row.page_url as string,
        detail: {
          src: row.src as string,
          bytes: row.bytes as number,
          format: row.format as string,
        },
      }),
    );
  },
};
