import { sql } from 'drizzle-orm';
import type { Finding, Rule } from '../../rule.types';

/** Max SimHash bit-difference treated as near-duplicate. Env-tuned, default 3. */
function readIntEnv(name: string, def: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return def;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : def;
}
const MAX_HAMMING = readIntEnv('SEO_NEARDUP_MAX_HAMMING', 3);

/**
 * `dupe.near-content` — Near-duplicate (not exact) page bodies (feature 08).
 *
 * Severity: medium. Confidence: medium (SimHash is an estimate). Live 2xx HTML
 * pages only.
 *
 * Real-world duplication is mostly *near*-duplicate (boilerplate templates with
 * a few words different) which the exact `content_hash` never catches. The
 * extractor stores a 64-bit SimHash as a 64-char '0'/'1' bit string; this rule
 * is a Hamming-distance self-join: pair pages whose signatures differ by
 * `<= SEO_NEARDUP_MAX_HAMMING` bits, EXCLUDING exact-equal pairs (those belong
 * to `dupe.content`). The Hamming distance is `popcount(a XOR b)`, computed in
 * SQL by casting the bit strings to `bit(64)`, XORing (`#`), and counting the
 * '1' characters of the result's text form.
 *
 * Unordered-pair emission: `q.id < p.id` yields each pair once; ONE finding per
 * page in the pair (so the page that participates is flagged with its partner).
 *
 * detail: `{ nearUrl, hamming }`.
 */
export const dupeNearContentRule: Rule = {
  id: 'dupe.near-content',
  description: 'Near-duplicate page bodies (SimHash Hamming distance below threshold)',
  severity: 'medium',
  confidence: 'medium',
  async run(db, auditId): Promise<Finding[]> {
    const res = await db.execute(sql`
      select p.url as url,
             q.url as near_url,
             length(replace((p.content_simhash::bit(64) # q.content_simhash::bit(64))::text, '0', '')) as hamming
      from pages p
      join pages q
        on q.audit_id = p.audit_id
       and q.id < p.id
       and q.content_simhash is not null
       and q.status_class = '2xx'
       and q.page_kind = 'html'
       and p.content_hash is distinct from q.content_hash
       and length(replace((p.content_simhash::bit(64) # q.content_simhash::bit(64))::text, '0', '')) <= ${MAX_HAMMING}
      where p.audit_id = ${auditId}
        and p.status_class = '2xx'
        and p.page_kind = 'html'
        and p.content_simhash is not null
      order by hamming, p.url
    `);

    const findings: Finding[] = [];
    for (const row of res.rows) {
      const hamming = Number(row.hamming);
      // Emit one finding per page in the pair (both sides flagged once total).
      findings.push({ url: row.url as string, detail: { nearUrl: row.near_url as string, hamming } });
      findings.push({ url: row.near_url as string, detail: { nearUrl: row.url as string, hamming } });
    }
    return findings;
  },
};
