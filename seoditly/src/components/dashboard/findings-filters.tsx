"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useMemo } from "react";

import type { Severity } from "@/lib/api/types";
import { SEVERITIES } from "@/lib/api/types";
import { SEVERITY_LABEL } from "@/lib/severity";
import { ALL_RULES, getRuleInfo, humanizeRuleId } from "@/lib/rule-catalog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * Client filter bar for the findings view. Writes the active `severity` and
 * `ruleId` into the URL search params and navigates, so the (Server Component)
 * findings page re-fetches `GET /audits/:id/findings?severity&ruleId` through
 * the Bearer client. State lives in the URL → shareable + back-button friendly.
 *
 * The rule filter is a catalogue-backed `Select` grouped by family: the user
 * picks a human title and we map it back to the canonical `ruleId` query param.
 * If the URL already carries a `ruleId` we don't recognise (backend added a
 * rule first), we surface it as a humanized one-off option so the active filter
 * stays visible and clearable.
 *
 * Changing a filter resets pagination to page 1.
 */
const ALL = "all";

/** Build family → rules from the catalogue, preserving catalogue order. */
function useRulesByFamily() {
  return useMemo(() => {
    const byFamily = new Map<string, typeof ALL_RULES>();
    for (const rule of ALL_RULES) {
      const list = byFamily.get(rule.family) ?? [];
      list.push(rule);
      byFamily.set(rule.family, list);
    }
    return [...byFamily.entries()];
  }, []);
}

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
  const rulesByFamily = useRulesByFamily();

  // An active ruleId that isn't in the catalogue still needs a visible option.
  const unknownActiveRule =
    ruleId && !getRuleInfo(ruleId) ? ruleId : undefined;

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
      if (next.ruleId && next.ruleId !== ALL) params.set("ruleId", next.ruleId);
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

      <div className="flex-1">
        <Label
          htmlFor="findings-rule"
          className="mb-1.5 block text-xs text-muted-foreground"
        >
          Issue
        </Label>
        <Select
          value={ruleId ?? ALL}
          onValueChange={(v) => pushParams({ ruleId: v })}
        >
          <SelectTrigger id="findings-rule" className="h-10 w-full">
            <SelectValue placeholder="All issues" />
          </SelectTrigger>
          <SelectContent className="max-h-80">
            <SelectItem value={ALL}>All issues</SelectItem>
            {unknownActiveRule && (
              <SelectItem value={unknownActiveRule}>
                {humanizeRuleId(unknownActiveRule)}
              </SelectItem>
            )}
            {rulesByFamily.map(([family, rules]) => (
              <SelectGroup key={family}>
                <SelectLabel>{family}</SelectLabel>
                {rules.map((rule) => (
                  <SelectItem key={rule.id} value={rule.id}>
                    {rule.title}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
