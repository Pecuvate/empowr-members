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
import { slotCoversOccurrence, type EntitledSlot } from "@/lib/slot-matching";
import type { MembershipPlan, Membership } from "@/lib/types";

export type { EntitledSlot };

/** A plan plus the slots it entitles. A Subscription is to ONE WEEKLY SLOT —
 *  a specific day and time — not to a whole offering (Empowr, 2026-08-26).
 *  Sk8 Skool for Kidz is £30 per slot, so a child attending both Monday and
 *  Wednesday needs two Subscriptions. Matching lives in the pure, testable
 *  lib/slot-matching.ts because of the BST trap documented there. */
export type PlanWithEntitlements = MembershipPlan & {
  slots: EntitledSlot[];
};

type EntitlementRow = {
  offering_id: string | null;
  weekday: number | null;
  starts_at_local: string | null;
};

export async function listActivePlans(): Promise<PlanWithEntitlements[]> {
  const service = createServiceClient();
  const { data, error } = await service
    .from("mem_membership_plans")
    .select("*, mem_plan_entitlements(offering_id, weekday, starts_at_local)")
    .eq("active", true)
    .order("price_pence");
  if (error) throw error;

  return (data ?? []).map((row) => {
    const { mem_plan_entitlements: entitlements, ...plan } = row as MembershipPlan & {
      mem_plan_entitlements: EntitlementRow[];
    };
    return {
      ...plan,
      slots: (entitlements ?? [])
        .filter((e): e is EntitlementRow & { offering_id: string } => e.offering_id !== null)
        .map((e) => ({
          offering_id: e.offering_id,
          weekday: e.weekday,
          starts_at_local: e.starts_at_local,
        })),
    };
  });
}

/** Every active plan whose slots include this occurrence. Usually zero or
 *  one; an offering with two slots (Kidz) yields one per matching day. */
export async function plansForOccurrence(occurrence: {
  offering_id: string;
  starts_at: string;
}): Promise<PlanWithEntitlements[]> {
  const plans = await listActivePlans();
  return plans.filter((p) => p.slots.some((s) => slotCoversOccurrence(s, occurrence)));
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
