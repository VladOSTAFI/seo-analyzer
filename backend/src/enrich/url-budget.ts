/**
 * URL budget helpers for the external-link and image probe passes (item 9).
 *
 * Given a flat list of distinct URLs we need to:
 *  1. Apply a per-host budget (EXTERNAL_VERIFY_PER_HOST) so one domain can't
 *     consume the whole probe quota.
 *  2. Cap the total to a hard limit (EXTERNAL_VERIFY_MAX) after the per-host
 *     trim has been applied.
 *
 * Both helpers are pure functions (no I/O) so they are trivially unit-testable.
 */

/**
 * Result of applying the budget: the subset of URLs to probe plus flags
 * indicating whether either cap was triggered (for log/summary reporting).
 */
export interface BudgetResult {
  urls: string[];
  /** True when at least one host was trimmed by the per-host cap. */
  perHostTruncated: boolean;
  /** True when the global cap was applied after the per-host trim. */
  totalTruncated: boolean;
}

/**
 * Apply per-host and total caps to a deduplicated list of URLs.
 *
 * @param candidates   Distinct URLs (http/https) in the order they should be
 *                     probed. Non-parseable entries are passed through untouched
 *                     (the caller is expected to filter non-http URLs first).
 * @param perHostMax   Maximum URLs probed per distinct hostname (>= 1).
 * @param totalMax     Hard cap on the total result set size (>= 1).
 */
export function applyBudget(
  candidates: string[],
  perHostMax: number,
  totalMax: number,
): BudgetResult {
  const hostCounts = new Map<string, number>();
  const kept: string[] = [];
  let perHostTruncated = false;

  for (const url of candidates) {
    let host: string;
    try {
      host = new URL(url).hostname;
    } catch {
      // Unparseable URL — pass it through; it will fail at fetch time.
      kept.push(url);
      continue;
    }

    const count = hostCounts.get(host) ?? 0;
    if (count >= perHostMax) {
      perHostTruncated = true;
      continue;
    }
    hostCounts.set(host, count + 1);
    kept.push(url);
  }

  if (kept.length <= totalMax) {
    return { urls: kept, perHostTruncated, totalTruncated: false };
  }

  return { urls: kept.slice(0, totalMax), perHostTruncated, totalTruncated: true };
}
