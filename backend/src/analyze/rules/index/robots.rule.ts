import { sql } from 'drizzle-orm';
import type { Finding, Rule } from '../../rule.types';

/**
 * `index.robots` — De-indexed pages that are nonetheless live (2xx).
 *
 * Severity: high. HTML pages only (content-type gated).
 *
 * A live page that is blocked from indexing is almost always a mistake. We flag
 * any fetched 2xx HTML page that is suppressed by `<meta name=robots>` noindex, an
 * `X-Robots-Tag: noindex` header, or a robots.txt disallow. The three source
 * signals are selected as booleans in SQL; the human-readable `reason` is
 * composed in JS so multiple simultaneous causes surface together (e.g. both a
 * meta-noindex and a robots-txt block on the same page).
 */
type ReasonCode = 'meta-noindex' | 'x-robots-noindex' | 'robots-txt-blocked';

export const indexRobotsRule: Rule = {
  id: 'index.robots',
  description: 'Noindex / robots-blocked pages that should be indexable',
  severity: 'high',
  async run(db, auditId) {
    const result = await db.execute(sql`
      select p.url as url,
             p.meta_robots as meta_robots,
             p.x_robots_tag as x_robots_tag,
             p.blocked_by_robots_txt as blocked_by_robots_txt,
             (p.meta_robots ilike '%noindex%') as meta_noindex,
             (p.x_robots_tag ilike '%noindex%') as x_robots_noindex,
             (p.blocked_by_robots_txt = true) as robots_txt_blocked
      from pages p
      where p.audit_id = ${auditId}
        and p.status_class = '2xx'
        and (p.content_type is null or p.content_type like 'text/html%')
        and (
          p.meta_robots ilike '%noindex%'
          or p.x_robots_tag ilike '%noindex%'
          or p.blocked_by_robots_txt = true
        )
      order by p.url
    `);

    return result.rows.map((row): Finding => {
      const reason: ReasonCode[] = [];
      if (row.meta_noindex) reason.push('meta-noindex');
      if (row.x_robots_noindex) reason.push('x-robots-noindex');
      if (row.robots_txt_blocked) reason.push('robots-txt-blocked');

      return {
        url: row.url as string,
        detail: {
          reason,
          metaRobots: (row.meta_robots as string | null) ?? null,
          xRobotsTag: (row.x_robots_tag as string | null) ?? null,
          blockedByRobotsTxt: Boolean(row.blocked_by_robots_txt),
        },
      };
    });
  },
};
