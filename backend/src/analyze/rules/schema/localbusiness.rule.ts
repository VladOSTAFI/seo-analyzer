import { sql } from 'drizzle-orm';
import type { Finding, Rule } from '../../rule.types';

/** One error annotation as persisted in structured_data.errors. */
interface SchemaErrorRow {
  code: string;
  prop?: string;
  type?: string;
}

/** NAP / geo / hours / phone props the LocalBusiness check tracks (§6 tie-in). */
const NAP_PROPS = new Set(['name', 'address', 'telephone', 'geo', 'openingHours']);

/**
 * `schema.localbusiness` — the §6 headline multi-location tie-in.
 *
 * Severity: high. Confidence: high.
 *
 * Fires for two cases (UNION):
 *  - PRESENT-BUT-INCOMPLETE: a LocalBusiness (incl. subtypes Gym / HealthClub /
 *    SportsActivityLocation / …) node missing any NAP / geo / hours / phone
 *    property — the missing props come from the `errors` jsonb.
 *  - ABSENT: a location-style page (URL heuristic: contains `/club`, `/gym`,
 *    `/location`, `/branch`, or `/studio`) that is live HTML but has NO
 *    LocalBusiness node at all — the §6 "add LocalBusiness schema to the club
 *    pages" finding.
 *
 * The missing-prop list is composed in JS (hreflang-style projection); the
 * absent case lists the full NAP set.
 */
export const schemaLocalBusinessRule: Rule = {
  id: 'schema.localbusiness',
  description: 'LocalBusiness markup missing or missing NAP / geo / hours / phone',
  severity: 'high',
  async run(db, auditId) {
    const lbTypes = sql`('LocalBusiness','Gym','HealthClub','SportsActivityLocation','ExerciseGym','SportsClub')`;

    const present = await db.execute(sql`
      select sd.page_url as page_url, sd.type as type, sd.errors as errors
      from structured_data sd
      join pages p on p.audit_id = sd.audit_id and p.url = sd.page_url
      where sd.audit_id = ${auditId}
        and p.page_kind = 'html'
        and p.status_class = '2xx'
        and sd.type in ${lbTypes}
        and exists (
          select 1 from jsonb_array_elements(sd.errors) e
          where e->>'code' in ('missing-required', 'missing-recommended')
            and e->>'prop' in ('name', 'address', 'telephone', 'geo', 'openingHours')
        )
      order by sd.page_url
    `);

    const absent = await db.execute(sql`
      select p.url as url
      from pages p
      where p.audit_id = ${auditId}
        and p.page_kind = 'html'
        and p.status_class = '2xx'
        and p.url ~* '/(club|gym|location|branch|studio)'
        and not exists (
          select 1 from structured_data sd
          where sd.audit_id = p.audit_id
            and sd.page_url = p.url
            and sd.type in ${lbTypes}
        )
      order by p.url
    `);

    const findings: Finding[] = [];

    for (const row of present.rows) {
      const errors = (row.errors as SchemaErrorRow[] | null) ?? [];
      const missing: string[] = [];
      for (const e of errors) {
        if (e.prop && NAP_PROPS.has(e.prop) && !missing.includes(e.prop)) {
          missing.push(e.prop);
        }
      }
      findings.push({
        url: row.page_url as string,
        detail: { type: row.type as string, issue: 'incomplete-nap', missing },
      });
    }

    for (const row of absent.rows) {
      findings.push({
        url: row.url as string,
        detail: {
          issue: 'no-localbusiness',
          missing: ['name', 'address', 'telephone', 'geo', 'openingHours'],
        },
      });
    }

    return findings;
  },
};
