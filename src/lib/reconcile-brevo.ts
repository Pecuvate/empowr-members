// Idempotent Brevo reconciliation for both the Stripe webhook and the daily
// Netlify job. The database decides eligibility; Brevo is only a projection.
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  BrevoClient,
  brevoListKeyForOffering,
  brevoListKeyForPlan,
  configuredBrevoLists,
  type BrevoListKey,
} from "@/lib/brevo";

type Offering = { slug: string; title: string };
type BookingRow = {
  account_id: string;
  occurrence: { starts_at: string; ends_at: string; offering: Offering | Offering[] } | null;
  course_run: { starts_on: string; ends_on: string; offering: Offering | Offering[] } | null;
};

const one = <T>(value: T | T[] | null): T | null =>
  Array.isArray(value) ? value[0] ?? null : value;

export async function emailForAccount(service: SupabaseClient, accountId: string) {
  // mem_accounts.id is the application's account id; it is NOT the Auth user
  // id. Resolve the explicit FK first or every valid booking fails its email
  // lookup while Stripe still (correctly) acknowledges the paid webhook.
  const { data: account, error: accountError } = await service
    .from("mem_accounts")
    .select("user_id")
    .eq("id", accountId)
    .maybeSingle();
  if (accountError) throw accountError;
  if (!account?.user_id) return null;

  const { data, error } = await service.auth.admin.getUserById(account.user_id as string);
  if (error) throw error;
  return data.user?.email?.trim().toLowerCase() ?? null;
}

export async function desiredBrevoMemberships(
  service: SupabaseClient,
  accountIds?: string[],
  now = new Date()
): Promise<Map<string, Set<BrevoListKey>>> {
  const desiredByAccount = new Map<string, Set<BrevoListKey>>();
  const include = (accountId: string, key: BrevoListKey | null) => {
    if (!key) return;
    const set = desiredByAccount.get(accountId) ?? new Set<BrevoListKey>();
    set.add(key);
    desiredByAccount.set(accountId, set);
  };

  let bookingQuery = service
    .from("mem_bookings")
    .select("account_id, occurrence:mem_occurrences(starts_at, ends_at, offering:mem_offerings(slug, title)), course_run:mem_course_runs(starts_on, ends_on, offering:mem_offerings(slug, title))")
    .in("status", ["confirmed", "attended"])
    // PAYG operational lists are for purchases, not every historical row
    // carrying a confirmed status. Legacy imports, manual/test bookings and
    // complimentary entries can be confirmed without money changing hands.
    // Subscriber eligibility is calculated independently below, so excluding
    // their Â£0 materialised booking rows here does not remove subscribers.
    .not("stripe_payment_intent_id", "is", null);
  if (accountIds?.length) bookingQuery = bookingQuery.in("account_id", accountIds);
  const { data: bookings, error: bookingError } = await bookingQuery;
  if (bookingError) throw bookingError;

  const nowIso = now.toISOString();
  const todayLondon = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
  for (const booking of (bookings ?? []) as unknown as BookingRow[]) {
    if (booking.occurrence && booking.occurrence.ends_at > nowIso) {
      const offering = one(booking.occurrence.offering);
      include(booking.account_id, offering && brevoListKeyForOffering({
        ...offering, startsAt: booking.occurrence.starts_at,
      }));
    }
    if (booking.course_run && booking.course_run.ends_on >= todayLondon) {
      const offering = one(booking.course_run.offering);
      include(booking.account_id, offering && brevoListKeyForOffering({
        ...offering, startsAt: `${booking.course_run.starts_on}T12:00:00Z`,
      }));
    }
  }

  let membershipQuery = service
    .from("mem_memberships")
    .select("account_id, status, current_period_end, plan:mem_membership_plans(stripe_lookup_key)")
    .in("status", ["active", "past_due"]);
  if (accountIds?.length) membershipQuery = membershipQuery.in("account_id", accountIds);
  const { data: memberships, error: membershipError } = await membershipQuery;
  if (membershipError) throw membershipError;
  for (const row of (memberships ?? []) as unknown as {
    account_id: string; status: string; current_period_end: string | null;
    plan: { stripe_lookup_key: string | null } | { stripe_lookup_key: string | null }[] | null;
  }[]) {
    // A temporary failed payment remains covered through its already-paid
    // period. An active subscription remains covered even if Stripe did not
    // supply a period end.
    if (row.status === "past_due" && (!row.current_period_end || row.current_period_end <= nowIso)) continue;
    include(row.account_id, brevoListKeyForPlan(one(row.plan)?.stripe_lookup_key ?? null));
  }

  const desiredByEmail = new Map<string, Set<BrevoListKey>>();
  for (const [accountId, keys] of desiredByAccount) {
    const email = await emailForAccount(service, accountId);
    if (!email) continue;
    const set = desiredByEmail.get(email) ?? new Set<BrevoListKey>();
    keys.forEach((key) => set.add(key));
    desiredByEmail.set(email, set);
  }
  return desiredByEmail;
}

export async function reconcileBrevo(
  service: SupabaseClient,
  options: { accountIds?: string[]; removeStale?: boolean } = {}
) {
  const apiKey = process.env.BREVO_API_KEY;
  const lists = configuredBrevoLists();
  if (!apiKey || lists.size === 0) return { skipped: true, added: 0, removed: 0 };
  const client = new BrevoClient(apiKey);
  const desired = await desiredBrevoMemberships(service, options.accountIds);

  let added = 0;
  for (const [email, keys] of desired) {
    const listIds = [...keys].flatMap((key) => {
      const id = lists.get(key); return id ? [id] : [];
    });
    await client.ensureContactOnLists(email, listIds);
    added += listIds.length;
  }

  let removed = 0;
  if (options.removeStale) {
    for (const [key, listId] of lists) {
      const wanted = new Set([...desired].filter(([, keys]) => keys.has(key)).map(([email]) => email));
      const stale = (await client.contactsOnList(listId)).filter((email) => !wanted.has(email));
      await client.removeEmailsFromList(listId, stale);
      removed += stale.length;
    }
  }
  return { skipped: false, added, removed };
}

