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
  let participantId: unknown;
  try {
    ({ plan_id: planId, participant_id: participantId } = await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if (typeof planId !== "string" || !planId) {
    return NextResponse.json({ error: "plan_id is required" }, { status: 400 });
  }
  // A Subscription covers one named skater, not a household (Empowr,
  // 2026-08-26) — two children in the same slot need two Subscriptions. A
  // subscription with no participant could not be honoured at the door.
  if (typeof participantId !== "string" || !participantId) {
    return NextResponse.json(
      { error: "participant_id is required" },
      { status: 400 }
    );
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

  // The participant must belong to the signed-in account. Without this, a
  // valid plan_id plus someone else's participant_id would subscribe a
  // stranger's child — the same ownership check the booking flow makes.
  const { data: participant, error: participantError } = await service
    .from("mem_participants")
    .select("id, name")
    .eq("id", participantId)
    .eq("account_id", authed.account.id)
    .maybeSingle();
  if (participantError) {
    console.error("subscribe: participant lookup failed", participantError);
    return NextResponse.json({ error: "Could not start checkout" }, { status: 500 });
  }
  if (!participant) {
    return NextResponse.json({ error: "Participant not found" }, { status: 404 });
  }

  // One active subscription per plan PER PARTICIPANT. Scoped to the
  // participant rather than the account on purpose: a household with two
  // children in the same slot legitimately needs two Subscriptions, so an
  // account-level check would wrongly block the second.
  const { data: existing, error: existingError } = await service
    .from("mem_memberships")
    .select("id, status")
    .eq("participant_id", participantId)
    .eq("plan_id", plan.id)
    .in("status", ["active", "past_due"]);
  if (existingError) {
    console.error("subscribe: membership lookup failed", existingError);
    return NextResponse.json({ error: "Could not start checkout" }, { status: 500 });
  }
  if (existing && existing.length > 0) {
    return NextResponse.json(
      { error: `${participant.name} already has a subscription to this session` },
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
      metadata: {
        ...APP_MARKER,
        mem_plan_id: plan.id,
        mem_account_id: authed.account.id,
        mem_participant_id: participant.id,
      },
      subscription_data: {
        metadata: {
          ...APP_MARKER,
          mem_plan_id: plan.id,
          mem_account_id: authed.account.id,
          mem_participant_id: participant.id,
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
