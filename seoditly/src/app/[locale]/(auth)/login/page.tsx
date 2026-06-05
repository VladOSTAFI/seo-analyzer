import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthForm } from "@/components/auth/auth-form";
import { loginAction } from "@/app/[locale]/(auth)/actions";
import { initialAuthState } from "@/app/[locale]/(auth)/state";
import { getCurrentUser } from "@/lib/auth/current-user";
import { DASHBOARD_HREF, REGISTER_HREF } from "@/lib/constants";
import { DEFAULT_LOCALE, isLocale, localeHref } from "@/lib/i18n/config";
import { alternatesFor } from "@/lib/i18n/metadata";
import { getAuth } from "@/lib/copy/auth";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: raw } = await params;
  const locale = isLocale(raw) ? raw : DEFAULT_LOCALE;
  const { meta } = getAuth(locale);
  return {
    title: meta.loginTitle,
    description: meta.loginDescription,
    alternates: alternatesFor("/login", locale),
  };
}

/**
 * Login page. Already-authenticated visitors are bounced straight to the
 * (locale-correct) dashboard so the form never shows for a live session.
 */
export default async function LoginPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: raw } = await params;
  const locale = isLocale(raw) ? raw : DEFAULT_LOCALE;
  if (await getCurrentUser()) redirect(localeHref(DASHBOARD_HREF, locale));

  const t = getAuth(locale);

  return (
    <div className="rounded-2xl border border-border bg-card p-6 md:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {t.login.heading}
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {t.login.subhead}
        </p>
      </div>

      <AuthForm
        mode="login"
        locale={locale}
        action={loginAction}
        initialState={initialAuthState}
        labels={t.form}
        submitLabel={t.login.submit}
        submitPendingLabel={t.login.submitPending}
        alt={{
          prompt: t.login.altPrompt,
          href: localeHref(REGISTER_HREF, locale),
          label: t.login.altLabel,
        }}
      />
    </div>
  );
}
