import { sql } from 'drizzle-orm';
import type { Finding, Rule } from '../../rule.types';

/**
 * `image.alt-title` — Images missing `alt` text.
 *
 * Severity: low.
 *
 * SQL mechanism: `images` where `alt IS NULL OR alt = ''`, deduped by distinct
 * `(page_url, src)`. Both states are flagged at low severity, distinguished in
 * the detail via `altState`:
 *   - `missing` — `alt IS NULL` (attribute absent entirely), vs
 *   - `empty`   — `alt = ''` (present-but-empty, i.e. an explicit decorative
 *     image — usually intentional, hence still low and merely informative).
 */
export const imageAltTitleRule: Rule = {
  id: 'image.alt-title',
  description: 'Images missing `alt` (and/or `title`)',
  severity: 'low',
  async run(db, auditId) {
    const result = await db.execute(sql`
      select distinct page_url, src, alt
      from images
      where audit_id = ${auditId}
        and (alt is null or alt = '')
    `);
    return result.rows.map((row): Finding => {
      const alt = row.alt as string | null;
      return {
        url: row.page_url as string,
        detail: {
          src: row.src as string,
          alt,
          altState: alt === null ? 'missing' : 'empty',
        },
      };
    });
  },
};
