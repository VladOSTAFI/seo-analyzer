import Link from "next/link";
import { SearchX } from "lucide-react";

import { AUDITS_HREF } from "@/lib/constants";
import { localeHref } from "@/lib/i18n/config";
import { getRequestLocale } from "@/lib/i18n/server";
import { getDashboard } from "@/lib/copy/dashboard";
import { Button } from "@/components/ui/button";

/**
 * Single not-found state for an audit id. Triggered by `notFound()` in the
 * detail/findings pages when the backend returns `404` — which means the audit
 * is missing OR not owned by the caller. We deliberately DON'T distinguish the
 * two (no enumeration). Locale comes from the per-request locale seeded by the
 * `[locale]` root layout.
 */
export default async function AuditNotFound() {
  const locale = await getRequestLocale();
  const t = getDashboard(locale).notFound;

  return (
    <div className="rounded-2xl border border-dashed border-border bg-card/40 px-6 py-16 text-center">
      <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted">
        <SearchX aria-hidden className="size-6 text-muted-foreground" />
      </div>
      <h1 className="mt-5 text-lg font-medium text-foreground">{t.title}</h1>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
        {t.body}
      </p>
      <div className="mt-6">
        <Button asChild variant="outline" className="h-10 px-4 text-sm font-medium">
          <Link href={localeHref(AUDITS_HREF, locale)}>{t.back}</Link>
        </Button>
      </div>
    </div>
  );
}
