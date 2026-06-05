import { redirect } from "next/navigation";

import { hasSession } from "@/lib/auth/session";
import { LOGIN_HREF } from "@/lib/constants";
import { DEFAULT_LOCALE, isLocale, localeHref } from "@/lib/i18n/config";
import { Container } from "@/components/primitives/container";

/**
 * Protected layout for the dashboard route group.
 *
 * Auth boundary: the real gate is `src/middleware.ts`, which runs BEFORE this
 * render and either (a) refreshes an expired access token, (b) redirects
 * anonymous/ended sessions to the locale-correct `/login`, or (c) on a transient
 * backend outage lets the request through with the existing cookies. By the time
 * this layout renders, a live session has a fresh access token.
 *
 * This layout is defence-in-depth ONLY: redirect (to the locale-correct login)
 * when there is NO session cookie at all. We deliberately do NOT redirect merely
 * because the access JWT is momentarily expired while a refresh token is present
 * — that would re-introduce a forced logout during a backend outage.
 */
export default async function DashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale: raw } = await params;
  const locale = isLocale(raw) ? raw : DEFAULT_LOCALE;
  if (!(await hasSession())) redirect(localeHref(LOGIN_HREF, locale));

  return (
    <div className="py-10 md:py-14">
      <Container>{children}</Container>
    </div>
  );
}
