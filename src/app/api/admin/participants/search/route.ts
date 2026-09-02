// GET /api/admin/participants/search?q=&occurrence_id= — name lookup for
// the door walk-in panel. Admin-gated like every /api/admin/* route: the
// service client bypasses RLS, so this check is the only thing standing
// between a query string and every participant's name and date of birth.
//
// Scoped to one occurrence on purpose. A bare name search would make staff
// eyeball age bounds and existing bookings themselves; scoping it means each
// result carries its own verdict, computed from the same isAgeEligible() the
// booking routes use.
import { NextResponse } from "next/server";
import { getAuthedCheckinStaff } from "@/lib/admin";
import { searchWalkInCandidates } from "@/lib/admin-data";

export async function GET(request: Request) {
  const staff = await getAuthedCheckinStaff();
  if (!staff) {
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const query = (searchParams.get("q") ?? "").trim();
  const occurrenceId = searchParams.get("occurrence_id") ?? "";

  // Two characters minimum — a one-character search returns most of the
  // database and is never what staff meant to type.
  if (query.length < 2 || !occurrenceId) {
    return NextResponse.json({ results: [] });
  }

  return NextResponse.json({
    results: await searchWalkInCandidates(query, occurrenceId),
  });
}
