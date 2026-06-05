import type { Metadata } from "next";
import Link from "next/link";
import { FileSearch, Activity, FileSpreadsheet, ArrowRight } from "lucide-react";

import { getCurrentUser } from "@/lib/auth/current-user";
import { listAudits, ApiError } from "@/lib/api/client";
import { PRODUCT_NAME, AUDITS_HREF } from "@/lib/constants";
import type { AuditDto } from "@/lib/api/types";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AuditsTable } from "@/components/dashboard/audits-table";
import { StartAuditForm } from "@/components/dashboard/start-audit-form";

export const metadata: Metadata = {
  title: "Dashboard",
  description: `Your ${PRODUCT_NAME} audit overview.`,
};

/**
 * Dashboard overview (Phase 5 — live). Fetches a small slice of the caller's
 * audits via the Bearer API client and shows: a start-audit form, a "recent
 * audits" preview (linking to the full list), and roll-up counters.
 *
 * `force-dynamic` keeps this per-request so it compiles + renders with the
 * backend DOWN — an unreachable backend degrades to empty counters and a soft
 * note rather than failing the build.
 */
export const dynamic = "force-dynamic";

const RECENT_LIMIT = 5;

export default async function DashboardPage() {
  const user = await getCurrentUser();
  const isAdmin = user?.role === "admin";

  let recent: AuditDto[] = [];
  let total = 0;
  let unreachable = false;
  try {
    const page = await listAudits(RECENT_LIMIT, 0);
    recent = page.items;
    total = page.total;
  } catch (e) {
    unreachable = e instanceof ApiError && e.status === 0;
  }

  const overview = [
    {
      icon: Activity,
      label: "Audits run",
      value: unreachable ? "—" : String(total),
      sub: "Across all your sites.",
    },
    {
      icon: FileSearch,
      label: "Latest status",
      value: recent[0]?.status ?? "—",
      sub: "Your most recent audit.",
    },
    {
      icon: FileSpreadsheet,
      label: "Reports",
      value: unreachable
        ? "—"
        : String(recent.filter((a) => a.reportPath !== null).length),
      sub: "Ready to download (recent).",
    },
  ];

  return (
    <div className="space-y-10">
      {/* Header */}
      <header className="flex flex-col gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
            Dashboard
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {user ? (
              <>
                Signed in as{" "}
                <span className="text-foreground">{user.email}</span>
                {isAdmin && (
                  <span className="ml-2 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                    admin
                  </span>
                )}
              </>
            ) : (
              "Welcome back."
            )}
          </p>
        </div>

        {/* Start audit (live). */}
        <div className="rounded-2xl border border-border bg-card p-5 md:p-6">
          <h2 className="mb-3 text-sm font-medium text-foreground">
            Start a new audit
          </h2>
          <StartAuditForm />
        </div>
      </header>

      {/* Overview cards */}
      <section aria-label="Overview" className="grid gap-4 sm:grid-cols-3">
        {overview.map(({ icon: Icon, label, value, sub }) => (
          <Card key={label}>
            <CardHeader>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Icon aria-hidden className="size-4 text-primary" />
                <CardDescription>{label}</CardDescription>
              </div>
              <CardTitle className="text-3xl font-semibold capitalize tracking-tight text-foreground">
                {value}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{sub}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      {/* Recent audits preview / empty state. */}
      <section aria-label="Recent audits" className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium text-foreground">
            {isAdmin ? "Recent audits (all users)" : "Recent audits"}
          </h2>
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="h-9 text-sm text-muted-foreground"
          >
            <Link href={AUDITS_HREF}>
              View all
              <ArrowRight aria-hidden />
            </Link>
          </Button>
        </div>

        {unreachable ? (
          <div className="rounded-2xl border border-dashed border-border bg-card/40 px-6 py-10 text-center text-sm text-muted-foreground">
            Your audits will appear here once the backend is available.
          </div>
        ) : recent.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card/40 px-6 py-16 text-center">
            <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/10">
              <FileSearch aria-hidden className="size-6 text-primary" />
            </div>
            <h3 className="mt-5 text-base font-medium text-foreground">
              No audits yet
            </h3>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              Start your first audit above. Its status, severity rollups, and
              report will show up here.
            </p>
          </div>
        ) : (
          <AuditsTable items={recent} />
        )}
      </section>
    </div>
  );
}
