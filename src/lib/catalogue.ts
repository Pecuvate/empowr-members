// Catalogue reads — anon-safe queries through the cookie-free public
// client (active offerings, scheduled occurrences, venues). Server
// components only.
//
// Every database read here is wrapped in unstable_cache() under a single
// CATALOGUE_TAG. The public catalogue is read on every visit and written
// only by an admin, so serving it from cache turns the hot path from a
// transatlantic round trip into a memory lookup. Admin writes call
// revalidateCatalogue() (lib/revalidate.ts) to drop these entries; the
// revalidate window below is only a backstop in case one is ever missed.
//
// Two deliberate shapes here:
//
//  - The cached queries take no time argument and apply no time filter.
//    Baking new Date() into a cache key would either fragment the cache
//    per-request or freeze "now" into a cached row set. Instead the
//    queries fetch every scheduled row and the callers filter to future
//    ones in memory, so a cache entry stays correct however old it is.
//  - Filtering by type and age also happens in memory, over the full
//    active set, rather than as extra query variants. At single-digit
//    offering counts this is free, and it collapses what would otherwise
//    be a separate cache entry per filter combination into one.
import "server-only";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";
import { CATALOGUE_TAG } from "@/lib/revalidate";
// Error policy for every read below. It lives in its own module, with no
// server-only guard, so the rule is testable outside Next — read the comment
// there before adding a catalogue read that handles its own error.
import { unwrap } from "@/lib/catalogue-read";
import { OFFERING_TYPES, type OfferingType } from "@/lib/offering-types";
import {
  filterOfferings,
  type CatalogueFilters,
} from "@/lib/catalogue-filters";

export { OFFERING_TYPES, TYPE_LABELS, TYPE_LABELS_SINGULAR } from "@/lib/offering-types";
export type { OfferingType } from "@/lib/offering-types";

/** Backstop only — admin writes invalidate by tag immediately. */
const CATALOGUE_REVALIDATE_SECONDS = 300;


export type Venue = {
  id: string;
  name: string;
  address: string | null;
  postcode: string | null;
};

export type CatalogueOffering = {
  id: string;
  slug: string;
  title: string;
  type: OfferingType;
  description: string | null;
  age_min: number | null;
  age_max: number | null;
  price_pence: number;
  walk_in_price_pence: number | null;
  early_bird_price_pence: number | null;
  refund_policy: "standard" | "non_refundable";
  enrolment_scope: "per_occurrence" | "per_run";
  kit_list: string | null;
  venue: Venue | null;
};

/** Offering shape used by the catalogue cards. Venues are derived from
 * whichever level the offering sells at — upcoming scheduled occurrences
 * (including occurrence-level overrides) for per_occurrence, or the course
 * runs for per_run, which hold no occurrences to read. */
export type CatalogueListingOffering = CatalogueOffering & {
  venues: Venue[];
};

export type CatalogueOccurrence = {
  id: string;
  course_run_id: string | null;
  starts_at: string;
  ends_at: string;
  venue: Venue | null; // override; fall back to offering venue
};

export type CatalogueCourseRun = {
  id: string;
  label: string;
  starts_on: string | null;
  ends_on: string | null;
  price_pence: number | null; // null = offering price
  /** Venue for this specific run. null = the offering's own venue applies.
   *  A course whose levels run at different venues (Prep to Street Skate)
   *  carries no offering venue at all and sets this on every run. */
  venue: Venue | null;
};

const OFFERING_SELECT =
  "id, slug, title, type, description, age_min, age_max, price_pence, walk_in_price_pence, early_bird_price_pence, refund_policy, enrolment_scope, kit_list, venue:mem_venues(id, name, address, postcode)";

export function isOfferingType(value: string): value is OfferingType {
  return (OFFERING_TYPES as readonly string[]).includes(value);
}

/** Every active offering, title-ordered. The one cached read behind all
 *  catalogue listing — callers filter this set rather than re-querying. */
