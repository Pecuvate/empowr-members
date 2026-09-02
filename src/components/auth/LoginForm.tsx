"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createClient } from "@/lib/supabase/client";
import {
  magicLinkSchema,
  passwordLoginSchema,
  passwordResetRequestSchema,
  type MagicLinkInput,
  type PasswordLoginInput,
  type PasswordResetRequestInput,
} from "@/lib/validation";
import {
  Button,
  FieldError,
  FormNotice,
  Input,
  Label,
} from "@/components/ui/form";

// "reset" is deliberately NOT a tab. It is a dead end reached from the
// password tab and returned from — putting it alongside the two ways of
// signing IN would present forgetting your password as an equal third option.
type Mode = "password" | "magic" | "reset";

export function LoginForm({
  next,
  initialError,
}: {
  next: string;
  initialError?: string;
}) {
  const [mode, setMode] = useState<Mode>("password");

  if (mode === "reset") {
    return (
      <div className="space-y-5">
        <PasswordResetRequest onBack={() => setMode("password")} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {initialError && <FormNotice tone="error">{initialError}</FormNotice>}
      <div className="flex rounded-full border border-line bg-card p-1 text-sm font-bold">
        {(
          [
            ["password", "Password"],
            ["magic", "Email me a link"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setMode(value)}
            className={`flex-1 rounded-full px-4 py-1.5 transition-colors duration-200 ${
              mode === value ? "bg-blue text-white" : "text-mid hover:text-blue"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {mode === "password" ? (
        <PasswordLogin next={next} onForgot={() => setMode("reset")} />
      ) : (
        <MagicLinkLogin next={next} />
      )}
    </div>
  );
}

function PasswordLogin({ next, onForgot }: { next: string; onForgot: () => void }) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<PasswordLoginInput>({ resolver: zodResolver(passwordLoginSchema) });

  async function onSubmit(values: PasswordLoginInput) {
    setServerError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword(values);
    if (error) {
      setServerError(
        error.message === "Invalid login credentials"
          ? "Email or password is incorrect."
          : error.message
      );
      return;
    }
    router.push(next);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      {serverError && <FormNotice tone="error">{serverError}</FormNotice>}
      <div>
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          className="mt-1"
          {...register("email")}
        />
        <FieldError message={errors.email?.message} />
      </div>
      <div>
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          className="mt-1"
          {...register("password")}
        />
        <FieldError message={errors.password?.message} />
      </div>
      <Button type="submit" disabled={isSubmitting} className="w-full">
        {isSubmitting ? "Signing in…" : "Sign in"}
      </Button>
      <button
        type="button"
        onClick={onForgot}
        className="w-full text-center text-sm font-semibold text-blue underline"
      >
        Forgotten your password?
      </button>
    </form>
  );
}

/** Request a reset email.
 *
 *  ALWAYS reports success, even for an address with no account. Supabase's own
 *  resetPasswordForEmail does not distinguish either — and it must not, or the
 *  form becomes a way to test whether a given person holds an Empowr Members
 *  account. That matters more here than on a typical site: the accounts belong
 *  to parents of children attending known sessions at known times. */
function PasswordResetRequest({ onBack }: { onBack: () => void }) {
  const [sent, setSent] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<PasswordResetRequestInput>({
    resolver: zodResolver(passwordResetRequestSchema),
  });

  async function onSubmit(values: PasswordResetRequestInput) {
    setServerError(null);
    const supabase = createClient();
    // No redirectTo: the recovery email template carries its own link, built
    // from {{ .TokenHash }} and pointing at /auth/confirm/start with
    // next=/account/password. Passing one here would be ignored by that
    // template and is a second place for the destination to drift.
    const { error } = await supabase.auth.resetPasswordForEmail(values.email);
    // A rate-limit refusal is the one failure worth surfacing — silently
    // claiming "sent" would have them waiting for an email that never comes.
    if (error && /rate|too many/i.test(error.message)) {
      setServerError("Too many attempts — please wait a few minutes and try again.");
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <div className="space-y-4">
        <FormNotice tone="success">
          If there is an account for <strong>{getValues("email")}</strong>,
          we&apos;ve sent a link to set a new password. It expires in one hour.
        </FormNotice>
        <button
          type="button"
          onClick={onBack}
          className="w-full text-center text-sm font-semibold text-blue underline"
        >
          Back to sign in
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div>
        <h2 className="font-black text-black">Set a new password</h2>
        <p className="mt-1 text-sm font-semibold text-mid">
          Enter your email and we&apos;ll send you a link to choose a new one.
        </p>
      </div>
      {serverError && <FormNotice tone="error">{serverError}</FormNotice>}
      <div>
        <Label htmlFor="reset-email">Email</Label>
        <Input
          id="reset-email"
          type="email"
          autoComplete="email"
          className="mt-1"
          {...register("email")}
        />
        <FieldError message={errors.email?.message} />
      </div>
      <Button type="submit" disabled={isSubmitting} className="w-full">
        {isSubmitting ? "Sending…" : "Send the link"}
      </Button>
      <button
        type="button"
        onClick={onBack}
        className="w-full text-center text-sm font-semibold text-blue underline"
      >
        Back to sign in
      </button>
    </form>
  );
}

function MagicLinkLogin({ next }: { next: string }) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<MagicLinkInput>({ resolver: zodResolver(magicLinkSchema) });

  async function onSubmit(values: MagicLinkInput) {
    setServerError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: values.email,
      options: {
        emailRedirectTo: `${location.origin}/auth/confirm/start?next=${encodeURIComponent(next)}`,
        shouldCreateUser: false,
      },
    });
    if (error) {
      setServerError(
        /signups not allowed|user not found/i.test(error.message)
          ? "No account found with that email — please sign up first."
          : error.message
      );
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <FormNotice tone="success">
        Check your inbox — we&apos;ve sent a sign-in link to{" "}
        <strong>{getValues("email")}</strong>.
      </FormNotice>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      {serverError && <FormNotice tone="error">{serverError}</FormNotice>}
      <div>
        <Label htmlFor="magic-email">Email</Label>
        <Input
          id="magic-email"
          type="email"
          autoComplete="email"
          className="mt-1"
          {...register("email")}
        />
        <FieldError message={errors.email?.message} />
      </div>
      <Button type="submit" disabled={isSubmitting} className="w-full">
        {isSubmitting ? "Sending…" : "Send sign-in link"}
      </Button>
    </form>
  );
}
