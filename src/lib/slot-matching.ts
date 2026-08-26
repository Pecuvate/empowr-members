// Does a plan's weekly slot cover a given occurrence?
//
// A Subscription is to ONE WEEKLY SLOT — a specific day and time — not to a
// whole offering (Empowr, 2026-08-26). Sk8 Skool for Kidz runs Mondays 16:00
// and Wednesdays 17:00 at £30 each, so a child attending both needs two
// Subscriptions.
//
// ⚠️ THE TRAP THIS MODULE EXISTS FOR: everything must be compared in
// Europe/London. Occurrence times are stored as timestamptz but represent UK
// wall-clock. Comparing in UTC would shift both the hour and, for late-evening
// sessions, the weekday across the BST boundary — so a "Mondays 16:00" slot
// would match for half the year and silently stop matching for the other half,
// quietly un-entitling every subscriber each October.
//
// Pure and dependency-free on purpose, so that behaviour is directly testable
// outside Next — same reasoning as lib/catalogue-filters.ts. No `server-only`.

export type EntitledSlot = {
  offering_id: string;
  /** ISO day of week, 1=Monday .. 7=Sunday. Null = every slot of the offering. */
  weekday: number | null;
  /** Europe/London wall-clock start, e.g. "16:00:00". Null together with weekday. */
  starts_at_local: string | null;
};

const ISO_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

/** Weekday (ISO 1-7) and "HH:MM" of an instant, in UK local time. */
export function localSlotOf(startsAt: string | Date): {
  weekday: number;
  time: string;
} {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(startsAt));

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    weekday: ISO_DAYS.indexOf(get("weekday") as (typeof ISO_DAYS)[number]) + 1,
    time: `${get("hour")}:${get("minute")}`,
  };
}

export function slotCoversOccurrence(
  slot: EntitledSlot,
  occurrence: { offering_id: string; starts_at: string }
): boolean {
  if (slot.offering_id !== occurrence.offering_id) return false;

  // A slot with no day/time entitles every occurrence of the offering. That is
  // correct for offerings that run once a week, and keeps them immune to a
  // time change. The DB enforces both-or-neither.
  if (slot.weekday === null || slot.starts_at_local === null) return true;

  const local = localSlotOf(occurrence.starts_at);
  if (local.weekday !== slot.weekday) return false;
  // Postgres hands back "HH:MM:SS"; compare on HH:MM.
  return local.time === slot.starts_at_local.slice(0, 5);
}
