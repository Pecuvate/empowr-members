"use client";

// Phase 2 Step 6 — the surface that actually sells a Subscription.
//
// A Subscription covers ONE named skater on ONE weekly slot (Empowr,
// 2026-08-26), so every plan needs a participant chosen before it can be
// bought. That is why this is a panel per plan rather than a single
// "subscribe" button: two children in the same slot are two Subscriptions,
// and the API enforces that per participant.
//
// Nothing is written here. POST /api/memberships/subscribe hands back a
// hosted Stripe Checkout url and the webhook is the authority on what
// happened — an abandoned checkout leaves no row behind.
import { useState } from "react";
import Link from "next/link";
import { Button, FormNotice } from "@/components/ui/form";
import type { Participant } from "@/lib/types";

export type SubscribablePlan = {
  id: string;
  name: string;
  price_pence: number;
  /** Human description of the slot, e.g. "Sk8 Skool for Kidz · Mondays 16:00". */
  covers: string;
  /** Participant ids that already hold an active or past_due subscription to
   *  this plan. Mirrors the API's 409 so the state is visible before the
   *  click rather than only after it. */
  subscribedParticipantIds: string[];
  /** Participant ids outside this session's age range. Same mirror, same
   *  reason — the subscribe route refuses these, so offering them would only
   *  produce a rejection after the member had committed to a choice. */
  ineligibleParticipantIds: string[];
};

/** Participant ids with no valid waiver. Account-wide rather than per-plan
 *  — a waiver covers the person, not the session — so it sits alongside
 *  `plans` instead of inside SubscribablePlan. Unlike the age and
 *  subscription mirrors, this one is FIXABLE in a couple of minutes, so
 *  these people are named with a link to fix it rather than silently
 *  dropped from the list, which would just read as "where is my child?". */

export function SubscribePanel({
  plans,
  participants,
  unsignedParticipantIds,
}: {
  plans: SubscribablePlan[];
  participants: Participant[];
  unsignedParticipantIds: string[];
}) {
  const unsigned = new Set(unsignedParticipantIds);
  const [pendingPlanId, setPendingPlanId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      plans.map((p) => [
        p.id,
          participants.find(
          (x) =>
            !p.subscribedParticipantIds.includes(x.id) &&
            !p.ineligibleParticipantIds.includes(x.id) &&
            !unsigned.has(x.id)
        )?.id ?? "",
      ])
    )
  );

  async function subscribe(planId: string) {
    const participantId = selected[planId];
    if (!participantId) {
      setError("Choose who this subscription is for.");
      return;
    }
    setError(null);
    setPendingPlanId(planId);
    try {
      const res = await fetch("/api/memberships/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan_id: planId, participant_id: participantId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? "Could not start checkout. Please try again.");
        setPendingPlanId(null);
        return;
      }
      // Leave pendingPlanId set — the button stays disabled through the
      // redirect so a second click cannot open a second Checkout session.
      window.location.href = body.checkout_url;
    } catch {
      setError("Could not reach the server. Please try again.");
      setPendingPlanId(null);
    }
  }

  if (participants.length === 0) {
    return (
      <FormNotice tone="error">
        Add someone to your household first — a subscription covers one named
        skater, so we need to know who it is for.
      </FormNotice>
    );
  }

  return (
    <div className="space-y-4">
      {error && <FormNotice tone="error">{error}</FormNotice>}

      {plans.map((plan) => {
        // Two distinct reasons the list can be empty, and they need different
        // wording: telling someone their household is "already subscribed" to
        // a session nobody is old enough for would be nonsense, and so would
        // blaming age when the eligible child is simply already signed up.
        // Narrow by age FIRST, then by subscription, so a household with one
        // subscribed child and one out-of-range child reads correctly.
        const eligible = participants.filter(
          (p) => !plan.ineligibleParticipantIds.includes(p.id)
        );
        const notSubscribed = eligible.filter(
          (p) => !plan.subscribedParticipantIds.includes(p.id)
        );
        // Waiver last, so its notice names only people who could otherwise
        // subscribe right now — telling someone to sign a waiver for a child
        // who is the wrong age, or already subscribed, is noise.
        const available = notSubscribed.filter((p) => !unsigned.has(p.id));
        const needWaiver = notSubscribed.filter((p) => unsigned.has(p.id));
        const noneEligible = eligible.length === 0;
        const allSubscribed = !noneEligible && notSubscribed.length === 0;

        return (
          <div
            key={plan.id}
            className="rounded-2xl border border-line bg-card p-5 shadow-sm sm:p-6"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-lg font-extrabold text-black">{plan.name}</h3>
              <p className="text-2xl font-black text-blue">
                £{(plan.price_pence / 100).toFixed(0)}
                <span className="text-sm font-bold text-mid">/month</span>
              </p>
            </div>
            <p className="mt-1 text-sm text-mid">{plan.covers}</p>

            {noneEligible ? (
              <p className="mt-4 text-sm font-semibold text-mid">
                Nobody in your household is in the age range for this session.
              </p>
            ) : allSubscribed ? (
              <p className="mt-4 text-sm font-semibold text-mid">
                Everyone in your household who can attend this session is
                already subscribed to it.
              </p>
            ) : (
              <>
                {available.length > 0 && (
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <label
                      className="sr-only"
                      htmlFor={`participant-${plan.id}`}
                    >
                      Who is this subscription for?
                    </label>
                    <select
                      id={`participant-${plan.id}`}
                      value={selected[plan.id] ?? ""}
                      onChange={(e) =>
                        setSelected((s) => ({ ...s, [plan.id]: e.target.value }))
                      }
                      disabled={pendingPlanId !== null}
                      className="rounded-xl border border-line bg-white px-4 py-2.5 font-semibold text-black disabled:opacity-60"
                    >
                      {available.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                    <Button
                      type="button"
                      onClick={() => subscribe(plan.id)}
                      disabled={pendingPlanId !== null}
                    >
                      {pendingPlanId === plan.id
                        ? "Opening checkout…"
                        : "Subscribe"}
                    </Button>
                  </div>
                )}

                {needWaiver.length > 0 && (
                  <div className="mt-4">
                    <FormNotice tone="error">
                      <span className="block">
                        {needWaiver.map((p) => p.name).join(", ")}{" "}
                        {needWaiver.length === 1 ? "needs" : "need"} a signed
                        waiver before being subscribed.
                      </span>
                      <Link href="/waiver" className="mt-1 inline-flex underline">
                        Complete the waiver
                      </Link>{" "}
                      <span>— it only takes a minute, and it&apos;s once per person.</span>
                    </FormNotice>
                  </div>
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
