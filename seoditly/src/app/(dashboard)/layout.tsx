import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/current-user";
import { LOGIN_HREF } from "@/lib/constants";
import { Container } from "@/components/primitives/container";

/**
 * Protected layout for the dashboard route group. Middleware already bounces
 * cookieless requests to `/login`; this is the authoritative server-side gate
 * (defence in depth) — if the access cookie is missing or its JWT is malformed/
 * expired and no principal resolves, we redirect rather than render a shell for
 * a non-user. Real per-request authorization is still enforced by the backend.
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect(LOGIN_HREF);

  return (
    <div className="py-10 md:py-14">
      <Container>{children}</Container>
    </div>
  );
}
