import { sql } from 'drizzle-orm';
import type { Finding, Rule } from '../../rule.types';

/**
 * Thresholds read directly from the environment (same discipline as the other
 * env-tuned rules). `SEO_THIN_WORDS` is the word-count floor; `SEO_THIN_RATIO`
 * is the minimum content-to-code ratio (visible-text-bytes ≈ words×6 over raw
 * HTML bytes). Positive defaults; invalid values fall back.
 */
function readIntEnv(name: string, def: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return def;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : def;
}
function readFloatEnv(name: string, def: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return def;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : def;
}
const THIN_WORDS = readIntEnv('SEO_THIN_WORDS', 200);
const THIN_RATIO = readFloatEnv('SEO_THIN_RATIO', 0.1);

/**
 * `content.thin` — Low-content pages (feature 08).
 *
 * Severity: medium. Confidence: high. Live 2xx HTML pages only.
 *
 * Pages under the word-count floor (or with a content-to-code ratio below the
 * threshold) rarely rank and dilute crawl budget. Pure SQL over the
 * extractor-stored `word_count` / `html_bytes`. The ratio approximates visible
 * text bytes as `word_count * 6` (avg word length) divided by raw HTML bytes.
 *
 * detail: `{ wordCount, ratio, reason: ('low-words'|'low-ratio')[] }`.
 */
export const contentThinRule: Rule = {
  id: 'content.thin',
  description: 'Thin / low-content pages (word count or content-to-code ratio below threshold)',
  severity: 'medium',
  confidence: 'high',
  async run(db, auditId): Promise<Finding[]> {
    const res = await db.execute(sql`
      select url,
             word_count,
             case when html_bytes > 0
                  then round((word_count::numeric * 6) / html_bytes, 4)
                  else null end as ratio,
             (word_count < ${THIN_WORDS}) as low_words,
             (html_bytes > 0 and (word_count::numeric * 6) / html_bytes < ${THIN_RATIO}) as low_ratio
      from pages
      where audit_id = ${auditId}
        and status_class = '2xx'
        and page_kind = 'html'
        and word_count is not null
        and ( word_count < ${THIN_WORDS}
              or (html_bytes > 0 and (word_count::numeric * 6) / html_bytes < ${THIN_RATIO}) )
      order by url
    `);

    return res.rows.map((row): Finding => {
      const reason: string[] = [];
      if (row.low_words) reason.push('low-words');
      if (row.low_ratio) reason.push('low-ratio');
      return {
        url: row.url as string,
        detail: {
          wordCount: Number(row.word_count),
          ratio: row.ratio === null ? null : Number(row.ratio),
          reason,
        },
      };
    });
  },
};
