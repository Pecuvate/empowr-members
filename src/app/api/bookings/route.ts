// POST /api/bookings — hold pending_payment bookings for the signed-in
// member, then hand off to Stripe Checkout. Gates in order: participant
// ownership → age eligibility → waiver (fail closed, no insert) → atomic
// capacity/duplicate check via mem_hold_bookings() (row-locked, so
// concurrent bookings can't oversell) → Checkout session (one per
// booking, a line item per participant). The webhook confirms the hold;
// holds outlive the Checkout session by HOLD_GRACE_MINUTES so a
// last-second payment always beats the pg_cron sweep. If session
// creation fails, the holds are released immediately.
import { NextResponse } from "next/server";
import { getAuthedAccount } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { bookingSchema } from "@/lib/validation";
import { checkWaivers, recordWaiverConsent } from "@/lib/waivers";
import { recordDepartureConsents } from "@/lib/departure-consent";
import { isAgeEligible, ageOn } from "@/lib/age";
import { PENDING_BOOKING_EXPIRY_MINUTES } from "@/lib/business-rules";
import {
  getStripe,
  getOrCreateStripeCustomer,
  HOLD_GRACE_MINUTES,
} from "@/lib/stripe";
import { formatOccurrence, formatDate } from "@/lib/format";
import { requestOrigin } from "@/lib/request-origin";
import type { Booking, Participant } from "@/lib/types";

type TargetRow = {
  starts: string | null;
  ends: string | null;
  label: string | null;
  offering: {
    title: string;
    age_min: number | null;
    age_max: number | null;
  };
};


