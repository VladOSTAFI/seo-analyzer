import { sql } from 'drizzle-orm';
import type { Finding, Rule } from '../../rule.types';

/**
 * `sitemap.invalid` — file-level sitemap validity (feature 03).
 *
 * Severity: high. Confidence: high.
 *
 * Reads the per-file validity persisted on `audits.sitemap_audit` by the
 * SitemapService and emits one finding per INVALID file (malformed XML, limit
 * exceeded, fetch failure). Keyed on the sitemap file URL (not a page), so the
 * finding `url` is the file URL. Pure jsonb read; no per-row Node work.
 */
export const sitemapInvalidRule: Rule = {
  id: 'sitemap.invalid',
  description: 'XML sitemap file is malformed, over the protocol limits, or unreachable',
  severity: 'high',
  async run(db, auditId) {
    const result = await db.execute(sql`
      select
        file->>'url'      as url,
        file->'errors'    as errors,
        file->>'urlCount' as url_count,
        file->>'bytes'    as bytes
      from audits a,
           jsonb_array_elements(coalesce(a.sitemap_audit->'files', '[]'::jsonb)) as file
      where a.id = ${auditId}
        and (file->>'valid')::boolean = false
    `);

    return result.rows.map((row): Finding => {
      const errors = Array.isArray(row.errors) ? (row.errors as string[]) : [];
      return {
        url: (row.url as string | null) ?? null,
        detail: {
          errors,
          urlCount: row.url_count != null ? Number(row.url_count) : null,
          bytes: row.bytes != null ? Number(row.bytes) : null,
        },
      };
    });
  },
};
