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
