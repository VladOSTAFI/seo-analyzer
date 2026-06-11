import { pgEnum } from 'drizzle-orm/pg-core';

/**
 * All enums used across the audit pipeline. Defined now (Phase 0) so later
 * phases can reference them without schema churn. Values must match
 * docs/db-schemas.txt exactly — downstream rules depend on them.
 */

export const auditStatus = pgEnum('audit_status', [
  'created',
  'crawling',
  'enriching',
  'analyzing',
  'reporting',
  'done',
  'failed',
]);

export const statusClass = pgEnum('status_class', ['2xx', '3xx', '4xx', '5xx']);

export const linkType = pgEnum('link_type', ['internal', 'external']);

export const crawlSource = pgEnum('crawl_source', ['sitemap', 'link', 'redirect', 'seed']);

export const severity = pgEnum('severity', ['critical', 'high', 'medium', 'low', 'info']);

/**
 * Finding confidence — how directly the underlying signal was measured.
 * `high` = directly observed (default); `medium`/`low` = estimated or
 * unverified (origin-level CrUX, un-probed external links). Lets consumers
 * weight findings without conflating "low confidence" with "low severity".
 */
export const confidence = pgEnum('confidence', ['high', 'medium', 'low']);

/**
 * First-class classification of a crawled resource, set at crawl-persist time
 * from content-type + crawl source. Rules filter on `page_kind = 'html'` so a
 * `sitemap.xml`/feed row is never analyzed as an HTML content page (the root
 * fix for the sitemap false-positive class).
 */
export const pageKind = pgEnum('page_kind', ['html', 'sitemap', 'feed', 'other']);

/**
 * Authorization roles (Phase A0). `user` is the default for self-registered
 * accounts (own audits only); `admin` bypasses ownership checks. See
 * docs/AUTHORIZATION_PLAN.md §4.
 */
export const userRole = pgEnum('user_role', ['user', 'admin']);
