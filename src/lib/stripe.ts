// Server-only Stripe client — the Members-scoped restricted key on the
// shared Empowr CIC account (rk_test locally; the live twin lands in
// Netlify env at Step 9 go-live under the same unsuffixed name).
import "server-only";
import Stripe from "stripe";
import type { createServiceClient } from "@/lib/supabase/service";
import type { AuthedAccount } from "@/lib/auth";

let client: Stripe | null = null;

export function getStripe(): Stripe {
  if (!client) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
    client = new Stripe(key);
  }
  return client;
}

/** Extra minutes a hold outlives its Checkout session, so a payment
 *  completed at the last second still confirms via webhook before the
 *  pg_cron sweep releases the hold. checkout.session.expired releases
 *  unpaid holds well before this. */
export const HOLD_GRACE_MINUTES = 10;

/** Stamped on every Stripe object this app creates. The Empowr CIC Stripe
 *  account is shared with Empowr Heroes, and Stripe fans every event out to
 *  every endpoint on the account — so each app has to be able to recognise
 *  its own objects. This is the marker Heroes' guard can read; it is a second
 *  signal, not the primary one (Heroes identifies structurally, by Product
 *  ID, because its own Payment Links stamp no subscription metadata at all). */
export const APP_MARKER = { app: "members" } as const;

/** One Stripe customer per account, created on first payment and reused for
 *  every later Checkout and for Billing subscriptions.
 *
 *  Extracted from POST /api/bookings when Phase 2 needed the same thing:
 *  copying it would have left two customer-creation paths free to drift, and
 *  a second one that forgot to persist stripe_customer_id would silently mint
 *  a new Stripe customer per booking. */
export async function getOrCreateStripeCustomer(
  service: ReturnType<typeof createServiceClient>,
  authed: AuthedAccount
): Promise<string> {
  if (authed.account.stripe_customer_id) return authed.account.stripe_customer_id;

  const customer = await getStripe().customers.create({
    email: authed.user.email ?? undefined,
    name: authed.account.name,
    metadata: { ...APP_MARKER, mem_account_id: authed.account.id },
  });
  await service
    .from("mem_accounts")
    .update({ stripe_customer_id: customer.id })
    .eq("id", authed.account.id);
  return customer.id;
}

/** Resolve a Price by its lookup_key in whichever Stripe mode this app's key
 *  is in. Deliberately not a stored Price ID: production runs live Stripe and
 *  previews/local run test, but they share one database, so a stored ID is
 *  correct in exactly one environment. The lookup_key is identical in both. */
export async function resolvePriceIdByLookupKey(
  lookupKey: string
): Promise<string | null> {
  const prices = await getStripe().prices.list({
    lookup_keys: [lookupKey],
    active: true,
    limit: 1,
  });
  return prices.data[0]?.id ?? null;
}
