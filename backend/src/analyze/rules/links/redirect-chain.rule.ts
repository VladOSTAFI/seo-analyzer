import { sql } from 'drizzle-orm';
import type { Rule } from '../../rule.types';

/**
 * `links.redirect-chain` — Pages resolving through >1 redirect hop / loops.
 *
 * Severity: high.
 *
 * Page-centric per the catalogue mechanism: reads the stored `pages.redirect_chain`
 * jsonb (no dedicated column). A chain has `jsonb_array_length > 1`. A loop is detected
 * set-based by comparing the array length against the count of DISTINCT `elem->>'url'`:
 * when length > distinct-url-count some url repeats ⇒ loop. This mirrors the
 * loop-detection SQL in {@link EnrichService.collectSummary}. Findings emit on the
 * PAGE url.
 */
export const linksRedirectChainRule: Rule = {
  id: 'links.redirect-chain',
  description: 'Internal links resolving through >1 redirect hop / loops',
  severity: 'high',
  async run(db, auditId) {
    const result = await db.execute(sql`
      select
        url,
        jsonb_array_length(redirect_chain) as hops,
        redirect_chain as chain,
        jsonb_array_length(redirect_chain) > (
          select count(distinct elem->>'url')
          from jsonb_array_elements(redirect_chain) as elem
        ) as is_loop
      from pages
      where audit_id = ${auditId}
        and jsonb_array_length(redirect_chain) > 1
    `);
    return result.rows.map((row) => ({
      url: row.url as string,
      detail: {
        hops: Number(row.hops),
        isLoop: Boolean(row.is_loop),
        chain: row.chain,
      },
    }));
  },
};
