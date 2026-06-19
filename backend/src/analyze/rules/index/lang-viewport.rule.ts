import { sql } from 'drizzle-orm';
import type { Finding, Rule } from '../../rule.types';

type ReasonCode = 'missing-lang' | 'missing-charset' | 'missing-viewport';

/**
 * `index.lang-viewport` — Pages missing `<html lang>`, charset, or a viewport
 * meta (feature 08).
 *
 * Severity: medium. Confidence: high. Live 2xx HTML pages only.
 *
 * Missing `lang` hurts i18n + accessibility; missing charset risks mojibake;
 * missing viewport breaks mobile rendering. Pure SQL selection; the
 * human-readable `reason[]` is composed JS-side so multiple simultaneous causes
 * surface together (mirrors `index.robots`). NB: `mobile.viewport` (feature 11)
 * covers viewport CONFIG quality (width=device-width etc.); this rule covers
 * mere PRESENCE.
 *
 * detail: `{ reason[], htmlLang, charset, hasViewport }`.
 */
export const indexLangViewportRule: Rule = {
  id: 'index.lang-viewport',
  description: 'Pages missing <html lang>, charset, or a viewport meta',
  severity: 'medium',
  confidence: 'high',
  async run(db, auditId): Promise<Finding[]> {
    const res = await db.execute(sql`
      select url,
             html_lang,
             charset,
             has_viewport,
             (html_lang is null or html_lang = '') as missing_lang,
             (charset   is null or charset   = '') as missing_charset,
             (has_viewport is not true)            as missing_viewport
      from pages
      where audit_id = ${auditId}
        and status_class = '2xx'
        and page_kind = 'html'
        and ( (html_lang is null or html_lang = '')
           or (charset   is null or charset   = '')
           or has_viewport is not true )
      order by url
    `);

    return res.rows.map((row): Finding => {
      const reason: ReasonCode[] = [];
      if (row.missing_lang) reason.push('missing-lang');
      if (row.missing_charset) reason.push('missing-charset');
      if (row.missing_viewport) reason.push('missing-viewport');
      return {
        url: row.url as string,
        detail: {
          reason,
          htmlLang: (row.html_lang as string | null) ?? null,
          charset: (row.charset as string | null) ?? null,
          hasViewport: Boolean(row.has_viewport),
        },
      };
    });
  },
};
