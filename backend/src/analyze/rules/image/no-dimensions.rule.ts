import { sql } from 'drizzle-orm';
import type { Finding, Rule } from '../../rule.types';

/**
 * `image.no-dimensions` — Images served without intrinsic width/height.
 *
 * Severity: low. Confidence: high.
 *
 * The root cause behind PSI `unsized-images` and a primary CLS driver: a browser
 * cannot reserve layout space for an image with no intrinsic `width`/`height`, so
 * content shifts as the image loads. Set-based scan of `images` where
 * `width is null or height is null` (the extraction-time intrinsic dimension
 * attrs, feature 09), deduped by distinct `(page_url, src)`.
 *
 * Detail: `{ src, width, height }`.
 */
export const imageNoDimensionsRule: Rule = {
  id: 'image.no-dimensions',
  description: 'Images missing intrinsic width/height (CLS / unsized-images)',
  severity: 'low',
  async run(db, auditId) {
    const result = await db.execute(sql`
      select distinct page_url, src, width, height
      from images
      where audit_id = ${auditId}
        and (width is null or height is null)
      order by page_url, src
    `);
    return result.rows.map(
      (row): Finding => ({
        url: row.page_url as string,
        detail: {
          src: row.src as string,
          width: (row.width as number | null) ?? null,
          height: (row.height as number | null) ?? null,
        },
      }),
    );
  },
};
