// POST /api/admin/walk-ins — staff record a member who turned up without
// booking, and hand them a link to pay the door price on their own phone.
//
// This is an ADMIN ENTRY POINT ONTO THE EXISTING PIPELINE, not a second
// pipeline. The hold, the capacity race, the price snapshot, the Checkout
// session, the webhook that confirms the booking and emails the ticket —
// all of it is the same machinery POST /api/bookings uses and all of it is
// already e2e-proven. The differences are only:
//
//   - the ACCOUNT PAYING IS NOT THE CALLER. Staff pick the participant, so
//     the account, its email and its Stripe customer are all resolved from
//     the participant row, never from the signed-in staff member.
//   - mem_hold_bookings() runs with p_walk_in => true, which snapshots the
//     door price, stamps source = 'walk_in', and allows a session that has
//     already started.
//
// Gates run in the same order as the member route: participants resolve to
// ONE account -> age eligibility -> waiver (fail closed) -> atomic
// capacity check -> Checkout. Nothing is charged before all four pass.
import { NextResponse } from "next/server";
import { getAuthedCheckinStaff } from "@/lib/admin";
import { createServiceClient } from "@/lib/supabase/service";
import { walkInSchema } from "@/lib/validation";
import { checkWaivers, recordWaiverConsent } from "@/lib/waivers";
import { recordDepartureConsents } from "@/lib/departure-consent";
import { isAgeEligible, ageOn } from "@/lib/age";
import { PENDING_BOOKING_EXPIRY_MINUTES } from "@/lib/business-rules";
import {
  getStripe,
  getOrCreateStripeCustomer,
  HOLD_GRACE_MINUTES,
} from "@/lib/stripe";
import { formatOccurrence } from "@/lib/format";
import { requestOrigin } from "@/lib/request-origin";
import { qrDataUrl } from "@/lib/qr";
import type { Booking, Participant } from "@/lib/types";

type OccurrenceRow = {
  starts_at: string;
  ends_at: string;
  offering: {
    title: string;
    age_min: number | null;
    age_max: number | null;
    walk_in_price_pence: number | null;
  };
};