const listActiveOfferings = unstable_cache(
  async (): Promise<CatalogueOffering[]> => {
    const { data, error } = await createPublicClient()
      .from("mem_offerings")
      .select(OFFERING_SELECT)
      .eq("active", true)
      .order("title");

    // THROWS rather than returning []. This list becomes
    // generateStaticParams() for /sessions/[slug], where dynamicParams is
    // false — so an empty list means every session page is a hard 404, and
    // swallowing the error made that a GREEN build. Verified: with an
    // unreachable database and a cleared .next/cache, the build exited 0 and
    // emitted /sessions/[slug] with no slugs at all.
    //
    // Throwing is also right at runtime. These reads sit behind
    // unstable_cache with revalidate, and Next serves the last good page
    // when a revalidation throws — whereas returning [] REPLACES a good
    // catalogue with "no sessions". Failing loudly preserves content;
    // failing quietly destroys it.
    return (unwrap("listActiveOfferings", data, error) ??
      []) as unknown as CatalogueOffering[];
  },
  ["catalogue:active-offerings"],
  { tags: [CATALOGUE_TAG], revalidate: CATALOGUE_REVALIDATE_SECONDS }
);

/** The type/age filter itself lives in lib/catalogue-filters.ts, which
 *  carries no "server-only" guard so the client-side filter UI on
 *  /sessions applies the identical rule. See that file before changing
 *  the semantics.
 *
 *  It was previously expressed as two chained .or() filters on the
 *  query. That was correct — PostgREST ANDs repeated `or=` parameters,
 *  verified directly against this project's REST endpoint — and the
 *  shared function reproduces the same truth table. It moved in-memory
 *  only because the filter now runs over the cached active set rather
 *  than as its own query. */
export async function listOfferings(
  filters: CatalogueFilters
): Promise<CatalogueOffering[]> {
  return filterOfferings(await listActiveOfferings(), filters);
}

/** Active offerings with the distinct venues used by their upcoming dates.
 * The offering venue is only a fallback when a date has no override. */
export async function listOfferingsWithVenues(
  filters: CatalogueFilters
): Promise<CatalogueListingOffering[]> {
  const offerings = await listOfferings(filters);

  return Promise.all(
    offerings.map(async (offering) => {
      const venuesById = new Map<string, Venue>();

      // Dates live at whichever level the offering sells at, so the venues
      // must be read from that same level. A per_run course carries NO
      // occurrences at all (Beginners Foundation: 14 runs, 0 occurrences),
      // so reading occurrences here finds nothing and the card can only
      // fall back to the offering venue — which Prep to Street Skate does
      // not have, because its levels genuinely run at two different parks
      // and it sets the venue on every run instead. That combination left
      // an active, bookable course rendering no venue at all.
      // Same branch as the detail page, which is the other consumer of
      // enrolment_scope; runs are deliberately not date-filtered there
      // either, so the two agree on what "this course's venues" means.
      if (offering.enrolment_scope === "per_run") {
        for (const run of await listCourseRuns(offering.id)) {
          const venue = run.venue ?? offering.venue;
          if (venue) venuesById.set(venue.id, venue);
        }
      } else {
        for (const occurrence of await listUpcomingOccurrences(offering.id)) {
          const venue = occurrence.venue ?? offering.venue;
          if (venue) venuesById.set(venue.id, venue);
        }
      }

      if (venuesById.size === 0 && offering.venue) {
        venuesById.set(offering.venue.id, offering.venue);
      }

      return { ...offering, venues: [...venuesById.values()] };
    })
  );
}

const getOfferingCached = unstable_cache(
  async (slug: string): Promise<CatalogueOffering | null> => {
    const { data, error } = await createPublicClient()
      .from("mem_offerings")
      .select(OFFERING_SELECT)
      .eq("slug", slug)
      .eq("active", true)
      .maybeSingle();

    // THROWS rather than returning null — null here means "no active
    // offering with this slug", which the page turns straight into
    // notFound(). A database failure must never be able to say that: see
    // lib/catalogue-read.ts for the outage that caused.
    return (unwrap("getOffering", data, error) as unknown as
      CatalogueOffering) ?? null;
  },
  ["catalogue:offering-by-slug"],
  { tags: [CATALOGUE_TAG], revalidate: CATALOGUE_REVALIDATE_SECONDS }
);

