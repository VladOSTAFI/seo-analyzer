"use client";

import { Download } from "lucide-react";

import { reportProxyPath } from "@/lib/api/client-paths";
import { Button } from "@/components/ui/button";

/**
 * Report download control. The `.xlsx` is NEVER fetched through client JS or
 * the server API client — the button is an anchor pointing the browser at
 * `/api/proxy/audits/:id/report`, where the proxy route handler attaches the
 * Bearer token server-side and streams the upstream body straight through.
 *
 * Gating: the backend returns `409` until the report exists, so the button is
 * DISABLED until `reportReady`. Labels are passed in (localized).
 */
export function ReportDownloadButton({
  auditId,
  reportReady,
  label,
  notReadyTitle,
}: {
  auditId: string;
  reportReady: boolean;
  label: string;
  notReadyTitle: string;
}) {
  if (!reportReady) {
    return (
      <Button
        disabled
        variant="outline"
        className="h-10 px-4 text-sm font-medium"
        title={notReadyTitle}
      >
        <Download aria-hidden />
        {label}
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
        {label}
      </a>
    </Button>
  );
}
