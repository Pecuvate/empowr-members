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
  plan_id: string;
  stripe_subscription_id: string | null;
  status: MembershipStatus;
  current_period_end: string | null;
  created_at: string;
  updated_at: string;
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