/** Wrapped in React cache() as well as unstable_cache(): the session
 *  detail route calls this from both generateMetadata and the page body,
 *  and this collapses those into one lookup per render. */
export const getOffering = cache(
  (slug: string): Promise<CatalogueOffering | null> => getOfferingCached(slug)
);

/** Every scheduled occurrence for an offering, soonest first — including
 *  past ones, so the cache entry does not depend on when it was built.
 *  Callers drop the past via listUpcomingOccurrences(). */
const listScheduledOccurrences = unstable_cache(
  async (offeringId: string): Promise<CatalogueOccurrence[]> => {
    const { data, error } = await createPublicClient()
      .from("mem_occurrences")
      .select(
        "id, course_run_id, starts_at, ends_at, venue:mem_venues(id, name, address, postcode)"
      )
      .eq("offering_id", offeringId)
      .eq("status", "scheduled")
      .order("starts_at");

    // Same reasoning as listActiveOfferings: [] here is indistinguishable
    // from "this session has no dates yet", so a database failure would show
    // a customer "dates coming soon" for a session that is actually running.
    return (unwrap("listScheduledOccurrences", data, error) ??
      []) as unknown as CatalogueOccurrence[];
  },
  ["catalogue:scheduled-occurrences"],
  { tags: [CATALOGUE_TAG], revalidate: CATALOGUE_REVALIDATE_SECONDS }
);

/** Upcoming scheduled occurrences for an offering, soonest first. */
export async function listUpcomingOccurrences(
  offeringId: string,
  limit = 30
): Promise<CatalogueOccurrence[]> {
  const occurrences = await listScheduledOccurrences(offeringId);
  const now = Date.now();
  return occurrences
    .filter((o) => new Date(o.starts_at).getTime() >= now)
    .slice(0, limit);
}

export type CapacityInfo = { capacity: number | null; booked: number };

/**
 * Public capacity counters — how many places an occurrence/course run has
 * and how many are taken, keyed by id.
 *
 * Goes through mem_public_occurrence_capacity()/mem_public_course_run_capacity()
 * rather than a direct table read: mem_bookings has no anon SELECT policy at
 * all (members_read_own_bookings is `to authenticated`, scoped to the
 * caller's own account), so an anon read against it doesn't error — it
 * silently returns zero rows, which would make this always read "0 booked".
 * Those SECURITY DEFINER functions expose only the two integers, nothing
 * RLS would otherwise hide, and count exactly what mem_hold_bookings()
 * counts (pending_payment/confirmed/attended) so this can never disagree
 * with the thing that actually enforces capacity.
 *
 * NOT wrapped in unstable_cache: the page itself is ISR'd at `revalidate =
 * 300` (sessions/[slug]/page.tsx), which already caches this along with
 * everything else on the page for that window — a second cache layer here
 * would only add a cache-key-per-id-combination without buying anything.
 *
 * THROWS on a database error, through the same shared error-handling
 * helper every other read in this file uses (verify:catalogue pins that
 * as a whole-file invariant, for exactly the reason named at the top of
 * this file: a policy applied to three of four reads and forgotten on the
 * rest is what caused the 2026-09-02 outage). This data is genuinely
 * optional — a page that can't show a capacity counter should still
 * render — so the caller (sessions/[slug]/page.tsx) catches and degrades,
 * the same pattern lib/booking.ts already uses around
 * coverForOccurrence(). Degrading here instead would make a failed read
 * indistinguishable from "capacity genuinely unlimited", the exact class
 * of bug that helper exists to prevent.
 */
export async function occurrenceCapacities(
  occurrenceIds: string[]
): Promise<Map<string, CapacityInfo>> {
  if (occurrenceIds.length === 0) return new Map();
  const { data, error } = await createPublicClient().rpc(
    "mem_public_occurrence_capacity",
    { p_occurrence_ids: occurrenceIds }
  );
  const rows = (unwrap("occurrenceCapacities", data, error) ?? []) as {
    occurrence_id: string;
    capacity: number | null;
    booked: number;
  }[];
  return new Map(
    rows.map((row) => [row.occurrence_id, { capacity: row.capacity, booked: row.booked }])
  );
}

