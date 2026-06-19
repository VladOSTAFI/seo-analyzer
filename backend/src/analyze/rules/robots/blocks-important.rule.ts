import { sql } from 'drizzle-orm';
import type { Finding, Rule, Severity } from '../../rule.types';

/**
 * `robots.blocks-important` — site-level robots.txt problems (feature 02).
 *
 * Severity: high (static default); each finding overrides with the per-issue
 * severity computed at parse time. Confidence: high.
 *
 * robots.txt is a single site-level artifact already parsed + analyzed into
 * `audits.robots_audit` by the discovery pass, so this rule is a pure read of
 * that jsonb: one SITE-WIDE finding (`url = null`) per issue, with the per-row
 * severity carried through (the engine honours `Finding.severity`). The folded
 * sub-rules (`disallow-all`, `disallow-important`, `disallow-assets`,
 * `no-sitemap-directive`, `unreachable`) all surface here keyed by `detail.kind`.
 */
const VALID_SEVERITIES: Severity[] = ['critical', 'high', 'medium', 'low', 'info'];

export const robotsBlocksImportantRule: Rule = {
  id: 'robots.blocks-important',
  description: 'robots.txt blocks important sections / is unreachable / lacks a Sitemap directive',
  severity: 'high',
  async run(db, auditId) {
    const result = await db.execute(sql`
      select
        issue->>'kind'     as kind,
        issue->>'detail'   as detail,
        issue->>'severity' as severity
      from audits a,
           jsonb_array_elements(coalesce(a.robots_audit->'issues', '[]'::jsonb)) as issue
      where a.id = ${auditId}
    `);

    return result.rows.map((row): Finding => {
      const severity = row.severity as string | null;
      return {
        url: null, // site-wide
        severity: VALID_SEVERITIES.includes(severity as Severity)
          ? (severity as Severity)
          : undefined,
        detail: {
          kind: row.kind as string,
          detail: (row.detail as string | null) ?? null,
        },
      };
    });
  },
};
