// Membership MANAGEMENT, not a shop.
//
// The decision to subscribe is made on the public session page, next to that
// session's dates and prices — someone weighing up how to pay for Skate Jam
// should not have to find a separate list of five plans to see the option.
// This page answers "what am I paying for and how do I stop", and links out
// to each plan's own page for anything not yet subscribed.
//
// ⚠️ A subscriber is NOT yet auto-booked onto their sessions (Phase 2 Step 4,
// the Q5 build). Until that ships they appear on the staff register directly
// from their subscription and do not need to book. The copy below has to say
// so, because the whole value of subscribing is not booking each week.
import { redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { getAuthedAccount } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { listActivePlans } from "@/lib/membership";
import { describeSlot } from "@/lib/slot-describe";
import { formatPrice } from "@/lib/format";
import { ManageBillingButton } from "@/components/membership/ManageBillingButton";
import { FormNotice } from "@/components/ui/form";
import type { Participant, Membership } from "@/lib/types";

export const metadata: Metadata = { title: "Membership — Empowr Members" };
export const dynamic = "force-dynamic";

export default async function MembershipPage({
  searchParams,
}: {
  searchParams: Promise<{ subscribed?: string }>;
}) {
  const authed = await getAuthedAccount();
  if (!authed) redirect("/login");
  const { subscribed } = await searchParams;

  const service = createServiceClient();
  const [plans, participantsRes, membershipsRes, offeringsRes] =
    await Promise.all([
      listActivePlans(),
      service
        .from("mem_participants")
        .select("*")
        .eq("account_id", authed.account.id),
      service
        .from("mem_memberships")
        .select("*")
        .eq("account_id", authed.account.id)
        .in("status", ["active", "past_due"]),
      service.from("mem_offerings").select("id, title"),
    ]);

  const participants = (participantsRes.data ?? []) as Participant[];
  const memberships = (membershipsRes.data ?? []) as Membership[];
  const offeringTitles = new Map(
    (offeringsRes.data ?? []).map((o) => [o.id as string, o.title as string])
  );
  const planById = new Map(plans.map((p) => [p.id, p]));
  const participantNames = new Map(participants.map((p) => [p.id, p.name]));

  return (
    <main className="mx-auto max-w-3xl space-y-8 px-4 py-10 sm:px-6">
      <div>
        <h1 className="text-3xl font-black tracking-tight text-black">
          Membership
        </h1>
        <p className="mt-1 text-mid">
          Subscriptions you hold, and how to change or cancel them.
        </p>
      </div>

      {subscribed && (
        <FormNotice tone="success">
          Your subscription is set up. Your place is held every week — just
          turn up, you do not need to book.
        </FormNotice>
      )}

      {memberships.length === 0 ? (
        <section className="rounded-2xl bg-card p-6 shadow-sm sm:p-8">
          <h2 className="text-xl font-extrabold text-black">
            You have no subscriptions
          </h2>
          <p className="mt-1 text-sm text-mid">
            You can subscribe to any weekly session from its own page — the
            option sits alongside the dates, so you can compare it against
            paying per session.
          </p>
          <Link
            href="/sessions"
            className="mt-5 inline-block rounded-full bg-blue px-6 py-2.5 font-extrabold text-white shadow-blue transition-colors hover:bg-blue-dark"
          >
            Browse sessions
          </Link>
        </section>
      ) : (
        <section className="rounded-2xl bg-card p-6 shadow-sm sm:p-8">
          <h2 className="text-xl font-extrabold text-black">
            Your subscriptions
          </h2>
          <ul className="mt-4 space-y-3">
            {memberships.map((m) => {
              const plan = planById.get(m.plan_id);
              return (
                <li
                  key={m.id}
                  className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line pb-3 last:border-0 last:pb-0"
                >
                  <div>
                    <p className="font-extrabold text-black">
                      {plan?.name ?? "Subscription"}
                      {plan && (
                        <span className="ml-2 text-sm font-bold text-mid">
                          {formatPrice(plan.price_pence)}/month
                        </span>
                      )}
                    </p>
                    <p className="text-sm text-mid">
                      {(m.participant_id &&
                        participantNames.get(m.participant_id)) ||
                        "Household member"}
                      {plan &&
                        ` · ${plan.slots
                          .map((s) =>
                            describeSlot(s, offeringTitles.get(s.offering_id))
                          )
                          .join(" · ")}`}
                    </p>
                  </div>
                  {m.status === "past_due" ? (
                    <span className="rounded-full bg-red-soft px-3 py-1 text-xs font-extrabold text-red-dark">
                      Payment failed — update your card
                    </span>
                  ) : (
                    <span className="rounded-full bg-blue-pale px-3 py-1 text-xs font-extrabold text-blue-dark">
                      Active
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="mt-5">
            <ManageBillingButton />
          </div>
          <p className="mt-4 text-sm text-mid">
            Want another session?{" "}
            <Link href="/sessions" className="font-bold text-blue underline">
              Browse sessions
            </Link>{" "}
            — each one shows its own subscription option.
          </p>
        </section>
      )}

      <section className="rounded-2xl bg-blue-pale p-6 sm:p-8">
        <h2 className="text-lg font-extrabold text-blue-dark">
          How a subscription works
        </h2>
        <ul className="mt-3 space-y-2 text-sm font-semibold text-blue-dark">
          <li>
            Your place is held every week — you do not need to book each
            session.
          </li>
          <li>
            You will be on the register when you arrive. Just check in with a
            member of staff.
          </li>
          <li>
            Each subscription covers one skater at one weekly session. A child
            at two different sessions needs one for each.
          </li>
          <li>
            A signed waiver is required before subscribing — once per person,
            not once per session.
          </li>
        </ul>
      </section>
    </main>
  );
}
