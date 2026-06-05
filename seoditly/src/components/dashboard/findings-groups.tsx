"use client";

import { useId, useMemo, useState } from "react";
import {
  ChevronDown,
  ExternalLink,
  Info,
  Lightbulb,
  ShieldAlert,
} from "lucide-react";

import type { FindingDto, Severity } from "@/lib/api/types";
import { SEVERITIES } from "@/lib/api/types";
import { stripScheme } from "@/lib/format";
import { resolveRuleInfo, type RuleInfo } from "@/lib/rule-catalog";
import { cn } from "@/lib/utils";
import { SeverityBadge } from "@/components/dashboard/severity-badge";

/**
 * Grouped findings view. Instead of one opaque row per finding, we render one
 * card per distinct `ruleId` in the CURRENT page of results — headed by a
 * human-readable title, severity badge, and affected-count, with plain-language
 * "what / why / how" copy from the rule catalogue, then a collapsible list of
 * the affected URLs and their `detail` blobs underneath.
 *
 * IMPORTANT: grouping happens within the page of findings the server handed us
 * (the route paginates server-side). The affected-count is "on this page"; the
 * page-level pagination still walks the full result set.
 *
 * Presentation-only and self-contained: the collapsible is a real
 * `<button aria-expanded>` + region, keyboard-operable, no new dependency.
 */

const SEVERITY_RANK: Record<Severity, number> = SEVERITIES.reduce(
  (acc, sev, i) => {
    acc[sev] = i;
    return acc;
  },
  {} as Record<Severity, number>,
);

/** A rule group: the resolved copy + every finding on this page under it. */
interface RuleGroup {
  info: RuleInfo;
  findings: FindingDto[];
}

/** Group the current page of findings by ruleId, sorted by severity then size. */
function groupByRule(items: FindingDto[]): RuleGroup[] {
  const byRule = new Map<string, RuleGroup>();
  for (const f of items) {
    let group = byRule.get(f.ruleId);
    if (!group) {
      group = { info: resolveRuleInfo(f.ruleId, f.severity), findings: [] };
      byRule.set(f.ruleId, group);
    }
    group.findings.push(f);
  }
  return [...byRule.values()].sort((a, b) => {
    const sev = SEVERITY_RANK[a.info.severity] - SEVERITY_RANK[b.info.severity];
    if (sev !== 0) return sev;
    return b.findings.length - a.findings.length;
  });
}

/** How many affected URLs to show before the "show all" expander kicks in. */
const URL_PREVIEW = 5;

/** Render the jsonb `detail` as compact, humanized `key: value` pairs. */
function DetailLine({ detail }: { detail: Record<string, unknown> }) {
  const entries = Object.entries(detail ?? {});
  if (entries.length === 0) return null;
  return (
    <span className="font-mono text-xs text-muted-foreground">
      {entries.slice(0, 4).map(([k, v], i) => (
        <span key={k}>
          {i > 0 && <span className="text-muted-foreground/40"> · </span>}
          <span className="text-muted-foreground/70">{humanizeKey(k)}:</span>{" "}
          <span className="text-foreground/90">
            {typeof v === "object" ? JSON.stringify(v) : String(v)}
          </span>
        </span>
      ))}
    </span>
  );
}

