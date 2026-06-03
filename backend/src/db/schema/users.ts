import { boolean, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { userRole } from './enums';

/**
 * First-party user/account model (Phase A0). Holds credentials and the authz
 * inputs the JWT guard needs. See docs/AUTHORIZATION_PLAN.md §5.
 *
 *  - `passwordHash` is argon2id (see PasswordService / §3.1 / §8); the raw
 *    password is never stored or logged.
 *  - `email` is unique and case-normalized (lowercased/trimmed) at write time —
 *    the unique index enforces single ownership of an address.
 *  - `tokenVersion` is bumped to mass-revoke a user's outstanding access tokens
 *    ("log out everywhere" / forced logout on password change — §A5).
 *  - `isActive` lets an account be disabled without deletion.
 *
 * No FKs into this table land here (audits.ownerId arrives in Phase A3).
 */
export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(), // argon2id
    role: userRole('role').notNull().default('user'),
    tokenVersion: integer('token_version').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => ({
    emailIdx: uniqueIndex('users_email_idx').on(t.email), // case-normalized at write
  }),
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
