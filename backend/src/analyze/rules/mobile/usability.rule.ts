import { sql } from 'drizzle-orm';
import type { Finding, Rule } from '../../rule.types';

/**
 * `mobile.usability` — Static mobile-usability smells (feature 11).
 *
 * Severity: low. Confidence: medium (ESTIMATED — no layout/rendering). HTML
 * pages only.
 *
 * Surfaces the extractor's static heuristics stored in `mobile_usability_issues`
 * (illegibly small inline `font-size`, fixed-pixel-width containers wider than a
 * phone). These are the fixable root causes behind PSI mobile-usability flags;
 * the rule upgrades to `high` confidence once the Playwright render path can
 * measure tap-targets/fonts precisely. Only pages with at least one heuristic
 * hit fire.
 *
 * detail: `{ issues: string[] }`.
 */
export const mobileUsabilityRule: Rule = {
  id: 'mobile.usability',
  description: 'Static mobile-usability heuristics (tiny inline fonts / fixed-width overflow)',
  severity: 'low',
  confidence: 'medium',
  async run(db, auditId): Promise<Finding[]> {
    const res = await db.execute(sql`
      select url, mobile_usability_issues
      from pages
      where audit_id = ${auditId}
        and status_class = '2xx'
        and page_kind = 'html'
        and jsonb_array_length(coalesce(mobile_usability_issues, '[]'::jsonb)) >= 1
      order by url
    `);

    return res.rows.map(
      (row): Finding => ({
        url: row.url as string,
        detail: { issues: (row.mobile_usability_issues as string[]) ?? [] },
      }),
    );
  },
};
