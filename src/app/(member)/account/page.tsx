import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getAuthedAccount } from "@/lib/auth";
import { checkWaivers } from "@/lib/waivers";
import type { Participant } from "@/lib/types";
import { ProfileForm } from "@/components/account/ProfileForm";
import { HouseholdManager } from "@/components/account/HouseholdManager";
import { FormNotice } from "@/components/ui/form";

export const metadata: Metadata = { title: "Your account — Empowr Members" };

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const authed = await getAuthedAccount();
  if (!authed) redirect("/login");

  // Middleware forwards an auth error here when it bounces an already
  // signed-in member off /login — typically a dead password-reset link.
  // Without this the page renders normally and the failure is invisible.
  const { error } = await searchParams;

  const supabase = await createClient();
  const { data: participants } = await supabase
    .from("mem_participants")
    .select("*")
    .eq("account_id", authed.account.id)
    .order("created_at", { ascending: true });
  const household = (participants ?? []) as Participant[];

  // Who still needs a waiver, via the same checkWaivers() every gate uses.
  // Surfaced here because the account page is where a household is built,
  // and until 2026-09-03 the waiver was only ever mentioned at the point it
  // blocked something — so the first a member heard of it was a refusal.
  const waiverStatuses = await checkWaivers(
    authed.user.email ?? "",
    household
  );
  const unsignedParticipantIds = waiverStatuses
    .filter((s) => !s.signed)
    .map((s) => s.participantId);

  return (
    <main className="mx-auto max-w-4xl space-y-8 px-4 py-10 sm:px-6">
      <div>
        <h1 className="text-3xl font-black tracking-tight text-black">
          Your account
        </h1>
        <p className="mt-1 text-mid">
          Your details and the people in your household who take part.
        </p>
      </div>

      {error && (
        <FormNotice tone="error">
          {error} Your password has not been changed — you are still signed in
          with the account shown below.
        </FormNotice>
      )}

      <section className="rounded-2xl bg-card p-6 shadow-sm sm:p-8">
        <h2 className="text-xl font-extrabold text-black">Your details</h2>
        <p className="mt-1 text-sm text-mid">
          Signed in as <strong>{authed.user.email}</strong>
        </p>
        <div className="mt-5">
          <ProfileForm account={authed.account} />
        </div>
      </section>

      <section className="rounded-2xl bg-card p-6 shadow-sm sm:p-8">
        <h2 className="text-xl font-extrabold text-black">Your household</h2>
        <p className="mt-1 text-sm text-mid">
          Add the people who take part in sessions — you&apos;ll pick from
          this list when booking. Age eligibility is worked out from date of
          birth.
        </p>
        <div className="mt-5">
          <HouseholdManager
            initialParticipants={household}
            initialUnsignedIds={unsignedParticipantIds}
          />
        </div>
      </section>
    </main>
  );
}
