import { sql } from 'drizzle-orm';
import type { Finding, Rule } from '../../rule.types';

/**
 * `i18n.hreflang` — hreflang non-reciprocal / bad lang codes.
 *
 * Severity: medium.
 *
 * SQL mechanism: over `hreflang_entries` (reciprocity enriched in Phase 2), an
 * entry is flagged when it has at least one of:
 *   - `non-reciprocal` — `is_reciprocal = false OR is_reciprocal IS NULL`
 *     (the target page declares no return hreflang back to this page), or
 *   - `invalid-lang`   — the `lang` value is neither `x-default` nor a valid
 *     BCP-47-ish tag `^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$` (case-insensitive `~*`).
 *
 * Validity + reciprocity are computed in SQL as booleans; the issue list is
 * assembled in JS projection (composing both labels when both apply). Only
 * entries with ≥1 issue are emitted.
 */
export const i18nHreflangRule: Rule = {
  id: 'i18n.hreflang',
  description: 'hreflang non-reciprocal / missing return tags / bad lang codes',
  severity: 'medium',
  async run(db, auditId) {
    const result = await db.execute(sql`
      select
        page_url as page_url,
        lang     as lang,
        href     as href,
        (is_reciprocal is not true) as non_reciprocal,
        not (
          lang = 'x-default'
          or lang ~* '^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$'
        ) as invalid_lang
      from hreflang_entries
      where audit_id = ${auditId}
        and (
          is_reciprocal is not true
          or not (
            lang = 'x-default'
            or lang ~* '^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$'
          )
        )
    `);
    return result.rows.map((row): Finding => {
      const issues: string[] = [];
      if (row.non_reciprocal === true) issues.push('non-reciprocal');
      if (row.invalid_lang === true) issues.push('invalid-lang');
      return {
        url: row.page_url as string,
        detail: {
          lang: row.lang as string,
          href: row.href as string,
          issue: issues.join(','),
        },
      };
    });
  },
};
