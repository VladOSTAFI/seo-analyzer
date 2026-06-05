"use client";

import { useActionState, useId, useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";

import {
  getLoginSchema,
  getRegisterSchema,
  type AuthFieldErrors,
} from "@/lib/auth/validation";
import type { AuthFormState } from "@/app/[locale]/(auth)/state";
import type { Locale } from "@/lib/i18n/config";
import type { Auth } from "@/lib/copy/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Shared email + password auth form, used by both the login and register pages.
 * The same (locale-correct) zod schema runs client-side (fast feedback) and
 * server-side (the action re-validates — never trusts the client). Tokens are
 * set by the action in httpOnly cookies; nothing token-related touches this
 * component. A hidden `locale` field carries the language to the action.
 */

type AuthAction = (
  prevState: AuthFormState,
  formData: FormData,
) => Promise<AuthFormState>;

type FormLabels = Auth["form"];

interface AuthFormProps {
  mode: "login" | "register";
  locale: Locale;
  action: AuthAction;
  initialState: AuthFormState;
  labels: FormLabels;
  submitLabel: string;
  submitPendingLabel: string;
  /** The alternate route + label shown under the form. */
  alt: { prompt: string; href: string; label: string };
}

function SubmitButton({
  label,
  pendingLabel,
}: {
  label: string;
  pendingLabel: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      size="lg"
      disabled={pending}
      aria-disabled={pending}
      className="h-11 w-full px-5 text-sm font-medium"
    >
      {pending ? pendingLabel : label}
    </Button>
  );
}

function FieldError({ id, messages }: { id: string; messages?: string[] }) {
  if (!messages || messages.length === 0) return null;
  return (
    <p id={id} className="mt-1.5 text-sm text-destructive" aria-live="polite">
      {messages[0]}
    </p>
  );
}

export function AuthForm({
  mode,
  locale,
  action,
  initialState,
  labels,
  submitLabel,
  submitPendingLabel,
  alt,
}: AuthFormProps) {
  const [state, formAction] = useActionState(action, initialState);
  const idPrefix = useId();
  const [clientErrors, setClientErrors] = useState<AuthFieldErrors>({});

  const schema =
    mode === "register" ? getRegisterSchema(locale) : getLoginSchema(locale);
  const serverErrors = state.status === "error" ? state.fieldErrors : undefined;
  const errors: AuthFieldErrors = { ...serverErrors, ...clientErrors };

  const fieldId = (name: string) => `${idPrefix}-${name}`;
  const errorId = (name: string) => `${idPrefix}-${name}-error`;
  const describedBy = (name: keyof AuthFieldErrors) =>
    errors[name]?.length ? errorId(name) : undefined;

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    const data = new FormData(event.currentTarget);
    const result = schema.safeParse({
      email: data.get("email"),
      password: data.get("password"),
    });
    if (!result.success) {
      event.preventDefault();
      setClientErrors(
        result.error.flatten().fieldErrors as AuthFieldErrors,
      );
      return;
    }
    setClientErrors({});
  }

  return (
    <form
      action={formAction}
      onSubmit={handleSubmit}
      noValidate
      className="grid gap-5"
    >
      <input type="hidden" name="locale" value={locale} />

      <div>
        <Label htmlFor={fieldId("email")}>{labels.emailLabel}</Label>
        <Input
          id={fieldId("email")}
          name="email"
          type="email"
          required
          maxLength={254}
          autoComplete="email"
          placeholder={labels.emailPlaceholder}
          aria-invalid={Boolean(errors.email?.length)}
          aria-describedby={describedBy("email")}
          className="mt-2 h-11"
        />
        <FieldError id={errorId("email")} messages={errors.email} />
      </div>

      <div>
        <Label htmlFor={fieldId("password")}>{labels.passwordLabel}</Label>
        <Input
          id={fieldId("password")}
          name="password"
          type="password"
          required
          minLength={mode === "register" ? 8 : undefined}
          maxLength={200}
          autoComplete={
            mode === "register" ? "new-password" : "current-password"
          }
          placeholder={
            mode === "register"
              ? labels.passwordPlaceholderRegister
              : labels.passwordPlaceholderLogin
          }
          aria-invalid={Boolean(errors.password?.length)}
          aria-describedby={describedBy("password")}
          className="mt-2 h-11"
        />
        <FieldError id={errorId("password")} messages={errors.password} />
      </div>

      {state.status === "error" && state.formError && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {state.formError}
        </p>
      )}

      <div className="pt-1">
        <SubmitButton label={submitLabel} pendingLabel={submitPendingLabel} />
      </div>

      <p className="text-center text-sm text-muted-foreground">
        {alt.prompt}{" "}
        <Link
          href={alt.href}
          className="rounded-sm font-medium text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
        >
          {alt.label}
        </Link>
      </p>
    </form>
  );
}
