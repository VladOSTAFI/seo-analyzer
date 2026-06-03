import { index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { users } from './users';

/**
 * Persisted refresh tokens (Phase A1 — issuance; rotation/logout land in A5).
 * See docs/AUTHORIZATION_PLAN.md §3.2 / §5.
 *
 * The opaque refresh token handed to the client is random bytes; only its
 * sha-256 digest is stored here (`tokenHash`) — the raw token is never persisted,
 * so a DB leak does not expose usable refresh tokens. This is what lets us revoke
 * sessions (logout / "log out everywhere") that a pure stateless JWT cannot.
 *
 *  - `userId` FKs to users.id with onDelete cascade, so deleting a user drops
 *    their outstanding refresh tokens.
 *  - `expiresAt` is computed from JWT_REFRESH_TTL at issuance.
 *  - `revokedAt` is NULL while the token is active; set on logout/rotation (A5).
 *  - `tokenHash` is uniquely indexed for O(index-lookup) presentation in A5 and
 *    to guarantee no two rows share a digest; `userId` is indexed for the
 *    per-user revoke sweep.
 */
export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(), // sha-256 of the opaque token; never store raw
    expiresAt: timestamp('expires_at').notNull(),
    revokedAt: timestamp('revoked_at'), // null = active
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index('refresh_tokens_user_idx').on(t.userId),
    hashIdx: uniqueIndex('refresh_tokens_hash_idx').on(t.tokenHash),
  }),
);

export type RefreshToken = typeof refreshTokens.$inferSelect;
export type NewRefreshToken = typeof refreshTokens.$inferInsert;
