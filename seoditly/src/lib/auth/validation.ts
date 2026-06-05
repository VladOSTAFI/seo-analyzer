import { z } from "zod";

/**
 * Single source of truth for the auth-form shapes, shared verbatim by the
 * client components (`components/auth/auth-form.tsx`) and the Server Actions
 * (`app/(auth)/actions.ts`). Both sides validate against these schemas so the
 * client never trusts validation the server didn't also run.
 *
 * Field rules mirror the backend's expectations:
 *   - `email`    — required, valid email, ≤ 254 chars (RFC 5321 max).
 *   - `password` — required, ≥ 8 chars (backend rejects shorter), ≤ 200.
 */

const email = z
  .email("Please enter a valid email address.")
  .max(254, "Email must be 254 characters or fewer.");

const password = z
  .string()
  .min(8, "Password must be at least 8 characters.")
  .max(200, "Password must be 200 characters or fewer.");

/** Login: any non-empty password is accepted client-side; the backend judges it. */
export const loginSchema = z.object({
  email,
  password: z.string().min(1, "Please enter your password."),
});

/** Register: enforce the backend's ≥ 8 minimum up front for faster feedback. */
export const registerSchema = z.object({
  email,
  password,
});

export type LoginValues = z.infer<typeof loginSchema>;
export type RegisterValues = z.infer<typeof registerSchema>;

/** Per-field error map returned to the client, keyed by field name. */
export type AuthFieldErrors = Partial<
  Record<"email" | "password", string[]>
>;
