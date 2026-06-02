import { sql } from 'drizzle-orm';
import type { Finding, Rule } from '../../rule.types';

/**
 * `mirror.trailing-slash` — Same content served at both `/path` and `/path/`
 * (slash duplication).
 *
 * Severity: medium.
 *
 * SQL mechanism: a self-join over 2xx pages with a non-null `content_hash`,
 * pairing a no-slash url `a` with its trailing-slash twin `b` (`b.url = a.url || '/'`)
 * that shares the same `content_hash`. The finding is emitted on the no-slash
 * member; restricting the `a` side to urls NOT already ending in `/` makes the
 * pairing one-directional and prevents double-emitting the same duplicate pair.
 */
export const mirrorTrailingSlashRule: Rule = {
  id: 'mirror.trailing-slash',
  description: 'Same content at `/path` and `/path/` (slash duplication)',
  severity: 'medium',
  async run(db, auditId): Promise<Finding[]> {
    const result = await db.execute(sql`
      select a.url as no_slash_url, b.url as slash_url, a.content_hash
      from pages a
      join pages b
        on b.audit_id = a.audit_id
        and b.url = a.url || '/'
        and b.content_hash = a.content_hash
        and b.status_class = '2xx'
      where a.audit_id = ${auditId}
        and a.status_class = '2xx'
        and a.content_hash is not null
        and a.url not like '%/'
      order by a.url
    `);

    return result.rows.map((row) => ({
      url: row.no_slash_url as string,
      detail: {
        slashUrl: row.slash_url as string,
        contentHash: row.content_hash as string,
      },
    }));
  },
};
