/** PageSpeed Insights strategy. Stored verbatim in performance.strategy. */
export type PsiStrategy = 'mobile' | 'desktop';

export const PSI_STRATEGIES: readonly PsiStrategy[] = ['mobile', 'desktop'] as const;

/**
 * Parsed PSI result for ONE (url, strategy). Maps 1:1 onto the nullable
 * performance.* columns. All metric fields are nullable because PSI may omit
 * field data (CrUX) for low-traffic URLs; lab metrics from Lighthouse are the
 * fallback. `usabilityFlags` is the list of failing/low-score audit ids
 * (performance opportunities + SEO/usability failures). `raw` is the full
 * untouched API JSON, persisted to performance.psi_raw for forensic use.
 */
export interface PsiMetrics {
  lcpMs: number | null;
  cls: number | null;
  inpMs: number | null;
  performanceScore: number | null; // 0..100
  fcpMs: number | null;
  tbtMs: number | null;
  speedIndexMs: number | null;
  usabilityFlags: string[];
  raw: unknown;
}

/** Injection token for the PSI client (so PerformanceService depends on the interface, not the impl — and tests inject a mock). */
export const PSI_CLIENT = Symbol('PSI_CLIENT');

/**
 * The PSI client seam. The ONLY component in the app permitted to make network
 * calls. PerformanceService depends on this interface via the PSI_CLIENT token.
 */
export interface PsiClient {
  /** Fetch + parse PageSpeed Insights for one url/strategy. Throws on network/quota/HTTP error. */
  fetch(url: string, strategy: PsiStrategy): Promise<PsiMetrics>;
}
