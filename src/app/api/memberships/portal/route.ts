// POST /api/memberships/portal — open the Stripe Customer Portal.
//
// Cancellation, card updates and invoice history are handled by Stripe's
// hosted portal rather than rebuilt here. That is deliberate: this app
// deletes its own self-serve cancellation once already (2026-07-21) because
// the policy said bookings are final, and re-implementing subscription
// cancellation in-house would mean owning proration, dunning and refund edge
// cases that Stripe already handles correctly.
//
// What the portal is allowed to do is configured in the Stripe dashboard, not
// here — see the Phase 2 runbook. Plan switching stays OFF until an ADR says
// otherwise, because switching between per-session Subscriptions has
// entitlement consequences this app does not model yet.
import { NextResponse } from "next/server";
import { getAuthedAccount } from "@/lib/auth";
import { getStripe } from "@/lib/stripe";
import { requestOrigin } from "@/lib/request-origin";

export async function POST(request: Request) {
  const authed = await getAuthedAccount();
  if (!authed) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  // No customer means they have never paid for anything, so there is nothing
  // for the portal to show. Deliberately not created on demand here — a
  // customer record should only ever appear as a side effect of a real
  // payment or subscription.
  const customerId = authed.account.stripe_customer_id;
  if (!customerId) {
    return NextResponse.json(
      { error: "No billing history for this account" },
      { status: 404 }
    );
  }

  try {
    const session = await getStripe().billingPortal.sessions.create({
      customer: customerId,
      return_url: `${requestOrigin(request)}/account`,
    });
    return NextResponse.json({ portal_url: session.url });
  } catch (error) {
    console.error("portal: session creation failed", error);
    return NextResponse.json({ error: "Could not open the billing portal" }, { status: 500 });
  }
}
