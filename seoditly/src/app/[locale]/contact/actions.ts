"use server";

import { headers } from "next/headers";

import {
  CONTACT_HONEYPOT_FIELD,
  getContactFormSchema,
  type ContactFieldErrors,
} from "@/lib/validation";
import { DEFAULT_LOCALE, isLocale } from "@/lib/i18n/config";
import { getContact } from "@/lib/copy/contact";
import { saveLead, type Lead } from "@/lib/leads";

/**
 * Shape returned to the client via `useActionState`. `status` drives the UI:
 *   - `idle`    — initial render, nothing submitted yet.
 *   - `success` — lead persisted (or silently dropped as spam — see honeypot).
 *   - `error`   — validation failed (`fieldErrors`) or a general failure
 *                 (`formError`), including rate limiting.
 */
export interface ContactFormState {
  status: "idle" | "success" | "error";
  fieldErrors?: ContactFieldErrors;
  formError?: string;
}

export const initialContactState: ContactFormState = { status: "idle" };

/**
 * Best-effort, per-IP, per-instance rate limit. In-memory only — this is a
 * single-instance default and does NOT coordinate across serverless instances
 * or multiple regions. Adequate as a first line against rapid repeat submits;
 * swap for a shared store (e.g. Upstash/Redis) if the deploy fans out.
 */
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 5;
const rateLimitHits = new Map<string, number[]>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;
  const recent = (rateLimitHits.get(ip) ?? []).filter((t) => t > windowStart);
  recent.push(now);
  rateLimitHits.set(ip, recent);

  // Opportunistic cleanup so the map doesn't grow unbounded for one-off IPs.
  if (rateLimitHits.size > 5_000) {
    for (const [key, times] of rateLimitHits) {
      if (times.every((t) => t <= windowStart)) rateLimitHits.delete(key);
    }
  }

  return recent.length > RATE_LIMIT_MAX;
}

/** Read the best-effort client IP from request headers (Next 16: async `headers()`). */
async function getClientIp(): Promise<string> {
  const headerList = await headers();
  // `x-forwarded-for` is a comma-separated list; the first entry is the client.
  const forwardedFor = headerList.get("x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) return first;
  }
  return headerList.get("x-real-ip")?.trim() || "unknown";
}

/**
 * Contact-form Server Action. `useActionState` signature: `(prevState, formData)`.
 * Anti-spam: silent honeypot drop + per-IP rate limit. Validation: the shared
 * zod schema (locale-correct), re-run server-side (never trusts the client).
 *
 * Locale is read from a hidden `locale` form field (the form lives on a
 * `[locale]` page) so the validation + feedback messages match the user's
 * language; an invalid/absent value falls back to English.
 */
export async function submitContactForm(
  _prevState: ContactFormState,
  formData: FormData,
): Promise<ContactFormState> {
  const localeRaw = formData.get("locale");
  const locale =
    typeof localeRaw === "string" && isLocale(localeRaw)
      ? localeRaw
      : DEFAULT_LOCALE;
  const feedback = getContact(locale).form.feedback;

  // 1) Honeypot — a filled hidden field means a bot. Report success so the bot
  //    gets no signal, but persist nothing.
  const honeypot = formData.get(CONTACT_HONEYPOT_FIELD);
  if (typeof honeypot === "string" && honeypot.trim() !== "") {
    return { status: "success" };
  }

  // 2) Rate limit (best-effort, per-instance).
  const ip = await getClientIp();
  if (ip !== "unknown" && isRateLimited(ip)) {
    return { status: "error", formError: feedback.rateLimited };
  }

  // 3) Validate with the shared (locale-correct) schema.
  const parsed = getContactFormSchema(locale).safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    siteUrl: formData.get("siteUrl"),
    message: formData.get("message"),
  });

  if (!parsed.success) {
    const { z } = await import("zod");
    const fieldErrors = z.flattenError(parsed.error)
      .fieldErrors as ContactFieldErrors;
    return { status: "error", fieldErrors };
  }

  // 4) Persist via the swappable storage adapter.
  const lead: Lead = {
    ...parsed.data,
    receivedAt: new Date().toISOString(),
    ip: ip === "unknown" ? undefined : ip,
  };

  try {
    const result = await saveLead(lead);
    if (!result.ok) {
      return { status: "error", formError: feedback.errorGeneral };
    }
    return { status: "success" };
  } catch {
    // Never leak provider internals to the client.
    return { status: "error", formError: feedback.errorGeneral };
  }
}