export type EarlyBirdInfo = {
  capacity: number | null;
  pricePence: number | null;
  booked: number;
};

/**
 * Early bird allocation and uptake for these occurrences, keyed by id.
 *
 * A separate RPC from mem_public_occurrence_capacity() on purpose: widening
 * that function's return shape would have meant dropping and recreating a
 * function the live public catalogue calls on every render, and there was no
 * reason to take that window for an additive read.
 *
 * mem_public_early_bird() counts exactly what mem_hold_bookings() counts when
 * it enforces the allocation, for the same reason the capacity RPC mirrors it:
 * a page that disagreed with the function refusing the sale would advertise
 * tickets nobody can buy.
 *
 * THROWS on a database error, like every other read in this file. Callers
 * that can live without the number catch and degrade to "no early bird
 * offered" — which is the safe direction, since it shows the standard price
 * rather than one that might not be honoured.
 */
export async function earlyBirdAvailability(
  occurrenceIds: string[]
): Promise<Map<string, EarlyBirdInfo>> {
  if (occurrenceIds.length === 0) return new Map();
  const { data, error } = await createPublicClient().rpc(
    "mem_public_early_bird",
    { p_occurrence_ids: occurrenceIds }
  );
  const rows = (unwrap("earlyBirdAvailability", data, error) ?? []) as {
    occurrence_id: string;
    early_bird_capacity: number | null;
    early_bird_price_pence: number | null;
    early_bird_booked: number;
  }[];
  return new Map(
    rows.map((row) => [
      row.occurrence_id,
      {
        capacity: row.early_bird_capacity,
        pricePence: row.early_bird_price_pence,
        booked: row.early_bird_booked,
      },
    ])
  );
}

/**
 * The early bird offer to show for one occurrence, or null when there isn't
 * one. Null covers all of: no allocation set on this date, no early bird
 * price on the offering, and every ticket already sold — the form and the
 * session page both treat those identically, so the arithmetic lives here
 * once rather than in each of them.
 */
export function earlyBirdOffer(
  info: EarlyBirdInfo | undefined
): { pricePence: number; remaining: number } | null {
  if (!info || info.capacity === null || info.pricePence === null) return null;
  const remaining = info.capacity - info.booked;
  if (remaining <= 0) return null;
  return { pricePence: info.pricePence, remaining };
}

export async function courseRunCapacities(
  courseRunIds: string[]
): Promise<Map<string, CapacityInfo>> {
  if (courseRunIds.length === 0) return new Map();
  const { data, error } = await createPublicClient().rpc(
    "mem_public_course_run_capacity",
    { p_course_run_ids: courseRunIds }
  );
  const rows = (unwrap("courseRunCapacities", data, error) ?? []) as {
    course_run_id: string;
    capacity: number | null;
    booked: number;
  }[];
  return new Map(
    rows.map((row) => [row.course_run_id, { capacity: row.capacity, booked: row.booked }])
  );
}

export const listCourseRuns = unstable_cache(
  async (offeringId: string): Promise<CatalogueCourseRun[]> => {
    const { data, error } = await createPublicClient()
      .from("mem_course_runs")
      .select(
        "id, label, starts_on, ends_on, price_pence, venue:mem_venues(id, name, address, postcode)"
      )
      .eq("offering_id", offeringId)
      .order("starts_on", { ascending: true, nullsFirst: false });

    // As above — an empty run list reads as "no courses scheduled", which
    // is a claim, not an absence of information.
    return (unwrap("listCourseRuns", data, error) ??
      []) as unknown as CatalogueCourseRun[];
  },
  ["catalogue:course-runs"],
  { tags: [CATALOGUE_TAG], revalidate: CATALOGUE_REVALIDATE_SECONDS }
);
