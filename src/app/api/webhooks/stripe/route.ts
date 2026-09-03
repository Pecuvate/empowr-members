// POST /api/webhooks/stripe â€” signature-verified, idempotent.
// checkout.session.completed â†’ confirm that session's pending holds
// (replays no-op: the status filter matches nothing the second time).
// checkout.session.expired â†’ release unpaid holds without waiting for
// the grace expiry. Non-2xx makes Stripe retry, so only transient
// (database) failures return 500; anything else is acknowledged.
import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase/service";
import {
  sendBookingConfirmationForSession,
  sendStaffSubscriptionAlert,
} from "@/lib/notifications";
import {
  membersSubscriptionMeta,
  toMembershipStatus,
  currentPeriodEnd,
} from "@/lib/stripe-subscription";
import { reconcileMemberBookings } from "@/lib/materialize-member-bookings";
import { reconcileBrevo } from "@/lib/reconcile-brevo";

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error("STRIPE_WEBHOOK_SECRET is not set");
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = await getStripe().webhooks.constructEventAsync(
      await request.text(),
      signature,
      secret
    );
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (
    event.type === "checkout.session.completed" ||
    event.type === "checkout.session.expired"
  ) {
    const session = event.data.object;
    const service = createServiceClient();

    if (event.type === "checkout.session.completed") {
      // Card payments are synchronous â€” anything unpaid here would be an
      // async method we don't offer; acknowledge and wait for nothing.
      if (session.payment_status !== "paid") {
        return NextResponse.json({ received: true });
      }
      const paymentIntentId =
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : session.payment_intent?.id ?? null;

      const { data: confirmed, error } = await service
        .from("mem_bookings")
        .update({
          status: "confirmed",
          stripe_payment_intent_id: paymentIntentId,
          expires_at: null,
        })
        .eq("stripe_checkout_session_id", session.id)
        .eq("status", "pending_payment")
        .select("id");
      if (error) {
        console.error("webhook confirm failed", session.id, error);
        return NextResponse.json({ error: "Retry" }, { status: 500 });
      }

      if (confirmed?.length) {
        // First-time confirmation (replays return no rows) â€” send the
        // booking-confirmation email (with the ticket link). Failure-
        // swallowed internally and must NOT fail the webhook, or Stripe
        // would retry an already-paid, already-confirmed session.
        await sendBookingConfirmationForSession(service, session.id);
        // Best-effort: communications must never turn a successful payment
        // into a failed Stripe webhook. The nightly sweep retries it.
        try {
          const accountId = session.metadata?.account_id;
          if (accountId) await reconcileBrevo(service, { accountIds: [accountId] });
        } catch (error) {
          console.error("[webhook] Brevo booking sync failed", session.id, error);
        }
      } else {
        // Replay (already confirmed) is fine; paid-for-released-holds is
        // not â€” surface it loudly for a manual refund until Step 7 tooling.
        const { data: rows } = await service
          .from("mem_bookings")
          .select("id, status")
          .eq("stripe_checkout_session_id", session.id);
        const stranded = (rows ?? []).filter((r) => r.status !== "confirmed");
        if (stranded.length > 0) {
          console.error(
            "PAID CHECKOUT FOR RELEASED HOLDS â€” refund needed",
            session.id,
            paymentIntentId,
            stranded
          );
        }
      }
    } else {
      const { error } = await service
        .from("mem_bookings")
        .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
        .eq("stripe_checkout_session_id", session.id)
        .eq("status", "pending_payment");
      if (error) {
        console.error("webhook release failed", session.id, error);
        return NextResponse.json({ error: "Retry" }, { status: 500 });
      }
    }
  }

  // Subscription lifecycle (Phase 2 Step 3).
  //
  // OWNERSHIP FIRST. This Stripe account is shared with Empowr Heroes and
  // Stripe delivers every subscribed event type to every endpoint on the
  // account â€” an event arriving here is only "some event on the Empowr CIC
  // account" until proven otherwise. Heroes' donations are subscriptions too.
  // membersSubscriptionMeta() is a positive check against metadata this app
  // stamps itself; anything unrecognised is ignored, never assumed to be ours.
  if (
    event.type === "customer.subscription.created" ||
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted"
  ) {
    const subscription = event.data.object;
    const meta = membersSubscriptionMeta(subscription);
    if (!meta) {
      console.log(
        `[webhook] Ignoring ${event.type} ${subscription.id} â€” not a Members subscription`
      );
      return NextResponse.json({ received: true });
    }

    const service = createServiceClient();
    const status =
      event.type === "customer.subscription.deleted"
        ? "cancelled"
        : toMembershipStatus(subscription.status);

    // Resolved BEFORE the upsert, and only for `created` â€” this is what
    // distinguishes a genuine first-time subscribe (worth a staff alert)
    // from a webhook retry/replay of the same `created` event, which the
    // upsert below would otherwise treat identically (upsert doesn't say
    // whether it inserted or updated). `updated`/`deleted` always reference
    // a row that must already exist, so there is nothing to check there.
    const isNewSubscription =
      event.type === "customer.subscription.created" &&
      (
        await service
          .from("mem_memberships")
          .select("id")
          .eq("stripe_subscription_id", subscription.id)
          .maybeSingle()
      ).data === null;

    // Upsert on the Stripe subscription id: `created` inserts, later events
    // update the same row, and a replay is a no-op rather than a duplicate.
    // Keyed on stripe_subscription_id rather than (account, plan) so a member
    // who cancels and later resubscribes gets a new row instead of silently
    // reviving the old one.
    const { error } = await service.from("mem_memberships").upsert(
      {
        account_id: meta.accountId,
        participant_id: meta.participantId,
        plan_id: meta.planId,
        stripe_subscription_id: subscription.id,
        status,
        current_period_end: currentPeriodEnd(subscription),
      },
      { onConflict: "stripe_subscription_id" }
    );
    if (error) {
      console.error("[webhook] membership sync failed", subscription.id, error);
      return NextResponse.json({ error: "Retry" }, { status: 500 });
    }
    console.log(
      `[webhook] Membership ${subscription.id} â†’ ${status} (account ${meta.accountId})`
    );

    // Staff alert â€” one per genuine new subscribe, never on a replay.
    // Best-effort, same reasoning as the booking one: an internal
    // notification failing must never look like a failed subscription.
    if (isNewSubscription) {
      await sendStaffSubscriptionAlert(service, meta);
    }

    // Phase 2 Step 4 â€” sync this participant's Â£0 booking rows to their
    // now-current set of active memberships (creates on a fresh subscribe,
    // cancels forward on cancel/past_due). Best-effort: the membership
    // status write above is the part Stripe retries on failure, and the
    // daily reconciliation sweep is the safety net if this throws.
    try {
      await reconcileMemberBookings(service, meta.participantId);
    } catch (error) {
      console.error(
        "[webhook] member booking reconciliation failed",
        subscription.id,
        error
      );
    }
    try {
      await reconcileBrevo(service, { accountIds: [meta.accountId] });
    } catch (error) {
      console.error("[webhook] Brevo membership sync failed", subscription.id, error);
    }
  }

  return NextResponse.json({ received: true });
}

