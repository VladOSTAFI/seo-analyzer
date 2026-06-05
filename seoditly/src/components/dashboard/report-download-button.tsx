"use client";

import { Download } from "lucide-react";

import { reportProxyPath } from "@/lib/api/client-paths";
import { Button } from "@/components/ui/button";

/**
 * Report download control. The `.xlsx` is NEVER fetched through client JS or
 * the server API client — the button is an anchor pointing the browser at
 * `/api/proxy/audits/:id/report`, where the proxy route handler attaches the
 * Bearer token server-side and streams the upstream body straight through. So
 * the browser still never talks to the backend directly, and the token never
 * reaches client code.
 *
 * Gating: the backend returns `409` until the report exists, so the button is
 * DISABLED until `reportReady` (i.e. the audit's `reportPath` is non-null). A
 * disabled <button> replaces the anchor in that state.
 */
export function ReportDownloadButton({
  auditId,
  reportReady,
}: {
  auditId: string;
  reportReady: boolean;
}) {
  if (!reportReady) {
    return (
      <Button
        disabled
        variant="outline"
        className="h-10 px-4 text-sm font-medium"
        title="The report is generated once the audit reaches the reporting stage."
      >
        <Download aria-hidden />
        Download report
      </Button>
    );
  }

  return (
    <Button
      asChild
      variant="outline"
      className="h-10 px-4 text-sm font-medium"
    >
      <a href={reportProxyPath(auditId)} download>
        <Download aria-hidden />
        Download report
      </a>
    </Button>
  );
}
