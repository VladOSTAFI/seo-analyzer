import { sql } from 'drizzle-orm';
import type { Finding, Rule } from '../../rule.types';

/**
 * `links.broken-external` — External links to 4xx/5xx.
 *
 * Severity: medium. Confidence: medium (per-finding override).
 *
 * SQL mechanism: `links` where `is_broken = true`, `type='external'`. External
 * targets are not crawled, so their flags are NULL until the external-link probe
 * pass ({@link import('../../../enrich/link-verifier').LinkVerifierService.probeExternalLinks},
 * gated by EXTERNAL_VERIFY_ENABLED) re-fetches them and populates
 * `target_status_code`/`is_broken`. Those probed statuses are LIVE but a touch
 * lower-trust than internal page statuses (origin UA-sniffing, soft-blocks), so
 * each finding is stamped `confidence: 'medium'` (feature 10 §3.3) — the report
 * then renders externals as estimated. Findings emit on the SOURCE page, deduped
 * by distinct `(source_url, href)`.
 */
export const linksBrokenExternalRule: Rule = {
  id: 'links.broken-external',
  description: 'External links to 4xx/5xx',
  severity: 'medium',
  confidence: 'medium',
  async run(db, auditId) {
    const result = await db.execute(sql`
      select distinct source_url, href, target_status_code
      from links
      where audit_id = ${auditId}
        and type = 'external'
        and is_broken = true
    `);
    return result.rows.map(
      (row): Finding => ({
        url: row.source_url as string,
        confidence: 'medium',
        detail: { href: row.href as string, targetStatusCode: row.target_status_code },
      }),
    );
  },
};
