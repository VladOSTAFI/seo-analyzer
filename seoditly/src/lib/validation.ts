import { z } from "zod";

import type { Locale } from "@/lib/i18n/config";

/**
 * Single source of truth for the contact-form shape, shared by the client
 * component (`components/contact/contact-form.tsx`) and the server action
 * (`app/[locale]/contact/actions.ts`). Both sides validate against the same
 * schema so the client never trusts validation the server didn't also run.
 *
 * i18n: the schema is built by a factory keyed on the locale's messages so
 * validation errors are localized. English is the fallback (`VALIDATION_EN`),
 * used by the default `contactFormSchema` export and any non-localized caller.
 *
 * Field rules:
 *   - `name`     — required, trimmed, 1–120 chars.
 *   - `email`    — required, valid email, ≤ 254 chars (RFC 5321 max).
 *   - `siteUrl`  — optional; when present must be a public http(s) URL.
 *   - `message`  — optional, ≤ 2000 chars.
 *   - `website`  — honeypot; see {@link CONTACT_HONEYPOT_FIELD}.
 */

/** `name` attribute of the hidden honeypot input. A real user never fills it. */
export const CONTACT_HONEYPOT_FIELD = "website" as const;

export interface ContactValidationMessages {
  nameRequired: string;
  nameTooLong: string;
  emailInvalid: string;
  emailTooLong: string;
  urlInvalid: string;
  urlTooLong: string;
  urlScheme: string;
  messageTooLong: string;
}

const VALIDATION_EN: ContactValidationMessages = {
  nameRequired: "Please enter your name.",
  nameTooLong: "Name must be 120 characters or fewer.",
  emailInvalid: "Please enter a valid email address.",
  emailTooLong: "Email must be 254 characters or fewer.",
  urlInvalid: "Please enter a valid URL (including https://).",
  urlTooLong: "URL must be 2048 characters or fewer.",
  urlScheme: "URL must start with http:// or https://.",
  messageTooLong: "Message must be 2000 characters or fewer.",
};

const VALIDATION_UK: ContactValidationMessages = {
  nameRequired: "Введіть своє ім’я.",
  nameTooLong: "Ім’я має містити не більше ніж 120 символів.",
  emailInvalid: "Введіть дійсну адресу електронної пошти.",
  emailTooLong: "Пошта має містити не більше ніж 254 символи.",
  urlInvalid: "Введіть дійсний URL (разом із https://).",
  urlTooLong: "URL має містити не більше ніж 2048 символів.",
  urlScheme: "URL має починатися з http:// або https://.",
  messageTooLong: "Повідомлення має містити не більше ніж 2000 символів.",
};

const MESSAGES_BY_LOCALE: Record<Locale, ContactValidationMessages> = {
  en: VALIDATION_EN,
  uk: VALIDATION_UK,
};

/** Build a contact-form schema with localized validation messages. */
export function makeContactFormSchema(messages: ContactValidationMessages) {
  const trimmedString = z.string().trim();
  return z.object({
    name: trimmedString
      .min(1, messages.nameRequired)
      .max(120, messages.nameTooLong),
    email: z.email(messages.emailInvalid).max(254, messages.emailTooLong),
    siteUrl: z
      .preprocess(
        (value) =>
          typeof value === "string" && value.trim() === "" ? undefined : value,
        z
          .url(messages.urlInvalid)
          .max(2048, messages.urlTooLong)
          .refine((value) => /^https?:\/\//i.test(value), messages.urlScheme),
      )
      .optional(),
    message: z
      .preprocess(
        (value) =>
          typeof value === "string" && value.trim() === "" ? undefined : value,
        trimmedString.max(2000, messages.messageTooLong),
      )
      .optional(),
  });
}

/** Localized contact-form schema for a given locale (English fallback). */
export function getContactFormSchema(locale: Locale) {
  return makeContactFormSchema(MESSAGES_BY_LOCALE[locale] ?? VALIDATION_EN);
}

/** Default (English) schema — used by the server action and as a fallback. */
export const contactFormSchema = makeContactFormSchema(VALIDATION_EN);

/** The validated, typed lead payload (honeypot excluded). */
export type ContactFormValues = z.infer<typeof contactFormSchema>;

/** Per-field error map returned to the client, keyed by field name. */
export type ContactFieldErrors = Partial<
  Record<keyof ContactFormValues, string[]>
>;
