import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthForm } from "@/components/auth/auth-form";
import { loginAction } from "@/app/(auth)/actions";
import { initialAuthState } from "@/app/(auth)/state";
import { getCurrentUser } from "@/lib/auth/current-user";
import { DASHBOARD_HREF, REGISTER_HREF, PRODUCT_NAME } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Sign in",
  description: `Sign in to your ${PRODUCT_NAME} dashboard.`,
};

/**
 * Login page. Already-authenticated visitors are bounced straight to the
 * dashboard so the form never shows for a live session.
 */
export default async function LoginPage() {
  if (await getCurrentUser()) redirect(DASHBOARD_HREF);

  return (
    <div className="rounded-2xl border border-border bg-card p-6 md:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Welcome back
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Sign in to view your audits and reports.
        </p>
      </div>

      <AuthForm
        mode="login"
        action={loginAction}
        initialState={initialAuthState}
        submitLabel="Sign in"
        submitPendingLabel="Signing in…"
        alt={{
          prompt: "Don't have an account?",
          href: REGISTER_HREF,
          label: "Create one",
        }}
      />
    </div>
  );
}
