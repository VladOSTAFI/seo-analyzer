/**
 * Phase 2 enrichment contract. These row counts/flags are produced by a single
 * {@link import('./enrich.service').EnrichService.enrich} run and surfaced for
 * both structured logging and the `audit:enrich` CLI summary line.
 *
 * Every field is a count derived from a lightweight SELECT after the enrichment
 * UPDATEs commit — it is purely observability, never persisted. Re-running enrich
 * on the same audit yields identical numbers (the enrichment is idempotent).
 */
export interface EnrichSummary {
  /** Links matched to a crawled page (i.e. `target_status_code` set non-null). */
  linksResolved: number;
  /** Links whose resolved target is a 3xx page (`is_redirect = true`). */
  redirectLinks: number;
  /** Links whose resolved target is a 4xx/5xx page (`is_broken = true`). */
  brokenLinks: number;
  /** Pages with at least one internal inlink (`inlink_count > 0`) after update. */
  pagesWithInlinks: number;
  /** Images whose `status_code` was resolved from a crawled page (non-null). */
  imagesResolved: number;
  /** Hreflang entries that round-trip back to their source (`is_reciprocal = true`). */
  hreflangReciprocal: number;
  /** Pages whose stored `redirect_chain` has more than one hop. */
  redirectChainPages: number;
  /** Pages whose `redirect_chain` contains a repeated url (a redirect loop). */
  redirectLoopPages: number;
}
