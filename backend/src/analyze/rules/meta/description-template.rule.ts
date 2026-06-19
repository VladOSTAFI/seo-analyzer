import { sql } from 'drizzle-orm';
import type { Rule } from '../../rule.types';

/**
 * SERP pixel-width bounds (feature 08 refinement). Env-tuned: a description
 * narrower than `SEO_DESC_PX_MIN` is `too-short`, wider than `SEO_DESC_PX_MAX`
 * (the ~920px desktop SERP cap) is `too-long`. Positive defaults; invalid fall
 * back.
 */
function readIntEnv(name: string, def: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return def;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : def;
}
const DESC_PX_MIN = readIntEnv('SEO_DESC_PX_MIN', 430);
const DESC_PX_MAX = readIntEnv('SEO_DESC_PX_MAX', 920);

/**
 * `meta.description.template` — Description pixel width is outside the
 * SERP-friendly band.
 *
 * Severity: info. Scoped to live (2xx) HTML pages with a description. Refined in
 * feature 08 to decide too-short/too-long by the extractor-stored ESTIMATED
 * PIXEL WIDTH (`desc_px`) rather than `char_length`. ruleId UNCHANGED.
 *
 * detail: `{ description, length (=pixelWidth), pixelWidth, recommendation }`.
 */
export const metaDescriptionTemplateRule: Rule = {
  id: 'meta.description.template',
  description: 'Recommend description template (SERP pixel-width guidance)',
  severity: 'info',
  async run(db, auditId) {
    const res = await db.execute(sql`
      select url, meta_description->>0 as val, desc_px as px
      from pages
      where audit_id = ${auditId}
        and status_class = '2xx'
        and page_kind = 'html'
        and jsonb_array_length(meta_description) >= 1
        and desc_px is not null
        and (desc_px < ${DESC_PX_MIN} or desc_px > ${DESC_PX_MAX})
      order by url
    `);
    return res.rows.map((r) => {
      const pixelWidth = Number(r.px);
      return {
        url: r.url as string,
        detail: {
          description: r.val,
          length: pixelWidth,
          pixelWidth,
          recommendation: pixelWidth < DESC_PX_MIN ? 'too-short' : 'too-long',
        },
      };
    });
  },
};
