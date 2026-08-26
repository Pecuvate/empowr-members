// Row types for the mem_ tables this app reads. Keep in sync with the schema
// of record at `Empowr CIC/supabase/migrations/` — three apps share this
// database, so migrations left this repo on 2026-08-06 and are generated from
// the Supabase migration ledger by dump-ledger.mjs. Do not re-create
// src/supabase/ here. Extend as later phases touch more tables.

export type Account = {
  id: string;
  user_id: string;
  name: string;
  phone: string | null;
  whatsapp_opt_in: boolean;
  stripe_customer_id: string | null;
  created_at: string;
  updated_at: string;
};

export type BookingStatus =
  | "pending_payment"
  | "confirmed"
  | "cancelled"
  | "credited"
  | "refunded"
  | "attended"
  | "no_show";

export type Booking = {
  id: string;
  account_id: string;
  participant_id: string;
  occurrence_id: string | null;
  course_run_id: string | null;
  status: BookingStatus;
  price_paid_pence: number | null;
  source: "online" | "walk_in" | "member";
  stripe_payment_intent_id: string | null;
  stripe_checkout_session_id: string | null;
  expires_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
};

export type MembershipStatus = "active" | "past_due" | "cancelled";

/** A paid Subscription to ONE session — not a sitewide plan. The free
 *  "Empowr Member" account is a separate concept and is not a row here.
 *  Entitlements are per-offering (mem_plan_entitlements.offering_id). */
export type MembershipPlan = {
  id: string;
  name: string;
  price_pence: number;
  /** Stable Stripe Price lookup_key, identical in test and live mode. The
   *  authoritative reference — stripe_price_id is superseded and held NULL
   *  by a CHECK constraint, because a Price ID is mode-specific and this
   *  database is shared by production (live) and previews/local (test). */
  stripe_lookup_key: string | null;
  stripe_price_id: null;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type Membership = {
  id: string;
  account_id: string;
  /** The ONE named skater this Subscription covers — per participant, not
   *  per household (Empowr, 2026-08-26). Two children in the same slot need
   *  two Subscriptions. Nullable only because the column was added after the
   *  table existed; every row this app writes sets it. */
  participant_id: string | null;
  plan_id: string;
  stripe_subscription_id: string | null;
  status: MembershipStatus;
  current_period_end: string | null;
  created_at: string;
  updated_at: string;
};

/** A weekly slot: a specific day and time. NULL weekday+time on an
 *  entitlement means "every slot of this offering", which is correct for
 *  offerings that run once a week and keeps them immune to a time change.
 *  Set explicitly only where an offering has more than one subscribable slot
 *  — today that is Sk8 Skool for Kidz (Mondays 16:00, Wednesdays 17:00). */
export type PlanEntitlement = {
  id: string;
  plan_id: string;
  offering_id: string | null;
  offering_type: string | null;
  sessions_per_period: number | null;
  /** ISO day of week, 1=Monday .. 7=Sunday. */
  weekday: number | null;
  /** Europe/London wall-clock start time, e.g. "16:00:00". */
  starts_at_local: string | null;
};

export type Participant = {
  id: string;
  account_id: string;
  name: string;
  dob: string; // ISO date
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  medical_notes: string | null;
  person_id: string | null; // waiver system link
  default_travel_method: string | null; // pre-fill for per-booking departure consent
  created_at: string;
  updated_at: string;
};
