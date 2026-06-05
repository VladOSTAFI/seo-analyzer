"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";

import type { Severity } from "@/lib/api/types";
import { SEVERITIES } from "@/lib/api/types";
import { SEVERITY_LABEL } from "@/lib/severity";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * Client filter bar for the findings view. Writes the active `severity` and
 * `ruleId` into the URL search params and navigates, so the (Server Component)
 * findings page re-fetches `GET /audits/:id/findings?severity&ruleId` through
 * the Bearer client. State lives in the URL → shareable + back-button friendly.
 *
 * Changing a filter resets pagination to page 1.
 */
const ALL = "all";

export function FindingsFilters({
  severity,
  ruleId,
}: {
  severity?: Severity;
  ruleId?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [ruleInput, setRuleInput] = useState(ruleId ?? "");

  function pushParams(next: { severity?: string; ruleId?: string }) {
    const params = new URLSearchParams(searchParams.toString());
    // Filtering changes the result set — always return to page 1.
    params.delete("page");

    if ("severity" in next) {
      if (next.severity && next.severity !== ALL) {
        params.set("severity", next.severity);
      } else {
        params.delete("severity");
      }
    }
    if ("ruleId" in next) {
      if (next.ruleId) params.set("ruleId", next.ruleId);
      else params.delete("ruleId");
    }

    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
      <div className="sm:w-48">
        <Label className="mb-1.5 block text-xs text-muted-foreground">
          Severity
        </Label>
        <Select
          value={severity ?? ALL}
          onValueChange={(v) => pushParams({ severity: v })}
        >
          <SelectTrigger className="h-10 w-full">
            <SelectValue placeholder="All severities" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All severities</SelectItem>
            {SEVERITIES.map((s) => (
              <SelectItem key={s} value={s}>
                {SEVERITY_LABEL[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <form
        className="flex flex-1 items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          pushParams({ ruleId: ruleInput.trim() });
        }}
      >
        <div className="flex-1">
          <Label
            htmlFor="findings-rule"
            className="mb-1.5 block text-xs text-muted-foreground"
          >
            Rule
          </Label>
          <Input
            id="findings-rule"
            value={ruleInput}
            onChange={(e) => setRuleInput(e.target.value)}
            placeholder="e.g. meta-description-missing"
            className="h-10 font-mono text-xs"
          />
        </div>
      </form>
    </div>
  );
}
