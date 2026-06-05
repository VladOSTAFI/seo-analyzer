"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";

import {
  startAuditSchema,
  type StartAuditFieldErrors,
} from "@/lib/validation/audit-url";
import { AUDITS_HREF } from "@/lib/constants";
import { startAuditAction } from "@/app/(dashboard)/audits/actions";
import { initialStartAuditState } from "@/app/(dashboard)/audits/start-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Start-audit form. Submits to the `startAuditAction` Server Action (which
 * re-validates the URL server-side against `startAuditSchema` for SSRF safety,
 * then POSTs `/audits` with the caller's Bearer token attached by the client).
 *
 * UX:
 *   - Client-side runs the SAME zod schema for instant feedback (private-IP /
 *     localhost / non-http(s) URLs are rejected before the round-trip) — but
 *     the server re-validates regardless, so the client is never trusted.
 *   - Loading state via `useFormStatus`; success → sonner toast + route to the
 *     new audit's detail page; form/field errors render inline.
 */
function SubmitButton({ label }: { label?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      disabled={pending}
      aria-disabled={pending}
      className="h-11 px-5 text-sm font-medium"
    >
      <Plus aria-hidden />
      {pending ? "Starting…" : (label ?? "Start audit")}
    </Button>
  );
}

export function StartAuditForm({
  label,
  className,
}: {
  label?: string;
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

  // Success → toast, reset, and route to the new audit's detail page.
  useEffect(() => {
    if (state.status === "success" && state.auditId) {
      toast.success("Audit started", {
        description: "Tracking progress — this page updates automatically.",
      });
      formRef.current?.reset();
      setClientErrors({});
      router.push(`${AUDITS_HREF}/${state.auditId}`);
    } else if (state.status === "error" && state.formError) {
      toast.error("Couldn't start the audit", {
        description: state.formError,
      });
    }
  }, [state, router]);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    const data = new FormData(event.currentTarget);
    const result = startAuditSchema.safeParse({ url: data.get("url") });
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="flex-1">
          <Label htmlFor={`${idPrefix}-url`} className="sr-only">
            URL to audit
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
        <SubmitButton label={label} />
      </div>
    </form>
  );
}
