import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthForm } from "@/components/auth/auth-form";
import { registerAction } from "@/app/[locale]/(auth)/actions";
import { initialAuthState } from "@/app/[locale]/(auth)/state";
import { getCurrentUser } from "@/lib/auth/current-user";
import { DASHBOARD_HREF, LOGIN_HREF } from "@/lib/constants";
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
    title: meta.registerTitle,
    description: meta.registerDescription,
    alternates: alternatesFor("/register", locale),
  };
}

/**
 * Registration page. Already-authenticated visitors are bounced to the
 * (locale-correct) dashboard. On success the action signs the user in (sets
 * cookies) and redirects, so there is no separate "now log in" step.
 */
export default async function RegisterPage({
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
          {t.register.heading}
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {t.register.subhead}
        </p>
      </div>

      <AuthForm
        mode="register"
        locale={locale}
        action={registerAction}
        initialState={initialAuthState}
        labels={t.form}
        submitLabel={t.register.submit}
        submitPendingLabel={t.register.submitPending}
        alt={{
          prompt: t.register.altPrompt,
          href: localeHref(LOGIN_HREF, locale),
          label: t.register.altLabel,
        }}
      />
    </div>
  );
}
