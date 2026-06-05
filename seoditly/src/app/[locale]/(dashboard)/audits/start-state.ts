import type { StartAuditFieldErrors } from "@/lib/validation/audit-url";

/**
 * Non-action exports for the start-audit form. A `"use server"` file may only
 * export async functions, so the `useActionState` state shape + initial value
 * live here (importable by both the client form and the action module).
 *
 * On success the action returns the new audit's `id` (so the client can toast
 * + route to its detail page); on failure it returns field/form errors.
 */
export interface StartAuditState {
  status: "idle" | "success" | "error";
  /** Present on success — the created audit's id, for redirect. */
  auditId?: string;
  fieldErrors?: StartAuditFieldErrors;
  /** General (non-field) error, e.g. backend unreachable / 5xx. */
  formError?: string;
}

export const initialStartAuditState: StartAuditState = { status: "idle" };
