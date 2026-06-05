import { redirect } from "next/navigation";

import { hasSession } from "@/lib/auth/session";
import { LOGIN_HREF } from "@/lib/constants";
import { Container } from "@/components/primitives/container";

/**
 * Protected layout for the dashboard route group.
 *
 * Auth boundary: the real gate is `src/middleware.ts`, which runs BEFORE this
 * render and either (a) refreshes an expired access token, (b) redirects
 * anonymous/ended sessions to `/login`, or (c) on a transient backend outage
 * lets the request through with the existing cookies. By the time this layout
 * renders, a live session has a fresh access token.
 *
 * This layout is defence-in-depth ONLY: redirect when there is NO session cookie
 * at all (matching the middleware's anonymity rule). We deliberately do NOT
 * redirect merely because the access JWT is momentarily expired while a refresh
 * token is present — that would re-introduce a forced logout during a backend
 * outage (when the middleware couldn't refresh yet). Identity for display is
 * resolved per-page via `getCurrentUser()`; per-request authorization is still
 * enforced by the backend on every Bearer call.
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!(await hasSession())) redirect(LOGIN_HREF);

  return (
    <div className="py-10 md:py-14">
      <Container>{children}</Container>
    </div>
  );
}
