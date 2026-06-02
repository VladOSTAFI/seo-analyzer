import { z } from 'zod';
import { severity as severityEnum } from '../db/schema/enums';
import { DEFAULT_LIMIT, MAX_LIMIT } from './api.types';

/**
 * Zod request schemas for the REST API (Phase 7). Single-sourced here so the
 * controller's pipes and any tests validate against identical contracts.
 * Severity values come straight from the pgEnum so they never drift.
 */

/** `POST /audits` body. URL shape is re-checked by parseStartUrl (http/https). */
export const CreateAuditBody = z
  .object({
    url: z.string({ required_error: 'url is required' }).trim().min(1, 'url must not be empty'),
  })
  .strict();
export type CreateAuditBody = z.infer<typeof CreateAuditBody>;

/**
 * Coerce a query-string integer with a default + bounds. Query values arrive as
 * strings; empty/missing falls back to `def`, and the result is clamped to
 * [min, max] so a client can never request an unbounded or negative page.
 */
const boundedInt = (def: number, min: number, max: number) =>
  z
    .preprocess((v) => (v === undefined || v === '' ? def : v), z.coerce.number().int().catch(def))
    .transform((n) => Math.min(Math.max(n, min), max));

/** Shared offset-pagination params (`limit`, `offset`). */
export const PageQuery = z.object({
  limit: boundedInt(DEFAULT_LIMIT, 1, MAX_LIMIT),
  offset: boundedInt(0, 0, Number.MAX_SAFE_INTEGER),
});
export type PageQuery = z.infer<typeof PageQuery>;

/** `GET /audits` query: pagination only. */
export const ListAuditsQuery = PageQuery;
export type ListAuditsQuery = z.infer<typeof ListAuditsQuery>;

/** `GET /audits/:id/findings` query: pagination + optional severity/ruleId filters. */
export const ListFindingsQuery = PageQuery.extend({
  severity: z.enum(severityEnum.enumValues).optional(),
  ruleId: z.string().trim().min(1).optional(),
});
export type ListFindingsQuery = z.infer<typeof ListFindingsQuery>;
