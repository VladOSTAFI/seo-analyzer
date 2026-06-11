/**
 * Phase 2 enrichment contract. These row counts/flags are produced by a single
 * {@link import('./enrich.service').EnrichService.enrich} run and surfaced for
 * both structured logging and the `audit:enrich` CLI summary line.
 *
 * Every field is a count derived from a lightweight SELECT after the enrichment
 * UPDATEs commit — it is purely observability, never persisted. The set-based
 * enrichment counts are idempotent; the verification counts (see below) are NOT,
 * because they reflect a live network re-check that can legitimately differ
 * between runs (see {@link import('./link-verifier').LinkVerifierService}).
 */
export interface EnrichSummary {
  /** Links matched to a crawled page (i.e. `target_status_code` set non-null). */
  linksResolved: number;
  /** Links whose resolved target is a 3xx page (`is_redirect = true`). */
  redirectLinks: number;
  /**
   * Links whose target is 4xx/5xx (`is_broken = true`) AFTER the live
   * verification pass has cleared false positives. Recomputed post-verification.
   */
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

  // --- Live broken-link verification pass (post-transaction, network-dependent).
  /** Distinct broken-flagged target URLs actually re-fetched (after dedup + cap). */
  linksVerified: number;
  /** Distinct targets cleared because the live re-check was healthy (false positives). */
  falsePositivesCleared: number;
  /** Distinct targets left untouched because the re-check failed (net error/timeout). */
  verifyInconclusive: number;

  // --- External link probe pass (item 9, gated by EXTERNAL_VERIFY_ENABLED).
  /** Distinct external hrefs probed (0 when EXTERNAL_VERIFY_ENABLED=false). */
  externalsVerified: number;
  /**
   * True when the external probe set was capped by EXTERNAL_VERIFY_MAX or
   * EXTERNAL_VERIFY_PER_HOST before all candidates were exhausted.
   */
  externalsTruncated: boolean;

  // --- Image probe pass (item 9, gated by IMAGE_VERIFY_ENABLED).
  /** Distinct image src URLs probed (0 when IMAGE_VERIFY_ENABLED=false). */
  imagesVerified: number;
  /**
   * True when the image probe set was capped by EXTERNAL_VERIFY_MAX or
   * EXTERNAL_VERIFY_PER_HOST before all candidates were exhausted.
   */
  imagesTruncated: boolean;
}
