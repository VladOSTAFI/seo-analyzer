import { z } from "zod";

import type { Locale } from "@/lib/i18n/config";

/**
 * Single source of truth for the auth-form shapes, shared by the client
 * components (`components/auth/auth-form.tsx`) and the Server Actions
 * (`app/[locale]/(auth)/actions.ts`). Both sides validate against these schemas
 * so the client never trusts validation the server didn't also run.
 *
 * i18n: schemas are built by factories keyed on the locale's validation
 * messages. English (`AUTH_VALIDATION_EN`) is the fallback and backs the bare
 * `loginSchema` / `registerSchema` exports used by non-localized callers.
 *
 * Field rules mirror the backend's expectations:
 *   - `email`    — required, valid email, ≤ 254 chars (RFC 5321 max).
 *   - `password` — required, ≥ 8 chars (register; backend rejects shorter), ≤ 200.
 */

export interface AuthValidationMessages {
  emailInvalid: string;
  emailTooLong: string;
  passwordRequired: string;
  passwordTooShort: string;
  passwordTooLong: string;
}

const AUTH_VALIDATION_EN: AuthValidationMessages = {
  emailInvalid: "Please enter a valid email address.",
  emailTooLong: "Email must be 254 characters or fewer.",
  passwordRequired: "Please enter your password.",
  passwordTooShort: "Password must be at least 8 characters.",
  passwordTooLong: "Password must be 200 characters or fewer.",
};

const AUTH_VALIDATION_UK: AuthValidationMessages = {
  emailInvalid: "Введіть дійсну адресу електронної пошти.",
  emailTooLong: "Пошта має містити не більше ніж 254 символи.",
  passwordRequired: "Введіть пароль.",
  passwordTooShort: "Пароль має містити щонайменше 8 символів.",
  passwordTooLong: "Пароль має містити не більше ніж 200 символів.",
};

const MESSAGES_BY_LOCALE: Record<Locale, AuthValidationMessages> = {
  en: AUTH_VALIDATION_EN,
  uk: AUTH_VALIDATION_UK,
};

function emailField(m: AuthValidationMessages) {
  return z.email(m.emailInvalid).max(254, m.emailTooLong);
}

/** Login schema with localized messages. */
export function makeLoginSchema(m: AuthValidationMessages) {
  return z.object({
    email: emailField(m),
    password: z.string().min(1, m.passwordRequired),
  });
}

/** Register schema with localized messages (enforces the ≥ 8 minimum). */
export function makeRegisterSchema(m: AuthValidationMessages) {
  return z.object({
    email: emailField(m),
    password: z
      .string()
      .min(8, m.passwordTooShort)
      .max(200, m.passwordTooLong),
  });
}

export function getLoginSchema(locale: Locale) {
  return makeLoginSchema(MESSAGES_BY_LOCALE[locale] ?? AUTH_VALIDATION_EN);
}

export function getRegisterSchema(locale: Locale) {
  return makeRegisterSchema(MESSAGES_BY_LOCALE[locale] ?? AUTH_VALIDATION_EN);
}

/** Default (English) schemas — used as the fallback for non-localized callers. */
export const loginSchema = makeLoginSchema(AUTH_VALIDATION_EN);
export const registerSchema = makeRegisterSchema(AUTH_VALIDATION_EN);

export type LoginValues = z.infer<typeof loginSchema>;
export type RegisterValues = z.infer<typeof registerSchema>;

/** Per-field error map returned to the client, keyed by field name. */
export type AuthFieldErrors = Partial<
  Record<"email" | "password", string[]>
>;
