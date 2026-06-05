/**
 * Tiny presentation helpers shared by the dashboard components. Kept
 * dependency-free and deterministic (no locale-arg surprises) so server and
 * client render the same string and there's no hydration mismatch.
 */

/** Drop the `http(s)://` scheme for compact URL display (keeps path/query). */
export function stripScheme(url: string): string {
  return url.replace(/^https?:\/\//i, "");
}

/**
 * Format an ISO timestamp as a short, fixed `YYYY-MM-DD HH:mm` (UTC). Using a
 * stable UTC format avoids server/client timezone hydration mismatches and the
 * non-determinism of `toLocaleString` across environments.
 */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`
  );
}
