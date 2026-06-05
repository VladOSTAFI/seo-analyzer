"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useMemo } from "react";

import type { Severity } from "@/lib/api/types";
import { SEVERITIES } from "@/lib/api/types";
import { getSeverityLabels } from "@/lib/severity";
import type { Locale } from "@/lib/i18n/config";
import type { Dashboard } from "@/lib/copy/dashboard";
import { getAllRules, getRuleInfoLocalized, humanizeRuleId } from "@/lib/rule-catalog";
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
 * findings page re-fetches. State lives in the URL → shareable + back-button
 * friendly. All labels (severity, rule titles, families) are localized via
 * `locale`; changing a filter resets pagination to page 1.
 */
const ALL = "all";

export function FindingsFilters({
  severity,
  ruleId,
  locale,
  strings,
}: {
  severity?: Severity;
  ruleId?: string;
  locale: Locale;
  strings: Dashboard["findings"];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const severityLabels = getSeverityLabels(locale);

  // Build family → rules from the locale-correct catalogue, preserving order.
  const rulesByFamily = useMemo(() => {
    const all = getAllRules(locale);
    const byFamily = new Map<string, typeof all>();
    for (const rule of all) {
      const list = byFamily.get(rule.family) ?? [];
      list.push(rule);
      byFamily.set(rule.family, list);
    }
    return [...byFamily.entries()];
  }, [locale]);

  // An active ruleId that isn't in the catalogue still needs a visible option.
  const unknownActiveRule =
    ruleId && !getRuleInfoLocalized(locale, ruleId) ? ruleId : undefined;

  function pushParams(next: { severity?: string; ruleId?: string }) {
    const params = new URLSearchParams(searchParams.toString());
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
          {strings.severityLabel}
        </Label>
        <Select
          value={severity ?? ALL}
          onValueChange={(v) => pushParams({ severity: v })}
        >
          <SelectTrigger className="h-10 w-full">
            <SelectValue placeholder={strings.allSeverities} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{strings.allSeverities}</SelectItem>
            {SEVERITIES.map((s) => (
              <SelectItem key={s} value={s}>
                {severityLabels[s]}
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
          {strings.issueLabel}
        </Label>
        <Select
          value={ruleId ?? ALL}
          onValueChange={(v) => pushParams({ ruleId: v })}
        >
          <SelectTrigger id="findings-rule" className="h-10 w-full">
            <SelectValue placeholder={strings.allIssues} />
          </SelectTrigger>
          <SelectContent className="max-h-80">
            <SelectItem value={ALL}>{strings.allIssues}</SelectItem>
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
