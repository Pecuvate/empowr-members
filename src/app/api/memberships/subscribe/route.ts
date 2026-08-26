// POST /api/memberships/subscribe — start a Subscription to one session.
//
// Phase 2 Step 3. Mirrors the booking flow's shape: validate, resolve, hand
// off to hosted Stripe Checkout, and let the webhook be the authority on what
// actually happened. Nothing is written to mem_memberships here — the row is
// created by the webhook on customer.subscription.created, so an abandoned
// checkout leaves no trace.
import { NextResponse } from "next/server";
import { getAuthedAccount } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { getStripe, getOrCreateStripeCustomer, APP_MARKER } from "@/lib/stripe";
import { listActivePlans, stripePriceIdForPlan } from "@/lib/membership";
import { requestOrigin } from "@/lib/request-origin";

export async function POST(request: Request) {
  const authed = await getAuthedAccount();
  if (!authed) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  let planId: unknown;
  try {
    ({ plan_id: planId } = await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if (typeof planId !== "string" || !planId) {
    return NextResponse.json({ error: "plan_id is required" }, { status: 400 });
  }

  // Resolve through listActivePlans rather than a direct row read, so an
  // inactive plan can never be subscribed to by posting its id directly.
  const plan = (await listActivePlans()).find((p) => p.id === planId);
  if (!plan) {
    return NextResponse.json(
      { error: "That membership plan is not available" },
      { status: 404 }
    );
  }

  const service = createServiceClient();

  // One active subscription per plan per account. Stripe would happily create
  // a second and bill for both.
  const { data: existing, error: existingError } = await service
    .from("mem_memberships")
    .select("id, status")
    .eq("account_id", authed.account.id)
    .eq("plan_id", plan.id)
    .in("status", ["active", "past_due"]);
  if (existingError) {
    console.error("subscribe: membership lookup failed", existingError);
    return NextResponse.json({ error: "Could not start checkout" }, { status: 500 });
  }
  if (existing && existing.length > 0) {
    return NextResponse.json(
      { error: "You already have a subscription to this session" },
      { status: 409 }
    );
  }

  try {
    const priceId = await stripePriceIdForPlan(plan);
    const customerId = await getOrCreateStripeCustomer(service, authed);
    const origin = requestOrigin(request);

    const session = await getStripe().checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      client_reference_id: authed.account.id,
      line_items: [{ price: priceId, quantity: 1 }],
      // Stamped in BOTH places on purpose. Session metadata identifies the
      // checkout; subscription_data.metadata is the ONLY thing that reaches
      // the Subscription object itself — session metadata does not propagate
      // to it. Heroes' own Payment Links leave subscription_data.metadata
      // empty, which is exactly why its subscriptions carry no marker and it
      // has to identify its objects structurally instead. Do not remove this:
      // the shared Stripe account fans every event out to both apps.
      metadata: { ...APP_MARKER, mem_plan_id: plan.id, mem_account_id: authed.account.id },
      subscription_data: {
        metadata: {
          ...APP_MARKER,
          mem_plan_id: plan.id,
          mem_account_id: authed.account.id,
        },
      },
      success_url: `${origin}/account?subscribed=1`,
      cancel_url: `${origin}/sessions`,
    });

    if (!session.url) {
      console.error("subscribe: Stripe returned no checkout url", session.id);
      return NextResponse.json({ error: "Could not start checkout" }, { status: 500 });
    }
    return NextResponse.json({ checkout_url: session.url });
  } catch (error) {
    console.error("subscribe: checkout creation failed", error);
    return NextResponse.json({ error: "Could not start checkout" }, { status: 500 });
  }
}
