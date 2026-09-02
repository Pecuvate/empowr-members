"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createClient } from "@/lib/supabase/client";
import { signupSchema, type SignupInput } from "@/lib/validation";
import {
  Button,
  FieldError,
  FormNotice,
  Input,
  Label,
} from "@/components/ui/form";

export function SignupForm() {
  const [serverError, setServerError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<SignupInput>({ resolver: zodResolver(signupSchema) });

  async function onSubmit(values: SignupInput) {
    setServerError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signUp({
      email: values.email,
      password: values.password,
      options: {
        emailRedirectTo: `${location.origin}/auth/confirm/start?next=%2Faccount`,
        data: { name: values.name },
      },
    });
    if (error) {
      setServerError(error.message);
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <FormNotice tone="success">
        Check your inbox — we&apos;ve sent a confirmation link to{" "}
        <strong>{getValues("email")}</strong>. Click it to activate your
        account.
      </FormNotice>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      {serverError && <FormNotice tone="error">{serverError}</FormNotice>}
      <div>
        <Label htmlFor="name">Your name</Label>
        <Input id="name" autoComplete="name" className="mt-1" {...register("name")} />
        <FieldError message={errors.name?.message} />
      </div>
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
          autoComplete="new-password"
          className="mt-1"
          {...register("password")}
        />
        <FieldError message={errors.password?.message} />
      </div>
      <Button type="submit" disabled={isSubmitting} className="w-full">
        {isSubmitting ? "Creating account…" : "Create account"}
      </Button>
    </form>
  );
}
