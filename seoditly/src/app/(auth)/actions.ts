"use server";

import { redirect } from "next/navigation";

import { backendUrl } from "@/lib/api/backend";
import { setSession, clearSession, getAccessToken } from "@/lib/auth/session";
import {
  loginSchema,
  registerSchema,
  type AuthFieldErrors,
} from "@/lib/auth/validation";
import type { AuthFormState } from "@/app/(auth)/state";
import { DASHBOARD_HREF, LOGIN_HREF } from "@/lib/constants";
import type { IssuedTokens } from "@/lib/api/types";

/**
 * Server Actions backing the auth pages. They call the backend's first-party
 * `/auth/*` endpoints, store the issued tokens in httpOnly cookies via
 * `setSession`, and redirect to the dashboard. Field/credential errors surface
 * as inline `AuthFormState` (never thrown), so the forms degrade gracefully.
 *
 * `useActionState` signature: `(prevState, formData) => Promise<state>`.
 * Tokens are NEVER returned to the client — only `setSession` (httpOnly) sees
 * them, and nothing is logged.
 */

const BAD_CREDENTIALS = "Incorrect email or password.";
const DUPLICATE_EMAIL = "An account with this email already exists.";
const TOO_MANY_ATTEMPTS =
  "Too many attempts. Please wait a moment and try again.";
const GENERAL_ERROR = "Something went wrong. Please try again.";
const UNREACHABLE = "Couldn't reach the server. Please try again shortly.";

/** POST to a `/auth/*` endpoint, returning the issued tokens or a status code. */
async function postAuth(
  path: string,
  body: { email: string; password: string },
): Promise<
  | { ok: true; tokens: IssuedTokens }
  | { ok: false; status: number }
> {
  let res: Response;
  try {
    res = await fetch(backendUrl(path), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    return { ok: false, status: 0 };
  }

  if (!res.ok) return { ok: false, status: res.status };

  try {
    const tokens = (await res.json()) as Partial<IssuedTokens>;
    if (
      typeof tokens.accessToken === "string" &&
      typeof tokens.refreshToken === "string"
    ) {
      return {
        ok: true,
        tokens: {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
        },
      };
    }
    return { ok: false, status: 502 };
  } catch {
    return { ok: false, status: 502 };
  }
}

export async function loginAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    const { z } = await import("zod");
    return {
      status: "error",
      fieldErrors: z.flattenError(parsed.error).fieldErrors as AuthFieldErrors,
    };
  }

  const result = await postAuth("/auth/login", parsed.data);
  if (!result.ok) {
    if (result.status === 401) {
      return { status: "error", formError: BAD_CREDENTIALS };
    }
    if (result.status === 429) {
      return { status: "error", formError: TOO_MANY_ATTEMPTS };
    }
    if (result.status === 0) {
      return { status: "error", formError: UNREACHABLE };
    }
    return { status: "error", formError: GENERAL_ERROR };
  }

  await setSession(result.tokens);
  redirect(DASHBOARD_HREF);
}

export async function registerAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = registerSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    const { z } = await import("zod");
    return {
      status: "error",
      fieldErrors: z.flattenError(parsed.error).fieldErrors as AuthFieldErrors,
    };
  }

  const result = await postAuth("/auth/register", parsed.data);
  if (!result.ok) {
    if (result.status === 409) {
      return {
        status: "error",
        fieldErrors: { email: [DUPLICATE_EMAIL] },
      };
    }
    if (result.status === 429) {
      return { status: "error", formError: TOO_MANY_ATTEMPTS };
    }
    if (result.status === 0) {
      return { status: "error", formError: UNREACHABLE };
    }
    return { status: "error", formError: GENERAL_ERROR };
  }

  await setSession(result.tokens);
  redirect(DASHBOARD_HREF);
}

/**
 * Logout Server Action: revoke refresh tokens server-side (`POST /auth/logout`,
 * Bearer), then clear both cookies and redirect to login. Best-effort on the
 * network call — we always clear local cookies so the user is logged out even
 * if the backend is unreachable.
 */
export async function logoutAction(): Promise<void> {
  const accessToken = await getAccessToken();
  if (accessToken) {
    try {
      await fetch(backendUrl("/auth/logout"), {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      });
    } catch {
      // Ignore — clearing the local cookies below still logs the user out.
    }
  }

  await clearSession();
  redirect(LOGIN_HREF);
}
