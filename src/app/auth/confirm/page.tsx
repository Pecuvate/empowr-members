import Link from "next/link";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { AuthShell } from "@/components/auth/AuthShell";
import { Button, FormNotice } from "@/components/ui/form";
import {
  AUTH_CONFIRMATION_COOKIE,
  decodePendingAuthConfirmation,
} from "@/lib/auth-confirmation";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Continue securely — Empowr Members",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function ConfirmAuthPage() {
  const cookieStore = await cookies();
  const pending = decodePendingAuthConfirmation(
    cookieStore.get(AUTH_CONFIRMATION_COOKIE)?.value
  );

  return (
    <AuthShell
      title="Continue securely"
      subtitle="One final step keeps automated email scanners from using your one-time link."
      footer={
        <Link href="/login" className="text-blue hover:text-blue-dark">
          Back to sign in
        </Link>
      }
    >
      {pending ? (
        <form method="post" action="/auth/confirm/complete">
          <p className="text-sm font-semibold text-mid">
            Press the button below to continue. Your link is not used until
            you do.
          </p>
          <Button type="submit" className="mt-5 w-full">
            Continue
          </Button>
        </form>
      ) : (
        <FormNotice tone="error">
          This confirmation has not been started or has expired. Please
          request a new sign-in link.
        </FormNotice>
      )}
    </AuthShell>
  );
}
