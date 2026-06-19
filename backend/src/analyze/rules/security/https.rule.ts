import { sql } from 'drizzle-orm';
import type { Finding, Rule } from '../../rule.types';

/**
 * `security.https` — Page not served over HTTPS (feature 11).
 *
 * Severity: high. Confidence: high. HTML pages only.
 *
 * Flags pages whose EFFECTIVE URL (`final_url`, falling back to the requested
 * `url`) is still plaintext `http://`. A page that correctly redirects
 * `http→https` resolves with an `https://` final URL and is therefore NOT
 * flagged (the redirect-chain exclusion is implicit in `final_url`). The
 * `redirect_chain` is surfaced in the detail for diagnostics.
 *
 * detail: `{ finalUrl, redirectChain }`.
 */
export const securityHttpsRule: Rule = {
  id: 'security.https',
  description: 'Page served over plaintext HTTP with no HTTPS upgrade',
  severity: 'high',
  confidence: 'high',
  async run(db, auditId): Promise<Finding[]> {
    const res = await db.execute(sql`
      select url, final_url, redirect_chain
      from pages
      where audit_id = ${auditId}
        and page_kind = 'html'
        and lower(coalesce(final_url, url)) like 'http://%'
      order by url
    `);

    return res.rows.map(
      (row): Finding => ({
        url: row.url as string,
        detail: {
          finalUrl: (row.final_url as string | null) ?? null,
          redirectChain: row.redirect_chain ?? [],
        },
      }),
    );
  },
};
