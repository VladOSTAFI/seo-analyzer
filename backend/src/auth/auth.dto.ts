import { z } from 'zod';

/**
 * Zod request schemas for the auth routes (Phase A1). Single-sourced here so the
 * controller's {@link import('../api/zod-validation.pipe').ZodValidationPipe}
 * and any tests validate against identical contracts. Both are `.strict()` so an
 * unexpected field (e.g. a sneaked-in `role`) is rejected with 400 rather than
 * silently ignored — registration must never let a caller pick their own role.
 *
 * Email is validated and lowercased/trimmed here; AuthService re-normalizes
 * defensively, but doing it in the schema means downstream code always sees the
 * canonical form. The password floor is a minimal length check only — strength
 * policy is intentionally out of scope for A1.
 */

const email = z
  .string({ required_error: 'email is required' })
  .trim()
  .toLowerCase()
  .email('email must be a valid email address');

/** `POST /auth/register` body. */
export const RegisterBody = z
  .object({
    email,
    password: z
      .string({ required_error: 'password is required' })
      .min(8, 'password must be at least 8 characters'),
  })
  .strict();
export type RegisterBody = z.infer<typeof RegisterBody>;

/**
 * `POST /auth/login` body. The password floor is deliberately a presence check
 * (min 1), not the register policy: an existing account may predate any policy,
 * and rejecting a short password at the DTO would leak that it is "too short to
 * be ours". Credential correctness is decided by AuthService with one generic
 * error (§8).
 */
export const LoginBody = z
  .object({
    email,
    password: z.string({ required_error: 'password is required' }).min(1, 'password is required'),
  })
  .strict();
export type LoginBody = z.infer<typeof LoginBody>;
