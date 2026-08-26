// Pure helpers for reading Stripe Subscription objects. No database, no
// network — so the shape assumptions below can be exercised directly.
//
// TWO API-SHAPE TRAPS ARE HANDLED HERE. Both are the same class of bug that
// left Heroes writing null subscription IDs into Notion for months: the SDK's
// types trail the account's pinned API version, a cast silences TypeScript,
// and the field is simply undefined forever.
//
//   1. `subscription.current_period_end` has moved onto the ITEMS —
//      `items.data[].current_period_end`. Verified against the live account
//      2026-08-26: sub_1TRWLc… carries no top-level current_period_end.
//   2. Ownership cannot be assumed. The Empowr CIC Stripe account is shared
//      with Empowr Heroes and Stripe fans every event out to every endpoint
//      on it, so a subscription arriving here may well be a Heroes donation.
//
// Deliberately NOT marked `server-only`, unlike most of lib/: every import
// here is type-only and erased, so the module has no runtime dependencies at
// all. That is what makes the shape assumptions above directly testable
// outside Next — same reasoning that produced lib/catalogue-filters.ts.
// It holds no secrets and touches nothing; keep it that way.
import type Stripe from "stripe";
import type { MembershipStatus } from "@/lib/types";

/** What this app stamps on every subscription it creates, via
 *  `subscription_data.metadata` on the Checkout session — the only field that
 *  reaches the Subscription object itself. */
export type MembersSubscriptionMeta = {
  accountId: string;
  planId: string;
  /** The one named skater covered. Per participant, not per household
   *  (Empowr, 2026-08-26). Required — a Subscription that does not name a
   *  participant cannot be honoured at the door, so it is not ours. */
  participantId: string;
};

type MetadataBag = Record<string, string | undefined> | null | undefined;

/**
 * Positive identification: is this Subscription one of OURS?
 *
 * Returns null for anything that is not demonstrably a Members subscription —
 * including Heroes' donations, which carry no metadata at all because its
 * Payment Links leave `subscription_data.metadata` empty. Default deny: an
 * unrecognised object is never assumed to be ours.
 */
export function membersSubscriptionMeta(
  subscription: Stripe.Subscription
): MembersSubscriptionMeta | null {
  const meta = subscription.metadata as MetadataBag;
  if (!meta || meta.app !== "members") return null;
  const accountId = meta.mem_account_id;
  const planId = meta.mem_plan_id;
  const participantId = meta.mem_participant_id;
  if (!accountId || !planId || !participantId) return null;
  return { accountId, planId, participantId };
}

/**
 * Map Stripe's subscription status onto the three states mem_membership_status
 * allows. Anything that is not clearly active and not clearly a dunning
 * failure is treated as cancelled, because the consequence of guessing wrong
 * is a member getting free sessions rather than being wrongly charged.
 *
 * `trialing` counts as active — there is no trial configured today, but if one
 * is ever added the entitlement should follow the trial.
 */
export function toMembershipStatus(
  stripeStatus: Stripe.Subscription.Status
): MembershipStatus {
  switch (stripeStatus) {
    case "active":
    case "trialing":
      return "active";
    case "past_due":
    case "unpaid":
      return "past_due";
    default:
      return "cancelled";
  }
}

/**
 * Current period end as an ISO string, or null.
 *
 * Reads the item-level field first (current API shape), falling back to the
 * legacy top-level one so this keeps working against older API versions and
 * replayed historical events. Returns null rather than a wrong date — a null
 * renewal date renders as "unknown", a wrong one silently misleads a member
 * about when they will next be charged.
 */
export function currentPeriodEnd(subscription: Stripe.Subscription): string | null {
  const items = subscription.items?.data ?? [];
  const itemEnd = items
    .map((item) => (item as unknown as { current_period_end?: number }).current_period_end)
    .find((value): value is number => typeof value === "number");

  const legacyEnd = (subscription as unknown as { current_period_end?: number })
    .current_period_end;

  const epochSeconds = itemEnd ?? legacyEnd;
  if (typeof epochSeconds !== "number") return null;
  return new Date(epochSeconds * 1000).toISOString();
}
