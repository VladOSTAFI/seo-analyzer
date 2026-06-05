"use server";

import { revalidatePath } from "next/cache";

import { createAudit, ApiError } from "@/lib/api/client";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  startAuditSchema,
  type StartAuditFieldErrors,
} from "@/lib/validation/audit-url";
import { AUDITS_HREF } from "@/lib/constants";
import {
  type StartAuditState,
} from "@/app/(dashboard)/audits/start-state";

/**
 * Server Action behind the "Start audit" form.
 *
 * Defence in depth, in order:
 *   1. AUTH — re-check the session here (a Server Action is reachable via a raw
 *      POST, not just the UI), so we never start an audit for an anon caller.
 *   2. SSRF — re-run `startAuditSchema` (which calls `rejectUnsafeAuditUrl`)
 *      server-side, AUTHORITATIVELY, before touching the backend. The backend
 *      does no target-host validation, so this is where private IPs / localhost
 *      / non-http(s) URLs are rejected with a field error. The client runs the
 *      same schema for fast feedback but is never trusted.
 *   3. The backend then stamps `ownerId` from the Bearer token (ownership is
 *      automatic) and runs the pipeline fire-and-forget.
 *
 * On success we `revalidatePath` the list so the new (running) audit appears,
 * and return the new id; the client toasts + routes to the detail page. Nothing
 * is logged (no URL/token/PII).
 */
const UNREACHABLE = "Couldn't reach the server. Please try again shortly.";
const SESSION_ENDED = "Your session expired. Please sign in again.";
const GENERAL_ERROR = "Couldn't start the audit. Please try again.";

export async function startAuditAction(
  _prevState: StartAuditState,
  formData: FormData,
): Promise<StartAuditState> {
  // 1. Auth gate (Server Actions are directly POST-able).
  const user = await getCurrentUser();
  if (!user) {
    return { status: "error", formError: SESSION_ENDED };
  }

  // 2. SSRF-safe URL validation (authoritative).
  const parsed = startAuditSchema.safeParse({ url: formData.get("url") });
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
    revalidatePath(AUDITS_HREF);
    return { status: "success", auditId: created.id };
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 401) {
        return { status: "error", formError: SESSION_ENDED };
      }
      if (error.status === 0) {
        return { status: "error", formError: UNREACHABLE };
      }
      // 400 from the backend (e.g. its own URL parsing) → surface on the field.
      if (error.status === 400) {
        return { status: "error", fieldErrors: { url: [error.message] } };
      }
    }
    return { status: "error", formError: GENERAL_ERROR };
  }
}
