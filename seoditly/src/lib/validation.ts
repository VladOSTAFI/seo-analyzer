import { z } from "zod";

/**
 * Single source of truth for the contact-form shape, shared verbatim by the
 * client component (`components/contact/contact-form.tsx`) and the server
 * action (`app/contact/actions.ts`). Both sides validate against this same
 * schema so the client never trusts validation the server didn't also run.
 *
 * Field rules:
 *   - `name`     — required, trimmed, 1–120 chars.
 *   - `email`    — required, valid email, ≤ 254 chars (RFC 5321 max).
 *   - `siteUrl`  — optional; when present must be a public http(s) URL.
 *   - `message`  — optional, ≤ 2000 chars.
 *   - `website`  — honeypot; see {@link CONTACT_HONEYPOT_FIELD}. Not part of
 *                  the validated lead — handled separately in the action.
 */

/** `name` attribute of the hidden honeypot input. A real user never fills it. */
export const CONTACT_HONEYPOT_FIELD = "website" as const;

const trimmedString = z.string().trim();

export const contactFormSchema = z.object({
  name: trimmedString
    .min(1, "Please enter your name.")
    .max(120, "Name must be 120 characters or fewer."),
  email: z
    .email("Please enter a valid email address.")
    .max(254, "Email must be 254 characters or fewer."),
  // Optional URL. Empty string is coerced to `undefined` so a blank field is
  // valid; a non-empty value must parse as an http(s) URL.
  siteUrl: z
    .preprocess(
      (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
      z
        .url("Please enter a valid URL (including https://).")
        .max(2048, "URL must be 2048 characters or fewer.")
        .refine(
          (value) => /^https?:\/\//i.test(value),
          "URL must start with http:// or https://.",
        ),
    )
    .optional(),
  message: z
    .preprocess(
      (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
      trimmedString.max(2000, "Message must be 2000 characters or fewer."),
    )
    .optional(),
});

/** The validated, typed lead payload (honeypot excluded). */
export type ContactFormValues = z.infer<typeof contactFormSchema>;

/** Per-field error map returned to the client, keyed by field name. */
export type ContactFieldErrors = Partial<
  Record<keyof ContactFormValues, string[]>
>;