export async function POST(request: Request) {
  const staff = await getAuthedCheckinStaff();
  if (!staff) {
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }

  const parsed = walkInSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }
  const { occurrence_id, participant_ids, departure_consents } = parsed.data;

  const service = createServiceClient();

  const { data: participantRows, error: participantsError } = await service
    .from("mem_participants")
    .select("id, name, dob, person_id, account_id")
    .in("id", participant_ids);
  if (participantsError) {
    console.error("walk-in participants read failed", participantsError);
    return NextResponse.json(
      { error: "Could not start the walk-in — please try again." },
      { status: 500 }
    );
  }
  const participants = (participantRows ?? []) as (Pick<
    Participant,
    "id" | "name" | "dob" | "person_id"
  > & { account_id: string })[];
  if (participants.length !== participant_ids.length) {
    return NextResponse.json(
      { error: "One or more people weren't recognised." },
      { status: 400 }
    );
  }

  // One Checkout session charges one Stripe customer, and mem_hold_bookings()
  // stamps a single account_id on every row — so a mixed-account selection
  // would silently bill one household for another's child. Refuse it here
  // rather than letting the RPC's participant/account check fail with a
  // message that wouldn't explain why.
  const accountIds = new Set(participants.map((p) => p.account_id));
  if (accountIds.size > 1) {
    return NextResponse.json(
      {
        error:
          "Those people are on different accounts — add them as separate walk-ins.",
      },
      { status: 400 }
    );
  }
  const accountId = participants[0].account_id;

  const { data: accountRow, error: accountError } = await service
    .from("mem_accounts")
    .select("id, user_id, name, stripe_customer_id")
    .eq("id", accountId)
    .maybeSingle();
  if (accountError || !accountRow) {
    console.error("walk-in account read failed", accountId, accountError);
    return NextResponse.json(
      { error: "Could not find that member's account." },
      { status: 404 }
    );
  }

  // The account email lives in auth.users, which PostgREST does not expose —
  // and checkWaivers() matches signers on it, so a missing email would fail
  // every waiver check closed rather than open. Read it through the admin
  // API and treat absence as a hard error, not an empty string.
  const { data: authUser, error: authError } =
    await service.auth.admin.getUserById(accountRow.user_id);
  const accountEmail = authUser?.user?.email ?? null;
  if (authError || !accountEmail) {
    console.error("walk-in account email lookup failed", accountId, authError);
    return NextResponse.json(
      { error: "Could not find that member's sign-in email." },
      { status: 500 }
    );
  }

  const { data: occurrenceRow } = await service
    .from("mem_occurrences")
    .select(
      "starts_at, ends_at, offering:mem_offerings(title, age_min, age_max, walk_in_price_pence)"
    )
    .eq("id", occurrence_id)
    .maybeSingle();
  const occurrence = occurrenceRow as unknown as OccurrenceRow | null;
  if (!occurrence) {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }

  // Checked here as well as in the RPC so staff get the actionable message
  // ("set a door price") instead of a generic refusal. The RPC's raise is
  // the real guard — this one just explains it.
  if (occurrence.offering.walk_in_price_pence === null) {
    return NextResponse.json(
      {
        error: "no_door_price",
        message:
          "No door price is set for this session. Add one on the offering before taking walk-ins.",
      },
      { status: 409 }
    );
  }

  // Age is judged on the session's own start date, exactly as the member
  // route does — a 15+ session must not become bookable at the door.
  const startDate = new Date(occurrence.starts_at);
  const ineligible = participants.filter(
    (p) =>
      !isAgeEligible(
        p.dob,
        occurrence.offering.age_min,
        occurrence.offering.age_max,
        startDate
      )
  );
  if (ineligible.length > 0) {
    return NextResponse.json(
      {
        error: "age_ineligible",
        message: `Not the right age for this session: ${ineligible
          .map((p) => p.name)
          .join(", ")}.`,
      },
      { status: 422 }
    );
  }

  // Waiver gate — identical to the member route, including the two writes
  // that keep it fast and correct next time. The backfill matters MORE at
  // the door: without it, a waiver-wording bump would drop everyone covered
  // only by the fallback back to "unsigned" and block a hall full of people.
  const waiverStatuses = await checkWaivers(accountEmail, participants);

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
        message: `No valid waiver on file for ${unsigned
          .map((s) => names.get(s.participantId) ?? "")
          .filter(Boolean)
          .join(", ")}. They need to sign before they can skate.`,
      },
      { status: 409 }
    );
  }

  // Signer person_id per participant, for the departure consent write below.
  // A match made during THIS request wins over whatever was already on the
  // row — same precedence as the member booking route.
  const personIdByParticipant = new Map<string, string>();
  for (const status of waiverStatuses) {
    const participant = participants.find((p) => p.id === status.participantId);
    const personId = status.matchedPersonId ?? participant?.person_id;
    if (personId) personIdByParticipant.set(status.participantId, personId);
  }

  // Departure consent applies to minors only. An entry sent for an adult is
  // dropped rather than trusted — age is judged here from the DOB on record,
  // against the session's own start date, never from anything the panel says.
  const ineligibleForConsent = new Set(
    participants.filter((p) => ageOn(p.dob, startDate) >= 18).map((p) => p.id)
  );
  const departureEntries = departure_consents.filter(
    (entry) =>
      participants.some((p) => p.id === entry.participant_id) &&
      !ineligibleForConsent.has(entry.participant_id)
  );

  const { data: bookings, error: rpcError } = await service.rpc(
    "mem_hold_bookings",
    {
      p_account_id: accountId,
      p_participant_ids: participant_ids,
      p_occurrence_id: occurrence_id,
      p_course_run_id: null,
      p_expiry_minutes: PENDING_BOOKING_EXPIRY_MINUTES,
      p_walk_in: true,
    }
  );

  if (rpcError) {
    const message = rpcError.message ?? "";
    if (message.includes("mem_capacity_exceeded")) {
      return NextResponse.json(
        { error: "capacity", message: "This session is full." },
        { status: 409 }
      );
    }
    if (message.includes("mem_duplicate_booking")) {
      return NextResponse.json(
        {
          error: "duplicate",
          message: "They're already on the register for this session.",
        },
        { status: 409 }
      );
    }
    if (message.includes("mem_no_walk_in_price")) {
      return NextResponse.json(
        {
          error: "no_door_price",
          message:
            "No door price is set for this session. Add one on the offering before taking walk-ins.",
        },
        { status: 409 }
      );
    }
    if (message.includes("mem_not_bookable")) {
      return NextResponse.json(
        {
          error: "not_bookable",
          message: "This session has finished or is no longer taking bookings.",
        },
        { status: 409 }
      );
    }
    console.error("walk-in mem_hold_bookings failed", rpcError);
    return NextResponse.json(
      { error: "Could not take the walk-in — please try again." },
      { status: 500 }
    );
  }

  const held = (bookings ?? []) as Booking[];
  const heldIds = held.map((b) => b.id);
  const participantName = new Map(participants.map((p) => [p.id, p.name]));
  const when = formatOccurrence(occurrence.starts_at, occurrence.ends_at);
  const origin = requestOrigin(request);

  // Written once the hold has actually secured a place, and deliberately NOT
  // gated on the Stripe call that follows: the consent is a safeguarding
  // record of what a parent agreed at the door, and it stays true whether or
  // not the card goes through. session_date matches what the Waivers staff
  // portal (staff_today_departure_consents) filters on, so a consent taken at
  // the door shows up in the same place as one taken online.
  if (departureEntries.length > 0) {
    const sessionDate = startDate.toISOString().slice(0, 10);
    await recordDepartureConsents(
      departureEntries
        .map((entry) => {
          const personId = personIdByParticipant.get(entry.participant_id);
          const childName = participantName.get(entry.participant_id);
          if (!personId || !childName) return null;
          return { ...entry, personId, childName, sessionDate };
        })
        .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    );
  }

  try {
    const stripe = getStripe();

    const customerId = await getOrCreateStripeCustomer(service, {
      id: accountRow.id,
      name: accountRow.name,
      email: accountEmail,
      stripe_customer_id: accountRow.stripe_customer_id,
    });

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer: customerId,
      client_reference_id: accountId,
      line_items: held.map((b) => ({
        quantity: 1,
        price_data: {
          currency: "gbp",
          unit_amount: b.price_paid_pence ?? 0,
          product_data: {
            name: occurrence.offering.title,
            description: [participantName.get(b.participant_id), when, "at the door"]
              .filter(Boolean)
              .join(" — "),
          },
        },
      })),
      metadata: { booking_ids: heldIds.join(","), account_id: accountId },
      payment_intent_data: {
        metadata: { booking_ids: heldIds.join(","), account_id: accountId },
      },
      // Stripe's floor is 30 min from creation; 31 clears clock skew.
      expires_at: Math.floor(Date.now() / 1000) + 31 * 60,
      success_url: `${origin}/book/confirmation?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/sessions`,
    });

    if (!session.url) throw new Error("Checkout session has no url");

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
      {
        checkout_url: session.url,
        // Rendered here rather than in the browser so the panel needs no QR
        // library client-side. Null when rendering fails — the panel falls
        // back to the copyable link, which is why this never throws.
        qr_data_url: await qrDataUrl(session.url),
        booking_ids: heldIds,
        total_pence: held.reduce((sum, b) => sum + (b.price_paid_pence ?? 0), 0),
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("walk-in checkout session creation failed", error);
    // Release the holds — a walk-in that can never be paid must not sit on
    // a place while people are queuing for it.
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
