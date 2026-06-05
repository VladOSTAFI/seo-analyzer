import type { AuthFieldErrors } from "@/lib/auth/validation";

/**
 * Non-action exports for the auth forms. A `"use server"` file may only export
 * async functions, so the `useActionState` state shape + initial value live
 * here (importable by both the client form and the actions module).
 */
export interface AuthFormState {
  status: "idle" | "error";
  fieldErrors?: AuthFieldErrors;
  /** General (non-field) error, e.g. bad credentials / rate limit / network. */
  formError?: string;
}

export const initialAuthState: AuthFormState = { status: "idle" };
