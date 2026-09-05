// Platform analytics reads — service client, same as lib/admin-data.ts, and
// callers must already be past the (admin) layout's allowlist gate.
//
// Both reads go through SECURITY DEFINER functions rather than table selects.
// The member count excludes Empowr's own staff accounts, which are only
// identifiable by email address, and email lives in auth.users — a table
// PostgREST cannot reach through .from() and which has no business being on
// the wire to render a screen of integers. The functions count in the
// database and return counts alone. See migration
// 20260905_members_admin_analytics_rpcs for the full reasoning.
import "server-only";
import { createServiceClient } from "@/lib/supabase/service";

export type MemberStats = {
  /** Every mem_accounts row, staff included. Shown so the exclusion below
   *  is visible rather than silently applied. */
  accountsTotal: number;
  /** Accounts on an Empowr or Pecuvate domain. */
  internalAccounts: number;
  /** accountsTotal - internalAccounts. The headline "members" number. */
  membersTotal: number;
  membersWithParticipant: number;
  membersWithPaidBooking: number;
  newThisWeek: number;
  newThisMonth: number;
  activeMemberships: number;
  grossPaidPence: number;
};

export type SignupWeek = { weekStart: string; signups: number };

/** bigint comes back from PostgREST as a number within the safe range and as
 *  a string beyond it. Coerced here so a busy year cannot turn a total into
 *  string concatenation somewhere downstream. */
function toInt(value: unknown): number {
  const n = typeof value === "string" ? Number(value) : (value as number);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Null on failure, never zeroes.
 *
 * The catalogue's capacity counters degrade to "sold out" because
 * understating availability costs a booking while overstating it takes money
 * for a place that does not exist. The safe direction here is the opposite:
 * rendering 0 members when there are 37 is not a cautious estimate, it is a
 * false statement about the business on the screen someone is using to
 * decide whether the platform is working. So a failed read renders as an
 * explicit error, and the page says it could not load rather than inventing
 * a number.
 */
export async function getMemberStats(): Promise<MemberStats | null> {
  const { data, error } = await createServiceClient().rpc(
    "mem_admin_member_stats"
  );
  if (error) {
    console.error("getMemberStats failed", error);
    return null;
  }
  const row = (data as Record<string, unknown>[] | null)?.[0];
  if (!row) {
    console.error("getMemberStats returned no row");
    return null;
  }
  return {
    accountsTotal: toInt(row.accounts_total),
    internalAccounts: toInt(row.internal_accounts),
    membersTotal: toInt(row.members_total),
    membersWithParticipant: toInt(row.members_with_participant),
    membersWithPaidBooking: toInt(row.members_with_paid_booking),
    newThisWeek: toInt(row.new_this_week),
    newThisMonth: toInt(row.new_this_month),
    activeMemberships: toInt(row.active_memberships),
    grossPaidPence: toInt(row.gross_paid_pence),
  };
}

/** Weeks with no signups come back as explicit zeroes from the function's
 *  generate_series, so the trend cannot close a quiet fortnight into a line
 *  that looks like steady growth. Empty array on failure — the chart is
 *  supporting detail, and the page still renders its headline figures. */
export async function getSignupsByWeek(weeks = 12): Promise<SignupWeek[]> {
  const { data, error } = await createServiceClient().rpc(
    "mem_admin_signups_by_week",
    { p_weeks: weeks }
  );
  if (error) {
    console.error("getSignupsByWeek failed", error);
    return [];
  }
  return ((data as Record<string, unknown>[] | null) ?? []).map((row) => ({
    weekStart: String(row.week_start),
    signups: toInt(row.signups),
  }));
}
