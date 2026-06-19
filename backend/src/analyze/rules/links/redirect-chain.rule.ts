import { sql } from 'drizzle-orm';
import type { Rule } from '../../rule.types';

/**
 * `links.redirect-chain` — Pages resolving through >1 redirect hop / loops.
 *
 * Severity: high.
 *
 * Page-centric per the catalogue mechanism: reads the stored `pages.redirect_chain`
 * jsonb (no dedicated column). The chain is stored origin-inclusive — element 0 is
 * the requested URL and each subsequent element is a redirect hop — so the number
 * of redirect HOPS is `jsonb_array_length - 1`. A finding fires only for a GENUINE
 * multi-hop chain (more than one hop ⇒ `jsonb_array_length > 2`) OR a loop. A loop
 * is detected set-based by comparing the array length against the count of DISTINCT
 * `elem->>'url'`: when length > distinct-url-count some url repeats ⇒ loop. A single
 * 301 (chain length 2, one hop) is intentionally NOT flagged. This mirrors the
 * loop-detection SQL in {@link EnrichService.collectSummary}. Findings emit on the
 * PAGE url; `detail.hops` is the redirect-hop count (length - 1).
 */
export const linksRedirectChainRule: Rule = {
  id: 'links.redirect-chain',
  description: 'Internal links resolving through >1 redirect hop / loops',
  severity: 'high',
  async run(db, auditId) {
    const result = await db.execute(sql`
      select
        url,
        jsonb_array_length(redirect_chain) - 1 as hops,
        redirect_chain as chain,
        jsonb_array_length(redirect_chain) > (
          select count(distinct elem->>'url')
          from jsonb_array_elements(redirect_chain) as elem
        ) as is_loop
      from pages
      where audit_id = ${auditId}
        and (
          -- genuine multi-hop chain: more than one redirect hop (length - 1 > 1)
          jsonb_array_length(redirect_chain) > 2
          -- or a loop: some url repeats within the chain
          or jsonb_array_length(redirect_chain) > (
            select count(distinct elem->>'url')
            from jsonb_array_elements(redirect_chain) as elem
          )
        )
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
