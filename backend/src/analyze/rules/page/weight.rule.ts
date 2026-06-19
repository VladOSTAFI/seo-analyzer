import { sql } from 'drizzle-orm';
import type { Finding, Rule } from '../../rule.types';

/** Page-weight budgets. Env-tuned: total bytes / total request count. */
function readIntEnv(name: string, def: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return def;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : def;
}
const WEIGHT_MAX_BYTES = readIntEnv('PAGE_WEIGHT_MAX_BYTES', 3_000_000);
const REQUEST_MAX = readIntEnv('PAGE_REQUEST_MAX', 80);

/**
 * `page.weight` — Pages over the byte / request-count budget (feature 11, P3).
 *
 * Severity: low. Confidence: medium (byte sums depend on the image probe; when
 * the probe is OFF only the request count is reliable, so this stays medium).
 *
 * Aggregates `page_resources` per `page_url`: total request count (row count)
 * and total bytes (sum of probed `bytes`, treating un-probed rows as 0). Flags
 * pages whose request count exceeds `PAGE_REQUEST_MAX` or whose summed bytes
 * exceed `PAGE_WEIGHT_MAX_BYTES`. Joined back to `pages` so only live HTML pages
 * are flagged.
 *
 * detail: `{ totalBytes, requestCount, reason: ('over-bytes'|'over-requests')[] }`.
 */
export const pageWeightRule: Rule = {
  id: 'page.weight',
  description: 'Page over the total-bytes or request-count budget',
  severity: 'low',
  confidence: 'medium',
  async run(db, auditId): Promise<Finding[]> {
    const res = await db.execute(sql`
      select agg.page_url as page_url,
             agg.total_bytes as total_bytes,
             agg.request_count as request_count,
             (agg.total_bytes > ${WEIGHT_MAX_BYTES}) as over_bytes,
             (agg.request_count > ${REQUEST_MAX}) as over_requests
      from (
        select pr.page_url,
               coalesce(sum(pr.bytes), 0)::bigint as total_bytes,
               count(*)::int as request_count
        from page_resources pr
        where pr.audit_id = ${auditId}
        group by pr.page_url
      ) agg
      join pages p
        on p.audit_id = ${auditId}
       and p.url = agg.page_url
       and p.page_kind = 'html'
       and p.status_class = '2xx'
      where agg.total_bytes > ${WEIGHT_MAX_BYTES}
         or agg.request_count > ${REQUEST_MAX}
      order by agg.page_url
    `);

    return res.rows.map((row): Finding => {
      const reason: string[] = [];
      if (row.over_bytes) reason.push('over-bytes');
      if (row.over_requests) reason.push('over-requests');
      return {
        url: row.page_url as string,
        detail: {
          totalBytes: Number(row.total_bytes),
          requestCount: Number(row.request_count),
          reason,
        },
      };
    });
  },
};
