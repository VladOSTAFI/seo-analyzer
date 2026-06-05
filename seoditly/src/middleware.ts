import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import {
  COOKIE_ACCESS_TOKEN,
  COOKIE_REFRESH_TOKEN,
  LOGIN_HREF,
} from "@/lib/constants";

/**
 * Edge gate for the `(dashboard)` route group. Anonymous requests (no session
 * cookie present) are redirected to `/login`. This is a CHEAP presence check
 * only — full token validation + transparent refresh happen server-side in the
 * proxy / API client. The cookies are httpOnly, so this never exposes a token.
 *
 * Note: Next 16 renamed `middleware` → `proxy`; the `middleware` filename is
 * still supported. We keep `middleware.ts` per the implementation plan. The
 * function is the single export the convention expects.
 *
 * `matcher` targets only `/dashboard` (+ subpaths). A signed-in user holds at
 * least one of the token cookies; the proxy clears both when refresh fails, so
 * "no cookie at all" reliably means "logged out".
 */
export function middleware(request: NextRequest) {
  const hasSession =
    request.cookies.has(COOKIE_ACCESS_TOKEN) ||
    request.cookies.has(COOKIE_REFRESH_TOKEN);

  if (hasSession) return NextResponse.next();

  const loginUrl = new URL(LOGIN_HREF, request.url);
  // Preserve where the user was headed so we could return them post-login.
  loginUrl.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
