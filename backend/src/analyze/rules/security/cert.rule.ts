import { sql } from 'drizzle-orm';
import type { Finding, Rule } from '../../rule.types';

/** Days-to-expiry threshold for `security.cert`. Env-tuned, default 14. */
function readIntEnv(name: string, def: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return def;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : def;
}
const CERT_MIN_DAYS = readIntEnv('CERT_MIN_DAYS', 14);

/**
 * `security.cert` — Invalid or near-expiry TLS certificate (feature 11).
 *
 * Severity: high. Confidence: medium. HTML pages only.
 *
 * Reads the cert columns populated by the best-effort enrich TLS probe (gated by
 * `SECURITY_VERIFY_ENABLED`, default OFF). Only pages that were actually checked
 * (`cert_valid is not null`) are eligible — when the probe is off every row has
 * null cert columns and this rule emits nothing. Flags an invalid cert, or a
 * valid cert expiring within `CERT_MIN_DAYS`.
 *
 * detail: `{ certValid, daysToExpiry, reason }`.
 */
export const securityCertRule: Rule = {
  id: 'security.cert',
  description: 'TLS certificate invalid or expiring within the configured threshold',
  severity: 'high',
  confidence: 'medium',
  async run(db, auditId): Promise<Finding[]> {
    const res = await db.execute(sql`
      select url, cert_valid, cert_days_to_expiry
      from pages
      where audit_id = ${auditId}
        and page_kind = 'html'
        and cert_valid is not null
        and (
          cert_valid = false
          or (cert_days_to_expiry is not null and cert_days_to_expiry < ${CERT_MIN_DAYS})
        )
      order by url
    `);

    return res.rows.map((row): Finding => {
      const certValid = Boolean(row.cert_valid);
      const daysToExpiry =
        row.cert_days_to_expiry === null ? null : Number(row.cert_days_to_expiry);
      return {
        url: row.url as string,
        detail: {
          certValid,
          daysToExpiry,
          reason: !certValid ? 'invalid' : 'near-expiry',
        },
      };
    });
  },
};
