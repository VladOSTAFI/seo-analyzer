import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";

import { DEFAULT_LOCALE, isLocale } from "@/lib/i18n/config";
import { alternatesFor } from "@/lib/i18n/metadata";
import { getRequestLocale } from "@/lib/i18n/server";
import { getContact } from "@/lib/copy/contact";
import { Container } from "@/components/primitives/container";
import { PillBadge } from "@/components/primitives/pill-badge";
import { ContactForm } from "@/components/contact/contact-form";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: raw } = await params;
  const locale = isLocale(raw) ? raw : DEFAULT_LOCALE;
  const { meta } = getContact(locale);
  return {
    title: meta.title,
    description: meta.description,
    alternates: alternatesFor("/contact", locale),
  };
}

/**
 * Phase 3 — Contact. Intro framing (badge + h1 + muted subhead), the
 * lead-capture form (its strings handed down localized), and a privacy note.
 */
export default async function ContactPage() {
  const locale = await getRequestLocale();
  const { intro, privacy, form } = getContact(locale);

  return (
    <section className="relative overflow-hidden border-b border-border">
      <div
        aria-hidden
        className="pointer-events-none absolute -left-40 -top-40 size-[34rem] rounded-full bg-[radial-gradient(circle,hsl(265_85%_65%/0.16),transparent_70%)] blur-2xl"
      />
      <Container className="relative py-20 md:py-28">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-16">
          {/* Intro framing */}
          <div className="max-w-xl">
            <PillBadge>{intro.badge}</PillBadge>
            <h1 className="mt-6 text-4xl font-semibold tracking-tight text-foreground md:text-5xl md:leading-[1.1]">
              {intro.headline}
            </h1>
            <p className="mt-6 text-lg text-muted-foreground">
              {intro.subhead}
            </p>
          </div>

          {/* Form + privacy note */}
          <div>
            <ContactForm strings={form} locale={locale} />
            <p className="mt-4 flex items-start gap-2 text-sm text-muted-foreground">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              <span>{privacy}</span>
            </p>
          </div>
        </div>
      </Container>
    </section>
  );
}
