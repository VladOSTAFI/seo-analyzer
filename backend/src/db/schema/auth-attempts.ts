import { boolean, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Login-attempt ledger (Phase A6 — brute-force protection). One row per
 * `POST /auth/login` attempt, tracked so a per-email sliding-window lockout can
 * count recent failures. See docs/AUTHORIZATION_PLAN.md §5 / §A6.
 *
 * Backs {@link import('../../auth/login-throttle.service').LoginThrottleService},
 * the DB-backed limiter we chose over `@nestjs/throttler`: per-email counting is
 * precise for credential brute-force and works across instances (no in-memory
 * state), at the cost of one extra write on the login path only — never on a hot
 * path like the audit status poll, so the cost is acceptable (§A6).
 *
 *  - `email` is the already-normalized address the attempt targeted; it is NOT a
 *    FK to users (we record attempts for unknown emails too, so the unknown-email
 *    branch is indistinguishable from wrong-password — §8, no enumeration).
 *  - `ip` is the client address (best-effort, nullable) for forensics; the
 *    lockout is keyed on email, not IP, so a NAT'd attacker can't escape it.
 *  - `succeeded` distinguishes the failures that count toward the lockout from the
 *    successes that don't; a successful login also clears the email's prior
 *    failures so a user isn't locked by their own earlier typos.
 *  - the composite `(email, createdAt)` index serves the limiter's hot query:
 *    "how many failures for this email since `now - window`".
 */
export const authAttempts = pgTable(
  'auth_attempts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(), // already-normalized; not a FK (unknown emails recorded too)
    ip: text('ip'), // best-effort client address, nullable
    succeeded: boolean('succeeded').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => ({
    emailTimeIdx: index('auth_attempts_email_time_idx').on(t.email, t.createdAt),
  }),
);

export type AuthAttempt = typeof authAttempts.$inferSelect;
export type NewAuthAttempt = typeof authAttempts.$inferInsert;
