// POST /api/admin/bookings/[id]/checkin — staff marks a booking attended
// after visually confirming it on the /checkin/[id] lookup page
// (reached by scanning the ticket QR). Deliberately a separate, explicit
// mutation from the lookup itself — a GET must never check someone in
// (bots/link-previews/back-button reloads), and staff need the visual
// confirm step anyway for safeguarding.
//
// Optimistic claim (.eq("status","confirmed")) makes a second scan/tap
// a no-op rather than an error — the caller just sees rowFlipped: false
// and can render "Already checked in".
//
// course_run bookings are refused here too, not just hidden client-side:
// the schema has no per-week attendance concept, so marking one week
// attended would make the whole run look done. See BookingForCheckin.
import { NextResponse } from "next/server";
import { getAuthedCheckinStaff } from "@/lib/admin";
import { createServiceClient } from "@/lib/supabase/service";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  const admin = await getAuthedAdmin();
  if (!staff) {
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }
  const { id } = await params;

  const service = createServiceClient();
  const { data, error } = await service
    .from("mem_bookings")
    .update({ status: "attended" })
    .eq("id", id)
    .eq("status", "confirmed")
    .not("occurrence_id", "is", null)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("checkin: update failed", id, error);
    return NextResponse.json(
      { error: "Could not check in this booking — please try again." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, rowFlipped: Boolean(data) });
}
