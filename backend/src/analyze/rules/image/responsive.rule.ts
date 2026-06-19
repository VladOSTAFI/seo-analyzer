import { sql } from 'drizzle-orm';
import type { Finding, Rule } from '../../rule.types';
import { IMAGE_RESPONSIVE_MIN_WIDTH } from './image-thresholds';

/**
 * `image.responsive` — Large images served without responsive hints.
 *
 * Severity: low. Confidence: medium (heuristic — without the displayed size we
 * estimate from intrinsic width).
 *
 * The root cause behind PSI `uses-responsive-images`: a large image with no
 * `srcset` forces every viewport to download the same (too-large) file. Set-based
 * scan of `images` where `has_srcset = false` AND the image is plausibly large —
 * `width is null OR width >= IMAGE_RESPONSIVE_MIN_WIDTH` (default 640) — so small,
 * fixed-size UI images are not flagged. `has_srcset` is captured at extraction
 * (feature 09) and includes a parent `<picture><source srcset>`. Deduped by
 * distinct `(page_url, src)`.
 *
 * Detail: `{ src, width, hasSrcset }`.
 */
export const imageResponsiveRule: Rule = {
  id: 'image.responsive',
  description: 'Large images without srcset/sizes responsive hints',
  severity: 'low',
  confidence: 'medium',
  async run(db, auditId) {
    const result = await db.execute(sql`
      select distinct page_url, src, width
      from images
      where audit_id = ${auditId}
        and has_srcset = false
        and (width is null or width >= ${IMAGE_RESPONSIVE_MIN_WIDTH})
      order by page_url, src
    `);
    return result.rows.map(
      (row): Finding => ({
        url: row.page_url as string,
        confidence: 'medium',
        detail: {
          src: row.src as string,
          width: (row.width as number | null) ?? null,
          hasSrcset: false,
        },
      }),
    );
  },
};
