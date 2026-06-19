import { sql } from 'drizzle-orm';
import type { Rule } from '../../rule.types';

/**
 * SERP pixel-width bounds (feature 08 refinement). Env-tuned: a title narrower
 * than `SEO_TITLE_PX_MIN` is `too-short`, wider than `SEO_TITLE_PX_MAX` (the
 * ~580px desktop SERP cap) is `too-long`. Positive defaults; invalid fall back.
 */
function readIntEnv(name: string, def: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return def;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : def;
}
const TITLE_PX_MIN = readIntEnv('SEO_TITLE_PX_MIN', 200);
const TITLE_PX_MAX = readIntEnv('SEO_TITLE_PX_MAX', 580);

/**
 * `meta.title.template` — Title pixel width is outside the SERP-friendly band.
 *
 * Severity: info. Scoped to live (2xx) HTML pages with a title. Refined in
 * feature 08 to decide too-short/too-long by the extractor-stored ESTIMATED
 * PIXEL WIDTH (`title_px`) rather than `char_length`, since SERP truncation is
 * pixel-based — so a wide-glyph short title ("WWW Mortgage") is correctly
 * flagged too-long where the old char rule passed it. ruleId UNCHANGED.
 *
 * detail: `{ title, length (=pixelWidth), pixelWidth, recommendation }`.
 */
export const metaTitleTemplateRule: Rule = {
  id: 'meta.title.template',
  description: 'Recommend title template (SERP pixel-width guidance)',
  severity: 'info',
  async run(db, auditId) {
    const res = await db.execute(sql`
      select url, title->>0 as val, title_px as px
      from pages
      where audit_id = ${auditId}
        and status_class = '2xx'
        and page_kind = 'html'
        and jsonb_array_length(title) >= 1
        and title_px is not null
        and (title_px < ${TITLE_PX_MIN} or title_px > ${TITLE_PX_MAX})
      order by url
    `);
    return res.rows.map((r) => {
      const pixelWidth = Number(r.px);
      return {
        url: r.url as string,
        detail: {
          title: r.val,
          length: pixelWidth,
          pixelWidth,
          recommendation: pixelWidth < TITLE_PX_MIN ? 'too-short' : 'too-long',
        },
      };
    });
  },
};