/** `targetUrl` → "Target url"; keep it cheap, just split camel/snake/kebab. */
function humanizeKey(key: string): string {
  const spaced = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[-_]/g, " ")
    .toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function AffectedRow({ finding }: { finding: FindingDto }) {
  const hasDetail = Object.keys(finding.detail ?? {}).length > 0;
  return (
    <li className="flex flex-col gap-0.5 border-t border-border/60 px-4 py-2.5 first:border-t-0">
      {finding.url ? (
        <a
          href={finding.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex max-w-full items-center gap-1 truncate font-mono text-xs text-primary underline-offset-4 hover:underline"
          title={finding.url}
        >
          <span className="truncate">{stripScheme(finding.url)}</span>
          <ExternalLink className="size-3 shrink-0 opacity-70" aria-hidden />
        </a>
      ) : (
        <span className="font-mono text-xs text-muted-foreground/70">
          — site-wide —
        </span>
      )}
      {hasDetail && <DetailLine detail={finding.detail} />}
    </li>
  );
}

function RuleGroupCard({ group }: { group: RuleGroup }) {
  const { info, findings } = group;
  const count = findings.length;
  const [showAll, setShowAll] = useState(false);
  const regionId = useId();

  const visible = showAll ? findings : findings.slice(0, URL_PREVIEW);
  const hiddenCount = findings.length - visible.length;
  const collapsible = findings.length > URL_PREVIEW;

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card">
      <header className="flex flex-wrap items-start justify-between gap-3 p-5">
        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <SeverityBadge severity={info.severity} />
            <h2 className="text-base font-semibold tracking-tight text-foreground">
              {info.title}
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span className="rounded-md bg-muted px-1.5 py-0.5 font-medium text-muted-foreground">
              {info.family}
            </span>
            <span aria-hidden className="text-muted-foreground/40">
              ·
            </span>
            <code
              className="font-mono text-[11px] text-muted-foreground/80"
              title="Technical rule id (used by support)"
            >
              {info.id}
            </code>
          </div>
        </div>
        <span className="shrink-0 rounded-full border border-border bg-muted/40 px-2.5 py-1 text-xs font-medium text-muted-foreground">
          {count} {count === 1 ? "page affected" : "pages affected"}
        </span>
      </header>

      <div className="grid gap-3 px-5 pb-5 sm:grid-cols-3">
        <Explainer icon={Info} label="What we found" text={info.whatItFlags} />
        <Explainer
          icon={ShieldAlert}
          label="Why it matters"
          text={info.whyItMatters}
        />
        <Explainer icon={Lightbulb} label="How to fix it" text={info.howToFix} />
      </div>

      <div className="border-t border-border bg-muted/20">
        <p className="px-4 pt-3 text-[11px] font-medium tracking-wide text-muted-foreground/80 uppercase">
          Affected {findings[0]?.url ? "pages" : "scope"}
        </p>
        <ul id={regionId} className="px-1 py-1">
          {visible.map((f) => (
            <AffectedRow key={f.id} finding={f} />
          ))}
        </ul>
        {collapsible && (
          <div className="px-4 pb-3">
            <button
              type="button"
              aria-expanded={showAll}
              aria-controls={regionId}
              onClick={() => setShowAll((v) => !v)}
              className="inline-flex items-center gap-1 rounded-md text-xs font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <ChevronDown
                className={cn(
                  "size-3.5 transition-transform",
                  showAll && "rotate-180",
                )}
                aria-hidden
              />
              {showAll
                ? "Show fewer"
                : `Show all ${findings.length} (${hiddenCount} more)`}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

function Explainer({
  icon: Icon,
  label,
  text,
}: {
  icon: typeof Info;
  label: string;
  text: string;
}) {
  return (
    <div className="space-y-1">
      <p className="flex items-center gap-1.5 text-xs font-medium text-foreground/80">
        <Icon className="size-3.5 text-muted-foreground" aria-hidden />
        {label}
      </p>
      <p className="text-sm leading-relaxed text-muted-foreground">{text}</p>
    </div>
  );
}

export function FindingsGroups({
  items,
  total,
}: {
  items: FindingDto[];
  total: number;
}) {
  const groups = useMemo(() => groupByRule(items), [items]);

  if (items.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-border bg-card/40 px-4 py-10 text-center text-sm text-muted-foreground">
        No findings for this filter.
      </p>
    );
  }

  const truncated = total > items.length;

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        {groups.length} {groups.length === 1 ? "issue" : "issues"} on this page
        {truncated ? `, ${items.length} of ${total} findings shown` : ""}.
      </p>

      {groups.map((group) => (
        <RuleGroupCard key={group.info.id} group={group} />
      ))}

      {truncated && (
        <p className="text-xs text-muted-foreground">
          Showing the first {items.length} of {total} findings. Use the page
          controls below, or filter by severity or rule, to see the rest.
        </p>
      )}
    </div>
  );
}
