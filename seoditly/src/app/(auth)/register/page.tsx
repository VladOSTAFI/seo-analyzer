import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthForm } from "@/components/auth/auth-form";
import { registerAction } from "@/app/(auth)/actions";
import { initialAuthState } from "@/app/(auth)/state";
import { getCurrentUser } from "@/lib/auth/current-user";
import { DASHBOARD_HREF, LOGIN_HREF, PRODUCT_NAME } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Create account",
  description: `Create a ${PRODUCT_NAME} account to run technical SEO audits.`,
};

/**
 * Registration page. Already-authenticated visitors are bounced to the
 * dashboard. On success the action signs the user in (sets cookies) and
 * redirects, so there is no separate "now log in" step.
 */
export default async function RegisterPage() {
  if (await getCurrentUser()) redirect(DASHBOARD_HREF);

  return (
    <div className="rounded-2xl border border-border bg-card p-6 md:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Create your account
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Start running automated technical SEO audits.
        </p>
      </div>

      <AuthForm
        mode="register"
        action={registerAction}
        initialState={initialAuthState}
        submitLabel="Create account"
        submitPendingLabel="Creating account…"
        alt={{
          prompt: "Already have an account?",
          href: LOGIN_HREF,
          label: "Sign in",
        }}
      />
    </div>
  );
}
