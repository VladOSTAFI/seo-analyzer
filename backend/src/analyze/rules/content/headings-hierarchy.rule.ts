import { sql } from 'drizzle-orm';
import type { Finding, Rule } from '../../rule.types';

interface OutlineEntry {
  level: number;
  text: string;
}

/**
 * Analyze one page's heading outline. Returns the issue codes found, the H1
 * count, and the document position of the first level-skip (0-based; null when
 * none). Pure sequence analysis (not a set/SQL operation):
 *
 *  - `no-h1`      — zero H1.
 *  - `multiple-h1`— more than one H1.
 *  - `skipped-level` — a heading jumps DOWN more than one level vs. the previous
 *    heading (e.g. H1 → H3); the classic accessibility/structure smell.
 *  - `empty-heading` — a heading with empty text.
 */
function analyzeOutline(outline: OutlineEntry[]): {
  issues: string[];
  h1Count: number;
  firstSkipAt: number | null;
} {
  const issues = new Set<string>();
  let h1Count = 0;
  let firstSkipAt: number | null = null;
  let prevLevel: number | null = null;

  outline.forEach((h, i) => {
    if (h.level === 1) h1Count += 1;
    if (h.text === '') issues.add('empty-heading');
    if (prevLevel !== null && h.level - prevLevel > 1) {
      issues.add('skipped-level');
      if (firstSkipAt === null) firstSkipAt = i;
    }
    prevLevel = h.level;
  });

  if (h1Count === 0) issues.add('no-h1');
  else if (h1Count > 1) issues.add('multiple-h1');

  return { issues: [...issues], h1Count, firstSkipAt };
}

/**
 * `content.headings-hierarchy` — Illogical heading outline (feature 08).
 *
 * Severity: medium. Confidence: high. Live 2xx HTML pages only.
 *
 * A logical H1→H2→H3 outline (one H1, no skipped levels, no empty headings) is
 * an accessibility (WCAG) and content-structure signal. The candidate SELECTION
 * is SQL (pages with at least one heading); the skip/empty/multiple analysis is
 * a pure JS pass over the `headings_outline` jsonb (a sequence check, not a
 * join). Only pages with at least one issue emit a finding.
 *
 * detail: `{ issues: string[], h1Count, firstSkipAt }`.
 */
export const contentHeadingsHierarchyRule: Rule = {
  id: 'content.headings-hierarchy',
  description: 'Illogical heading hierarchy (missing/multiple H1, skipped levels, empty headings)',
  severity: 'medium',
  confidence: 'high',
  async run(db, auditId): Promise<Finding[]> {
    const res = await db.execute(sql`
      select url, headings_outline
      from pages
      where audit_id = ${auditId}
        and status_class = '2xx'
        and page_kind = 'html'
        and jsonb_array_length(headings_outline) >= 1
      order by url
    `);

    const findings: Finding[] = [];
    for (const row of res.rows) {
      const outline = (row.headings_outline as OutlineEntry[]) ?? [];
      const { issues, h1Count, firstSkipAt } = analyzeOutline(outline);
      if (issues.length === 0) continue;
      findings.push({
        url: row.url as string,
        detail: { issues, h1Count, firstSkipAt },
      });
    }
    return findings;
  },
};
