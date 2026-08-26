// Membership plans (Phase 2). A "plan" here is a Subscription to ONE session
// — Skate Jam £25/mo, Sk8 Skool Kidz £30/mo, Sk8 Skool All Ages £40/mo,
// SYNKRON8 £45/mo — not a sitewide membership. The free "Empowr Member"
// account is a different concept entirely and has no row in these tables.
// Courses and Camps deliberately have no Subscription option.
//
// Source of truth for what exists and what it costs is the KB at
// vaults/EMPOWR CIC/entities/sessions.md. Anything here that diverges from it
// is a defect to correct toward the KB.
import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { resolvePriceIdByLookupKey } from "@/lib/stripe";
import type { MembershipPlan, Membership } from "@/lib/types";

/** A plan plus the offering it entitles. One entitlement row per plan today;
 *  the schema allows more, which is why this returns an array of offering ids. */
export type PlanWithEntitlements = MembershipPlan & {
  offering_ids: string[];
};

type EntitlementRow = { offering_id: string | null };

export async function listActivePlans(): Promise<PlanWithEntitlements[]> {
  const service = createServiceClient();
  const { data, error } = await service
    .from("mem_membership_plans")
    .select("*, mem_plan_entitlements(offering_id)")
    .eq("active", true)
    .order("price_pence");
  if (error) throw error;

  return (data ?? []).map((row) => {
    const { mem_plan_entitlements: entitlements, ...plan } = row as MembershipPlan & {
      mem_plan_entitlements: EntitlementRow[];
    };
    return {
      ...plan,
      offering_ids: (entitlements ?? [])
        .map((e) => e.offering_id)
        .filter((id): id is string => id !== null),
    };
  });
}

/** The active plan for one offering, or null if that session has no
 *  Subscription option (courses and camps never do). */
export async function planForOffering(
  offeringId: string
): Promise<PlanWithEntitlements | null> {
  const plans = await listActivePlans();
  return plans.find((p) => p.offering_ids.includes(offeringId)) ?? null;
}

/**
 * Resolve the Stripe Price for a plan, in whichever mode this app's key is in.
 *
 * Throws rather than returning null on a missing Price: a plan marked active
 * with no resolvable Price is a configuration error that must not degrade into
 * a silent "no subscription available" on the page. The lookup key exists in
 * the database precisely so this can be diagnosed from the message.
 */
export async function stripePriceIdForPlan(plan: MembershipPlan): Promise<string> {
  if (!plan.stripe_lookup_key) {
    throw new Error(
      `Membership plan "${plan.name}" (${plan.id}) is active but has no stripe_lookup_key`
    );
  }
  const priceId = await resolvePriceIdByLookupKey(plan.stripe_lookup_key);
  if (!priceId) {
    throw new Error(
      `No active Stripe Price found for lookup_key "${plan.stripe_lookup_key}" ` +
        `(plan "${plan.name}"). The Price must exist in BOTH test and live mode.`
    );
  }
  return priceId;
}

/** A membership only entitles anything while it is genuinely active. A
 *  past_due subscription pauses entitlements — the member reverts to paying
 *  per session until the card is fixed — rather than being cancelled. */
export function entitlesBooking(membership: Pick<Membership, "status">): boolean {
  return membership.status === "active";
}

export async function activeMembershipsForAccount(
  accountId: string
): Promise<Membership[]> {
  const service = createServiceClient();
  const { data, error } = await service
    .from("mem_memberships")
    .select("*")
    .eq("account_id", accountId)
    .eq("status", "active");
  if (error) throw error;
  return (data ?? []) as Membership[];
}
