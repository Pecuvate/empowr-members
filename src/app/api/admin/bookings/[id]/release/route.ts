// POST /api/admin/bookings/[id]/release — staff release a hold that is
// still waiting on payment.
//
// Why this exists: a pending_payment hold consumes capacity for ~41 minutes
// (30-minute hold + Stripe's 31-minute session + 10 minutes of grace), and
// until now nothing but the pg_cron sweep could end one early. At the door
// that is the difference between a visible free place and a room that reads
// as full while people queue for it.
//
// SHORTENING THE HOLD IS NOT THE ALTERNATIVE. Stripe Checkout enforces a
// 30-minute minimum expiry, so a shorter hold would let a payment land after
// the sweep had already released the place — paid, with no booking. Explicit
// release is the correct fix.
//
// Scoped to pending_payment only, and deliberately so: releasing a CONFIRMED
// booking would strand a real payment with no refund, which is what the
// admin occurrence-cancel flow (with its refund/credit choice) is for.
import { NextResponse } from "next/server";
import { getAuthedCheckinStaff } from "@/lib/admin";
import { createServiceClient } from "@/lib/supabase/service";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  const staff = await getAuthedCheckinStaff();
  if (!staff) {
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }
  const { id } = await params;

  const service = createServiceClient();
  const { data, error } = await service
    .from("mem_bookings")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "pending_payment")
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("release: update failed", id, error);
    return NextResponse.json(
      { error: "Could not release this hold — please try again." },
      { status: 500 }
    );
  }

  // rowFlipped false means it was already paid, already released, or swept
  // between the page render and the tap — all no-ops, none of them errors.
  return NextResponse.json({ ok: true, rowFlipped: Boolean(data) });
}
