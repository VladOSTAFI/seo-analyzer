import { sql } from 'drizzle-orm';
import type { Finding, Rule } from '../../rule.types';

type ReasonCode = 'missing-viewport' | 'no-device-width' | 'pins-scale';

/**
 * `mobile.viewport` — Missing or misconfigured responsive viewport (feature 11).
 *
 * Severity: medium. Confidence: high (exact HTML attribute, no layout needed).
 * HTML pages only.
 *
 * Flags pages that have no `<meta name=viewport>`, or whose `viewport_content`
 * lacks `width=device-width`, or that pin scale (`maximum-scale=1` /
 * `user-scalable=no`) — all of which break responsive rendering / pinch-zoom.
 * Selection is SQL; the `reason[]` is composed JS-side.
 *
 * detail: `{ reason[], viewportContent }`.
 */
export const mobileViewportRule: Rule = {
  id: 'mobile.viewport',
  description: 'Missing or non-responsive viewport meta (no device-width / pinned scale)',
  severity: 'medium',
  confidence: 'high',
  async run(db, auditId): Promise<Finding[]> {
    const res = await db.execute(sql`
      select url, has_viewport, viewport_content,
             (has_viewport is not true) as missing_viewport,
             (has_viewport = true and lower(coalesce(viewport_content, '')) not like '%width=device-width%') as no_device_width,
             (has_viewport = true and (
                lower(coalesce(viewport_content, '')) like '%user-scalable=no%'
                or lower(coalesce(viewport_content, '')) ~ 'maximum-scale\\s*=\\s*1([^0-9]|$)'
             )) as pins_scale
      from pages
      where audit_id = ${auditId}
        and page_kind = 'html'
        and (
          has_viewport is not true
          or lower(coalesce(viewport_content, '')) not like '%width=device-width%'
          or lower(coalesce(viewport_content, '')) like '%user-scalable=no%'
          or lower(coalesce(viewport_content, '')) ~ 'maximum-scale\\s*=\\s*1([^0-9]|$)'
        )
      order by url
    `);

    return res.rows.map((row): Finding => {
      const reason: ReasonCode[] = [];
      if (row.missing_viewport) reason.push('missing-viewport');
      if (row.no_device_width) reason.push('no-device-width');
      if (row.pins_scale) reason.push('pins-scale');
      return {
        url: row.url as string,
        detail: {
          reason,
          viewportContent: (row.viewport_content as string | null) ?? null,
        },
      };
    });
  },
};