export async function POST(request: Request) {
  const authed = await getAuthedAccount();
  if (!authed) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const parsed = bookingSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }
  const { occurrence_id, course_run_id, participant_ids } = parsed.data;

  const service = createServiceClient();

  // Participants must all belong to the caller's account.
  const { data: participantRows, error: participantsError } = await service
    .from("mem_participants")
    .select("id, name, dob, person_id")
    .in("id", participant_ids)
    .eq("account_id", authed.account.id);
  if (participantsError) {
    console.error("booking participants read failed", participantsError);
    return NextResponse.json(
      { error: "Could not start the booking — please try again." },
      { status: 500 }
    );
  }
  const participants = (participantRows ?? []) as Pick<
    Participant,
    "id" | "name" | "dob" | "person_id"
  >[];
  if (participants.length !== participant_ids.length) {
    return NextResponse.json(
      { error: "One or more participants weren't recognised." },
      { status: 400 }
    );
  }

  // Authoritative target read (service client — RLS-independent) for the
  // age check and Checkout line items; bookability itself is re-checked
  // inside the RPC.
  let target: TargetRow | null = null;
  if (occurrence_id) {
    const { data } = await service
      .from("mem_occurrences")
      .select(
        "starts:starts_at, ends:ends_at, offering:mem_offerings(title, age_min, age_max)"
      )
      .eq("id", occurrence_id)
      .maybeSingle();
    target = data ? ({ label: null, ...data } as unknown as TargetRow) : null;
  } else if (course_run_id) {
    const { data } = await service
      .from("mem_course_runs")
      .select(
        "starts:starts_on, label, offering:mem_offerings(title, age_min, age_max)"
      )
      .eq("id", course_run_id)
      .maybeSingle();
    target = data ? ({ ends: null, ...data } as unknown as TargetRow) : null;
  }
  if (!target) {
    return NextResponse.json(
      { error: "This session can no longer be booked." },
      { status: 404 }
    );
  }

  // Age eligibility on the session/course start date.
  const startDate = target.starts ? new Date(target.starts) : new Date();
  const ineligible = participants.filter(
    (p) =>
      !isAgeEligible(p.dob, target.offering.age_min, target.offering.age_max, startDate)
  );
  if (ineligible.length > 0) {
    return NextResponse.json(
      {
        error: "age_ineligible",
        ineligible: ineligible.map((p) => ({ id: p.id, name: p.name })),
      },
      { status: 422 }
    );
  }

  // Waiver gate — no hold without a signed waiver for every participant.
  const waiverStatuses = await checkWaivers(authed.user.email ?? "", participants);

  // Persist fresh matches so future bookings skip the name match, and
  // backfill mem_waiver_consents so future checkWaivers() calls take the
  // fast primary path instead of re-running the fallback every time.
  await Promise.all(
    waiverStatuses
      .filter((s) => s.matchedPersonId)
      .map((s) =>
        service
          .from("mem_participants")
          .update({ person_id: s.matchedPersonId })
          .eq("id", s.participantId)
      )
  );
  await Promise.all(
    waiverStatuses
      .filter((s) => s.backfillFromResponseId)
      .map((s) => {
        const participant = participants.find((p) => p.id === s.participantId);
        const personId = s.matchedPersonId ?? participant?.person_id;
        if (!personId) return Promise.resolve();
        return recordWaiverConsent({
          participantId: s.participantId,
          personId,
          waiverResponseId: s.backfillFromResponseId!,
        });
      })
  );

  const unsigned = waiverStatuses.filter((s) => !s.signed);
  if (unsigned.length > 0) {
    const names = new Map(participants.map((p) => [p.id, p.name]));
    return NextResponse.json(
      {
        error: "waiver_required",
        unsigned: unsigned.map((s) => ({
          id: s.participantId,
          name: names.get(s.participantId) ?? "",
        })),
      },
      { status: 409 }
    );
  }

  // Resolve each participant's signer person_id for the optional departure
  // consent write below — matchedPersonId (just linked this request) wins
  // over whatever was already on the row.
  const personIdByParticipant = new Map<string, string>();
  for (const s of waiverStatuses) {
    const participant = participants.find((p) => p.id === s.participantId);
    const personId = s.matchedPersonId ?? participant?.person_id;
    if (personId) personIdByParticipant.set(s.participantId, personId);
  }

  // Departure consent only ever applies to minors — silently drop any
  // entry sent for an adult rather than trusting the client's toggle.
  const startDateForConsent = target.starts ? new Date(target.starts) : new Date();
  const departureEntries = parsed.data.departure_consents.filter((e) => {
    const participant = participants.find((p) => p.id === e.participant_id);
    return participant && ageOn(participant.dob, startDateForConsent) < 18;
  });

  // Atomic hold — capacity + duplicates enforced under a row lock.
  const { data: bookings, error: rpcError } = await service.rpc(
    "mem_hold_bookings",
    {
      p_account_id: authed.account.id,
      p_participant_ids: participant_ids,
      p_occurrence_id: occurrence_id ?? null,
      p_course_run_id: course_run_id ?? null,
      p_expiry_minutes: PENDING_BOOKING_EXPIRY_MINUTES,
    }
  );

  if (rpcError) {
    const message = rpcError.message ?? "";
    if (message.includes("mem_capacity_exceeded")) {
      return NextResponse.json(
        { error: "capacity", message: "Not enough spaces left on this session." },
        { status: 409 }
      );
    }
    if (message.includes("mem_duplicate_booking")) {
      return NextResponse.json(
        {
          error: "duplicate",
          message: "One of these participants is already booked on this session.",
        },
        { status: 409 }
      );
    }
    if (message.includes("mem_not_bookable")) {
      return NextResponse.json(
        { error: "This session can no longer be booked." },
        { status: 409 }
      );
    }
    console.error("mem_hold_bookings failed", rpcError);
    return NextResponse.json(
      { error: "Could not complete the booking — please try again." },
      { status: 500 }
    );
  }

  const held = (bookings ?? []) as Booking[];
  const heldIds = held.map((b) => b.id);
  const participantName = new Map(participants.map((p) => [p.id, p.name]));

  // Write departure consent now the hold has actually secured a place —
  // not gated on Stripe succeeding after this, since the consent itself
  // (and the session_date it's recorded against) doesn't depend on payment
  // completing. session_date matches what staff_today_departure_consents
  // checks against.
  if (departureEntries.length > 0) {
    const sessionDate = startDateForConsent.toISOString().slice(0, 10);
    await recordDepartureConsents(
      departureEntries
        .map((e) => {
          const personId = personIdByParticipant.get(e.participant_id);
          const name = participantName.get(e.participant_id);
          if (!personId || !name) return null;
          return { ...e, personId, childName: name, sessionDate };
        })
        .filter((e): e is NonNullable<typeof e> => e !== null)
    );
  }
  const when =
    occurrence_id && target.starts && target.ends
      ? formatOccurrence(target.starts, target.ends)
      : target.label ??
        (target.starts ? `starts ${formatDate(target.starts)}` : "");
  const origin = requestOrigin(request);
  const cancelPath = occurrence_id
    ? `/book/${occurrence_id}`
    : `/book/run/${course_run_id}`;

  try {
    const stripe = getStripe();

    // One Stripe customer per account — created on first payment, reused for
    // every later Checkout and for Phase 2 Billing subscriptions. Lives in
    // lib/stripe.ts so the subscribe route shares this exact path rather than
    // growing a second one.
    const customerId = await getOrCreateStripeCustomer(service, authed);

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      // Card only — the webhook treats payment as synchronous; async
      // methods (Klarna etc.) would confirm holds late or not at all.
      payment_method_types: ["card"],
      customer: customerId,
      client_reference_id: authed.account.id,
      line_items: held.map((b) => ({
        quantity: 1,
        price_data: {
          currency: "gbp",
          unit_amount: b.price_paid_pence ?? 0,
          product_data: {
            name: target!.offering.title,
            description: [participantName.get(b.participant_id), when]
              .filter(Boolean)
              .join(" — "),
          },
        },
      })),
      metadata: { booking_ids: heldIds.join(","), account_id: authed.account.id },
      payment_intent_data: {
        metadata: { booking_ids: heldIds.join(","), account_id: authed.account.id },
      },
      // Stripe's floor is 30 min from creation; 31 clears clock skew.
      expires_at: Math.floor(Date.now() / 1000) + 31 * 60,
      success_url: `${origin}/book/confirmation?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}${cancelPath}`,
    });

    if (!session.url) throw new Error("Checkout session has no url");

    // Tie the holds to the session and extend them past its expiry.
    const graceExpiry = new Date(
      ((session.expires_at ?? Math.floor(Date.now() / 1000) + 31 * 60) +
        HOLD_GRACE_MINUTES * 60) *
        1000
    ).toISOString();
    const { error: linkError } = await service
      .from("mem_bookings")
      .update({ stripe_checkout_session_id: session.id, expires_at: graceExpiry })
      .in("id", heldIds);
    if (linkError) throw linkError;

    return NextResponse.json(
      { checkout_url: session.url, bookings: held },
      { status: 201 }
    );
  } catch (error) {
    console.error("checkout session creation failed", error);
    // Release the holds — don't strand capacity behind a payment that
    // can never complete.
    await service
      .from("mem_bookings")
      .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
      .in("id", heldIds)
      .eq("status", "pending_payment");
    return NextResponse.json(
      { error: "Could not start the payment — please try again." },
      { status: 500 }
    );
  }
}
