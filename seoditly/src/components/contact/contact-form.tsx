"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { CheckCircle2 } from "lucide-react";

import type { Locale } from "@/lib/i18n/config";
import type { Contact } from "@/lib/copy/contact";
import {
  CONTACT_HONEYPOT_FIELD,
  getContactFormSchema,
} from "@/lib/validation";
import type { ContactFieldErrors } from "@/lib/validation";
import {
  submitContactForm,
  initialContactState,
} from "@/app/[locale]/contact/actions";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type FormStrings = Contact["form"];

/** Submit button — `useFormStatus` reads the enclosing form's pending state. */
function SubmitButton({ submit }: { submit: FormStrings["submit"] }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      size="lg"
      disabled={pending}
      aria-disabled={pending}
      className="h-11 w-full px-5 text-sm font-medium sm:w-auto"
    >
      {pending ? submit.pending : submit.idle}
    </Button>
  );
}

/** Inline, accessible per-field error text. */
function FieldError({ id, messages }: { id: string; messages?: string[] }) {
  if (!messages || messages.length === 0) return null;
  return (
    <p id={id} className="mt-1.5 text-sm text-destructive" aria-live="polite">
      {messages[0]}
    </p>
  );
}

export function ContactForm({
  strings,
  locale,
}: {
  strings: FormStrings;
  locale: Locale;
}) {
  const { fields, submit, feedback } = strings;
  const [state, formAction] = useActionState(
    submitContactForm,
    initialContactState,
  );

  const formRef = useRef<HTMLFormElement>(null);
  const idPrefix = useId();

  // Client-side errors (zod, same locale-correct schema) over any server errors.
  const [clientErrors, setClientErrors] = useState<ContactFieldErrors>({});
  const serverErrors = state.status === "error" ? state.fieldErrors : undefined;
  const errors: ContactFieldErrors = { ...serverErrors, ...clientErrors };

  const succeeded = state.status === "success";

  // Toast + reset on success; toast on a general (non-field) error.
  useEffect(() => {
    if (state.status === "success") {
      toast.success(feedback.successTitle, {
        description: feedback.successInline,
      });
      formRef.current?.reset();
      setClientErrors({});
    } else if (state.status === "error" && state.formError) {
      toast.error(feedback.errorTitle, { description: state.formError });
    }
  }, [state, feedback]);

  // Run the shared (locale-correct) zod schema on the client before invoking the
  // action. The server re-validates regardless — this is just faster feedback.
  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    const form = event.currentTarget;
    const data = new FormData(form);
    const result = getContactFormSchema(locale).safeParse({
      name: data.get("name"),
      email: data.get("email"),
      siteUrl: data.get("siteUrl"),
      message: data.get("message"),
    });
    if (!result.success) {
      event.preventDefault();
      const flattened = result.error.flatten().fieldErrors as ContactFieldErrors;
      setClientErrors(flattened);
      return;
    }
    setClientErrors({});
  }

  const fieldId = (name: string) => `${idPrefix}-${name}`;
  const errorId = (name: string) => `${idPrefix}-${name}-error`;
  const describedBy = (name: string, ...helpIds: string[]) => {
    const ids = [...helpIds];
    if (errors[name as keyof ContactFieldErrors]?.length) ids.push(errorId(name));
    return ids.length ? ids.join(" ") : undefined;
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-6 md:p-8">
      {succeeded && (
        <div
          role="status"
          className="mb-6 flex items-start gap-3 rounded-xl border border-primary/30 bg-primary/10 p-4"
        >
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
          <p className="text-sm text-foreground">{feedback.successInline}</p>
        </div>
      )}

      <form
        ref={formRef}
        action={formAction}
        onSubmit={handleSubmit}
        noValidate
        className="grid gap-5"
      >
        {/* Carry the active locale so the action localizes validation + feedback. */}
        <input type="hidden" name="locale" value={locale} />

        {/* Honeypot — visually hidden, off the tab order, ignored by humans. */}
        <div aria-hidden className="hidden">
          <label htmlFor={fieldId(CONTACT_HONEYPOT_FIELD)}>
            Leave this field empty
          </label>
          <input
            id={fieldId(CONTACT_HONEYPOT_FIELD)}
            type="text"
            name={CONTACT_HONEYPOT_FIELD}
            tabIndex={-1}
            autoComplete="off"
          />
        </div>

        {/* Name (required) */}
        <div>
          <Label htmlFor={fieldId("name")}>{fields.name.label}</Label>
          <Input
            id={fieldId("name")}
            name="name"
            type="text"
            required
            maxLength={120}
            autoComplete={fields.name.autoComplete}
            placeholder={fields.name.placeholder}
            aria-invalid={Boolean(errors.name?.length)}
            aria-describedby={describedBy("name")}
            className="mt-2 h-11"
          />
          <FieldError id={errorId("name")} messages={errors.name} />
        </div>

        {/* Email (required) */}
        <div>
          <Label htmlFor={fieldId("email")}>{fields.email.label}</Label>
          <Input
            id={fieldId("email")}
            name="email"
            type="email"
            required
            maxLength={254}
            autoComplete={fields.email.autoComplete}
            placeholder={fields.email.placeholder}
            aria-invalid={Boolean(errors.email?.length)}
            aria-describedby={describedBy("email", `${idPrefix}-email-help`)}
            className="mt-2 h-11"
          />
          <FieldError id={errorId("email")} messages={errors.email} />
          <p
            id={`${idPrefix}-email-help`}
            className="mt-1.5 text-sm text-muted-foreground"
          >
            {fields.email.help}
          </p>
        </div>

        {/* Site URL (optional) */}
        <div>
          <Label htmlFor={fieldId("siteUrl")}>
            {fields.siteUrl.label}
            <span className="text-xs font-normal text-muted-foreground">
              {fields.siteUrl.optionalLabel}
            </span>
          </Label>
          <Input
            id={fieldId("siteUrl")}
            name="siteUrl"
            type="url"
            inputMode="url"
            maxLength={2048}
            autoComplete={fields.siteUrl.autoComplete}
            placeholder={fields.siteUrl.placeholder}
            aria-invalid={Boolean(errors.siteUrl?.length)}
            aria-describedby={describedBy("siteUrl", `${idPrefix}-siteUrl-help`)}
            className="mt-2 h-11"
          />
          <FieldError id={errorId("siteUrl")} messages={errors.siteUrl} />
          <p
            id={`${idPrefix}-siteUrl-help`}
            className="mt-1.5 text-sm text-muted-foreground"
          >
            {fields.siteUrl.help}
          </p>
        </div>

        {/* Message (optional) */}
        <div>
          <Label htmlFor={fieldId("message")}>
            {fields.message.label}
            <span className="text-xs font-normal text-muted-foreground">
              {fields.message.optionalLabel}
            </span>
          </Label>
          <Textarea
            id={fieldId("message")}
            name="message"
            rows={5}
            maxLength={2000}
            placeholder={fields.message.placeholder}
            aria-invalid={Boolean(errors.message?.length)}
            aria-describedby={describedBy("message")}
            className="mt-2"
          />
          <FieldError id={errorId("message")} messages={errors.message} />
        </div>

        {/* General (non-field) error banner. */}
        {state.status === "error" && state.formError && (
          <p
            role="alert"
            className={cn(
              "rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive",
            )}
          >
            {state.formError}
          </p>
        )}

        <div className="pt-1">
          <SubmitButton submit={submit} />
        </div>
      </form>
    </div>
  );
}
