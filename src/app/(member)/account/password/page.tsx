import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getAuthedAccount } from "@/lib/auth";
import { SetPasswordForm } from "@/components/auth/SetPasswordForm";

export const metadata: Metadata = { title: "Set a new password — Empowr Members" };

/** Where a recovery link lands.
 *
 *  This is an ordinary guarded member page, not a special reset route, and
 *  that is the whole design. Following the recovery link runs verifyOtp() in
 *  /auth/confirm/complete, which signs the member in; by the time they arrive here
 *  they hold a real session, so "prove it is you" has already happened and
 *  updateUser() can simply be trusted. There is no second token to validate,
 *  nothing to expire independently, and no reset-only state to get stuck in.
 *
 *  It is reachable while signed in normally too, which is correct — changing
 *  your password without having forgotten it is the same operation. */
export default async function SetPasswordPage() {
  const authed = await getAuthedAccount();
  if (!authed) redirect("/login");

  return (
    <main className="mx-auto max-w-md space-y-6 px-4 py-10 sm:px-6">
      <div>
        <h1 className="text-3xl font-black tracking-tight text-black">
          Set a new password
        </h1>
        <p className="mt-1 text-mid">
          Choose a new password for {authed.user.email}.
        </p>
      </div>
      <SetPasswordForm />
    </main>
  );
}
