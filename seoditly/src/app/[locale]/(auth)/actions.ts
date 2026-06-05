"use server";

import { redirect } from "next/navigation";

import { backendUrl } from "@/lib/api/backend";
import { setSession, clearSession, getAccessToken } from "@/lib/auth/session";
import {
  getLoginSchema,
  getRegisterSchema,
  type AuthFieldErrors,
} from "@/lib/auth/validation";
import type { AuthFormState } from "@/app/[locale]/(auth)/state";
import { DASHBOARD_HREF, LOGIN_HREF } from "@/lib/constants";
import { DEFAULT_LOCALE, isLocale, localeHref, type Locale } from "@/lib/i18n/config";
import { getAuth } from "@/lib/copy/auth";
import type { IssuedTokens } from "@/lib/api/types";

/**
 * Server Actions backing the auth pages. They call the backend's first-party
 * `/auth/*` endpoints, store the issued tokens in httpOnly cookies via
 * `setSession`, and redirect to the LOCALE-CORRECT dashboard. Field/credential
 * errors surface as inline `AuthFormState` (never thrown), localized to the
 * caller's language.
 *
 * `useActionState` signature: `(prevState, formData) => Promise<state>`.
 * Tokens are NEVER returned to the client — only `setSession` (httpOnly) sees
 * them, and nothing is logged. The active locale is read from a hidden `locale`
 * form field (the form lives on a `[locale]` page); an absent/invalid value
 * falls back to English.
 */

function localeFromForm(formData: FormData): Locale {
  const raw = formData.get("locale");
  return typeof raw === "string" && isLocale(raw) ? raw : DEFAULT_LOCALE;
}

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
  const locale = localeFromForm(formData);
  const errors = getAuth(locale).errors;

  const parsed = getLoginSchema(locale).safeParse({
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
      return { status: "error", formError: errors.badCredentials };
    }
    if (result.status === 429) {
      return { status: "error", formError: errors.tooManyAttempts };
    }
    if (result.status === 0) {
      return { status: "error", formError: errors.unreachable };
    }
    return { status: "error", formError: errors.general };
  }

  await setSession(result.tokens);
  redirect(localeHref(DASHBOARD_HREF, locale));
}

export async function registerAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const locale = localeFromForm(formData);
  const errors = getAuth(locale).errors;

  const parsed = getRegisterSchema(locale).safeParse({
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
        fieldErrors: { email: [errors.duplicateEmail] },
      };
    }
    if (result.status === 429) {
      return { status: "error", formError: errors.tooManyAttempts };
    }
    if (result.status === 0) {
      return { status: "error", formError: errors.unreachable };
    }
    return { status: "error", formError: errors.general };
  }

  await setSession(result.tokens);
  redirect(localeHref(DASHBOARD_HREF, locale));
}

/**
 * Logout Server Action: revoke refresh tokens server-side (`POST /auth/logout`,
 * Bearer), then clear both cookies and redirect to the LOCALE-CORRECT login.
 * Best-effort on the network call — we always clear local cookies. The active
 * locale comes from a hidden `locale` field in the logout form.
 */
export async function logoutAction(formData: FormData): Promise<void> {
  const locale = localeFromForm(formData);
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
  redirect(localeHref(LOGIN_HREF, locale));
}
