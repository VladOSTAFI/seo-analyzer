"use server";

import { revalidatePath } from "next/cache";

import { createAudit, ApiError } from "@/lib/api/client";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  getStartAuditSchema,
  type StartAuditFieldErrors,
} from "@/lib/validation/audit-url";
import { AUDITS_HREF } from "@/lib/constants";
import { DEFAULT_LOCALE, isLocale, localeHref } from "@/lib/i18n/config";
import { getDashboard } from "@/lib/copy/dashboard";
import {
  type StartAuditState,
} from "@/app/[locale]/(dashboard)/audits/start-state";

/**
 * Server Action behind the "Start audit" form.
 *
 * Defence in depth, in order:
 *   1. AUTH — re-check the session here (a Server Action is reachable via a raw
 *      POST, not just the UI), so we never start an audit for an anon caller.
 *   2. SSRF — re-run `startAuditSchema` (which calls `rejectUnsafeAuditUrl`)
 *      server-side, AUTHORITATIVELY, before touching the backend.
 *   3. The backend then stamps `ownerId` from the Bearer token and runs the
 *      pipeline fire-and-forget.
 *
 * On success we `revalidatePath` the (locale-correct) list so the new audit
 * appears, and return the new id; the client toasts + routes to the detail page.
 * Error messages are localized via the hidden `locale` form field. Nothing is
 * logged (no URL/token/PII).
 */
export async function startAuditAction(
  _prevState: StartAuditState,
  formData: FormData,
): Promise<StartAuditState> {
  const localeRaw = formData.get("locale");
  const locale =
    typeof localeRaw === "string" && isLocale(localeRaw)
      ? localeRaw
      : DEFAULT_LOCALE;
  const errors = getDashboard(locale).startForm.actionErrors;

  // 1. Auth gate (Server Actions are directly POST-able).
  const user = await getCurrentUser();
  if (!user) {
    return { status: "error", formError: errors.sessionEnded };
  }

  // 2. SSRF-safe URL validation (authoritative).
  const parsed = getStartAuditSchema(locale).safeParse({ url: formData.get("url") });
  if (!parsed.success) {
    const { z } = await import("zod");
    return {
      status: "error",
      fieldErrors: z.flattenError(parsed.error)
        .fieldErrors as StartAuditFieldErrors,
    };
  }

  // 3. Hand off to the backend (Bearer attached by the client; stamps ownerId).
  try {
    const created = await createAudit(parsed.data.url);
    revalidatePath(localeHref(AUDITS_HREF, locale));
    return { status: "success", auditId: created.id };
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 401) {
        return { status: "error", formError: errors.sessionEnded };
      }
      if (error.status === 0) {
        return { status: "error", formError: errors.unreachable };
      }
      // 400 from the backend (e.g. its own URL parsing) → surface on the field.
      if (error.status === 400) {
        return { status: "error", fieldErrors: { url: [error.message] } };
      }
    }
    return { status: "error", formError: errors.general };
  }
}
