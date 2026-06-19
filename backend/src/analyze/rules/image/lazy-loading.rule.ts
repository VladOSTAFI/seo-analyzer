import { sql } from 'drizzle-orm';
import type { Finding, Rule } from '../../rule.types';

/**
 * `image.lazy-loading` — Images not using native `loading="lazy"`.
 *
 * Severity: info. Confidence: medium.
 *
 * Below-the-fold images that eagerly load compete for bandwidth with the LCP
 * element and slow the page. Set-based scan of `images` where
 * `loading is null or loading <> 'lazy'` (the extraction-time `loading` attr,
 * feature 09). We deliberately keep this at INFO / medium confidence and word the
 * recommendation as "below the fold": the true LCP image SHOULD stay eager, and
 * document order is not stored, so this is advisory rather than a hard failure.
 * Deduped by distinct `(page_url, src)`.
 *
 * Detail: `{ src, loading }`.
 */
export const imageLazyLoadingRule: Rule = {
  id: 'image.lazy-loading',
  description: 'Images without native loading="lazy" (defer below-the-fold images)',
  severity: 'info',
  confidence: 'medium',
  async run(db, auditId) {
    const result = await db.execute(sql`
      select distinct page_url, src, loading
      from images
      where audit_id = ${auditId}
        and (loading is null or loading <> 'lazy')
      order by page_url, src
    `);
    return result.rows.map(
      (row): Finding => ({
        url: row.page_url as string,
        confidence: 'medium',
        detail: {
          src: row.src as string,
          loading: (row.loading as string | null) ?? null,
        },
      }),
    );
  },
};
