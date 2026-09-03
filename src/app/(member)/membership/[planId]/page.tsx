// The "proceed" page for ONE subscription.
//
// The decision is made on the public session page, where someone is already
// looking at the session and its dates; this page only carries it out. That
// split is deliberate — /sessions/[slug] stays public and cacheable, and
// everything needing a signed-in account and a named skater lives here.
//
// Guarded by middleware via the /membership prefix, so arriving signed-out
// bounces to /login?next=/membership/<id> and returns here afterwards.
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft, CalendarDays } from "lucide-react";
import { getAuthedAccount } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { listActivePlans, planAgeBounds } from "@/lib/membership";
import { ageEligibleForPlan } from "@/lib/age";
import { describeSlot } from "@/lib/slot-describe";
import { seasonForPlan } from "@/lib/plan-seasons";
import { checkWaivers } from "@/lib/waivers";
import { formatPrice } from "@/lib/format";
import {
  SubscribePanel,
  type SubscribablePlan,
} from "@/components/membership/SubscribePanel";
import type { Participant, Membership } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ planId: string }>;
}): Promise<Metadata> {
  const { planId } = await params;
  const plan = (await listActivePlans()).find((p) => p.id === planId);
  return {
    title: plan ? `Subscribe — ${plan.name}` : "Subscribe — Empowr Members",
  };
}

export default async function SubscribeToPlanPage({
  params,
}: {
  params: Promise<{ planId: string }>;
}) {
  const { planId } = await params;
  const authed = await getAuthedAccount();
  if (!authed) redirect(`/login?next=/membership/${planId}`);

  // Resolved through listActivePlans, never a direct row read, so an
  // inactive plan 404s here exactly as the subscribe route refuses it.
  const plan = (await listActivePlans()).find((p) => p.id === planId);
  if (!plan) notFound();

  const service = createServiceClient();
  const [participantsRes, membershipsRes, offeringsRes, bounds] =
    await Promise.all([
      service
        .from("mem_participants")
        .select("*")
        .eq("account_id", authed.account.id)
        .order("created_at", { ascending: true }),
      service
        .from("mem_memberships")
        .select("*")
        .eq("account_id", authed.account.id)
        .eq("plan_id", plan.id)
        .in("status", ["active", "past_due"]),
      service.from("mem_offerings").select("id, title"),
      planAgeBounds(plan),
    ]);

  const participants = (participantsRes.data ?? []) as Participant[];
  const memberships = (membershipsRes.data ?? []) as Membership[];
  const offeringTitles = new Map(
    (offeringsRes.data ?? []).map((o) => [o.id as string, o.title as string])
  );

  const subscribable: SubscribablePlan[] = [
    {
      id: plan.id,
      name: plan.name,
      price_pence: plan.price_pence,
      covers: plan.slots
        .map((s) => describeSlot(s, offeringTitles.get(s.offering_id)))
        .join(" · "),
      subscribedParticipantIds: memberships
        .filter((m) => m.participant_id)
        .map((m) => m.participant_id as string),
      ineligibleParticipantIds: participants
        .filter((p) => !ageEligibleForPlan(p.dob, bounds))
        .map((p) => p.id),
    },
  ];

  // Mirror of the subscribe route's waiver gate, so an unsigned skater is
  // named here rather than after the member has picked a plan and clicked.
  // Same checkWaivers() the route gates on — never a copy, never a direct
  // mem_waiver_consents read, or this view would silently disagree with the
  // gate for anyone covered only via the legacy standalone-app fallback.
  const waiverStatuses = await checkWaivers(
    authed.user.email ?? "",
    participants
  );
  const unsignedParticipantIds = waiverStatuses
    .filter((s) => !s.signed)
    .map((s) => s.participantId);

  const season = seasonForPlan(plan.stripe_lookup_key);
  const offeringSlug = plan.slots[0]?.offering_id;

  return (
    <main className="mx-auto max-w-2xl space-y-6 px-4 py-10 sm:px-6">
      <Link
        href="/membership"
        className="flex w-fit items-center gap-1.5 text-sm font-bold text-mid transition-colors hover:text-blue"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden /> Your membership
      </Link>

      <div>
        <h1 className="text-3xl font-black tracking-tight text-black">
          Subscribe
        </h1>
        <p className="mt-1 text-mid">
          {formatPrice(plan.price_pence)} a month for {plan.name}. Cancel any
          time.
        </p>
      </div>

      {/* Stated BEFORE the subscribe panel, not after it and not tucked into
          "What you get": a season that stops for five months is a material
          term of the sale, and the plans went live carrying no mention of it
          anywhere on this page. Only Skate Jam is seasonal — season is null
          for the other four, which run year-round. */}
      {season && (
        <section className="rounded-2xl border border-line bg-warm-white p-5 sm:p-6">
          <h2 className="flex items-center gap-2 text-base font-extrabold text-black">
            <CalendarDays className="h-5 w-5 shrink-0 text-blue" aria-hidden />
            Runs {season.window}
          </h2>
          <p className="mt-2 text-sm font-semibold text-mid">{season.detail}</p>
        </section>
      )}

      <SubscribePanel
        plans={subscribable}
        participants={participants}
        unsignedParticipantIds={unsignedParticipantIds}
      />

      <section className="rounded-2xl bg-blue-pale p-5 sm:p-6">
        <h2 className="text-base font-extrabold text-blue-dark">
          What you get
        </h2>
        <ul className="mt-2 space-y-1.5 text-sm font-semibold text-blue-dark">
          <li>Your place is held every week — nothing to book each time.</li>
          <li>You will be on the register when you arrive.</li>
          <li>
            A signed waiver is required before you can subscribe — once per
            person, not once per session.
          </li>
          <li>Cancel any time from your membership page.</li>
        </ul>
      </section>

      {offeringSlug && (
        <p className="text-sm text-mid">
          Prefer to pay per session?{" "}
          <Link href="/sessions" className="font-bold text-blue underline">
            Browse the dates instead
          </Link>
          .
        </p>
      )}
    </main>
  );
}
