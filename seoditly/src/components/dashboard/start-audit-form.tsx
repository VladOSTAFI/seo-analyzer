"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronDown, Plus } from "lucide-react";

import {
  getStartAuditSchema,
  type StartAuditFieldErrors,
} from "@/lib/validation/audit-url";
import { AUDITS_HREF } from "@/lib/constants";
import { localeHref, type Locale } from "@/lib/i18n/config";
import type { Dashboard } from "@/lib/copy/dashboard";
import { startAuditAction } from "@/app/[locale]/(dashboard)/audits/actions";
import { initialStartAuditState } from "@/app/[locale]/(dashboard)/audits/start-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type StartStrings = Dashboard["startForm"];

/**
 * Start-audit form. Submits to the `startAuditAction` Server Action (which
 * re-validates the URL server-side against the locale-correct schema for SSRF
 * safety, then POSTs `/audits` with the caller's Bearer token).
 *
 * Locale: the same (localized) zod schema runs client-side for instant feedback;
 * a hidden `locale` field tells the action which language to validate/respond
 * in; success routes to the locale-correct detail page.
 *
 * Split submit: the visible primary button submits `profile=standard` (a fast
 * audit); the caret opens a menu whose item submits `profile=full` (slower —
 * also checks image weight & external links). A clicked submit button
 * contributes its own `name`/`value` to the FormData, so the choice rides along
 * the existing Server Action with no extra state. Both buttons disable while a
 * submission is pending (`useFormStatus`).
 */
function SubmitButtons({ strings }: { strings: StartStrings }) {
  const { pending } = useFormStatus();
  return (
    <div className="flex">
      <Button
        type="submit"
        name="profile"
        value="standard"
        disabled={pending}
        aria-disabled={pending}
        className="h-11 rounded-r-none px-5 text-sm font-medium"
      >
        <Plus aria-hidden />
        {pending ? strings.starting : strings.startAudit}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            disabled={pending}
            aria-disabled={pending}
            aria-label={strings.fullAudit}
            className="h-11 rounded-l-none border-l border-l-primary-foreground/20 px-2.5"
          >
            <ChevronDown aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-72">
          <DropdownMenuItem asChild disabled={pending}>
            <button
              type="submit"
              name="profile"
              value="full"
              disabled={pending}
              className="w-full flex-col items-start gap-0.5"
            >
              <span className="font-medium">{strings.fullAudit}</span>
              <span className="text-xs text-muted-foreground group-focus/dropdown-menu-item:text-accent-foreground">
                {strings.fullAuditHint}
              </span>
            </button>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function StartAuditForm({
  locale,
  strings,
  className,
}: {
  locale: Locale;
  strings: StartStrings;
  className?: string;
}) {
  const [state, formAction] = useActionState(
    startAuditAction,
    initialStartAuditState,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const idPrefix = useId();

  const [clientErrors, setClientErrors] = useState<StartAuditFieldErrors>({});
  const serverErrors = state.status === "error" ? state.fieldErrors : undefined;
  const errors: StartAuditFieldErrors = { ...serverErrors, ...clientErrors };

  // Success → toast, reset, and route to the new audit's (locale-correct) detail.
  useEffect(() => {
    if (state.status === "success" && state.auditId) {
      toast.success(strings.successTitle, {
        description: strings.successBody,
      });
      formRef.current?.reset();
      setClientErrors({});
      router.push(localeHref(`${AUDITS_HREF}/${state.auditId}`, locale));
    } else if (state.status === "error" && state.formError) {
      toast.error(strings.errorTitle, {
        description: state.formError,
      });
    }
  }, [state, router, locale, strings]);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    const data = new FormData(event.currentTarget);
    const result = getStartAuditSchema(locale).safeParse({ url: data.get("url") });
    if (!result.success) {
      event.preventDefault();
      setClientErrors(
        result.error.flatten().fieldErrors as StartAuditFieldErrors,
      );
      return;
    }
    setClientErrors({});
  }

  const errorId = `${idPrefix}-url-error`;
  const hasError = Boolean(errors.url?.length);

  return (
    <form
      ref={formRef}
      action={formAction}
      onSubmit={handleSubmit}
      noValidate
      className={className}
    >
      <input type="hidden" name="locale" value={locale} />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="flex-1">
          <Label htmlFor={`${idPrefix}-url`} className="sr-only">
            {strings.urlLabel}
          </Label>
          <Input
            id={`${idPrefix}-url`}
            name="url"
            type="url"
            inputMode="url"
            required
            maxLength={2048}
            autoComplete="off"
            placeholder="https://example.com"
            aria-invalid={hasError}
            aria-describedby={hasError ? errorId : undefined}
            className="h-11"
          />
          {hasError && (
            <p id={errorId} className="mt-1.5 text-sm text-destructive" aria-live="polite">
              {errors.url?.[0]}
            </p>
          )}
        </div>
        <SubmitButtons strings={strings} />
      </div>
    </form>
  );
}
