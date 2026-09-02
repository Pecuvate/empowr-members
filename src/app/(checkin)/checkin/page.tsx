import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock, QrCode, Users } from "lucide-react";
import { listUpcomingOccurrencesForDashboard } from "@/lib/admin-data";
import { formatOccurrence } from "@/lib/format";

export const metadata: Metadata = { title: "Check in — Door Check-in" };
export const dynamic = "force-dynamic";

/**
 * Door-side landing page for check-in.
 *
 * Scanning a member's QR with a phone's native camera deep-links straight to
 * /admin/checkin/[bookingId], so the happy path never needs this page. It
 * exists for the cases that path cannot serve: a flat battery, a screen too
 * dim to scan, or a member who never opened the ticket email. In-page
 * scanning is not an option — netlify.toml ships
 * `Permissions-Policy: camera=()`, so the browser cannot open a camera at all.
 *
 * "Today" is deliberately the whole calendar day rather than a rolling
 * window: staff open this before a session starts, and a rolling "next N
 * hours" would hide a session that began ten minutes ago — exactly when the
 * register is most needed.
 *
 * That was only ever true of the FILTER. The query underneath it asked for
 * starts_at >= now(), so a session vanished from this page the moment it
 * began and staff lost the register mid-session — and, once walk-ins landed,
 * lost the only route to adding one. Fixed 2026-08-28 by the includeStarted
 * flag; the two must stay agreed, so change them together.
 */
export default async function CheckinIndexPage() {
  // 2 days covers "today" in any timezone offset; includeStarted keeps a
  // session that has already begun in the list, which is the whole point of
  // this page. Both are then cut precisely by London calendar day below.
  const upcoming = await listUpcomingOccurrencesForDashboard(2, true);

  const londonDay = (iso: string) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(
      new Date(iso)
    );
  const todayLondon = londonDay(new Date().toISOString());

  const today = upcoming.filter((o) => londonDay(o.starts_at) === todayLondon);
  // Strictly AFTER today. `!today.includes(o)` would have been enough while
  // the query started at now(); with the widened lower bound it would also
  // sweep yesterday's late sessions into a heading that says "Tomorrow".
  // ISO YYYY-MM-DD compares correctly as a string.
  const later = upcoming.filter((o) => londonDay(o.starts_at) > todayLondon);

  return (
    <main className="mx-auto max-w-3xl space-y-8 px-4 py-10 sm:px-6">
      <div>
        <h1 className="text-3xl font-black tracking-tight text-black">
          Check in
        </h1>
        <p className="mt-1 text-mid">
          Scan a member&apos;s QR code with your phone camera to check them in
          directly. Or open a register below to mark people attended by hand.
        </p>
      </div>

      <section>
        <h2 className="flex items-center gap-2 text-xl font-extrabold text-black">
          <QrCode className="h-5 w-5 text-blue" aria-hidden /> Today
        </h2>
        {today.length === 0 ? (
          <p className="mt-3 rounded-xl bg-blue-pale px-4 py-3 text-sm font-semibold text-blue-dark">
            No sessions scheduled today.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-line rounded-2xl border border-line">
            {today.map((occurrence) => (
              <li key={occurrence.id}>
                <Link
                  href={`/checkin/registers/${occurrence.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 transition-colors hover:bg-blue-pale/40"
                >
                  <div>
                    <p className="font-extrabold text-black">
                      {occurrence.offering?.title ?? "Untitled"}
                    </p>
                    <p className="text-sm font-semibold text-mid">
                      {formatOccurrence(
                        occurrence.starts_at,
                        occurrence.ends_at
                      )}
                    </p>
                  </div>
                  <span className="flex items-center gap-1 text-sm font-bold text-mid">
                    <Users className="h-3.5 w-3.5" aria-hidden />{" "}
                    {occurrence.booked_count}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {later.length > 0 && (
        <section>
          <h2 className="flex items-center gap-2 text-xl font-extrabold text-black">
            <CalendarClock className="h-5 w-5 text-blue" aria-hidden /> Tomorrow
          </h2>
          <ul className="mt-4 divide-y divide-line rounded-2xl border border-line">
            {later.map((occurrence) => (
              <li key={occurrence.id}>
                <Link
                  href={`/checkin/registers/${occurrence.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 transition-colors hover:bg-blue-pale/40"
                >
                  <div>
                    <p className="font-extrabold text-black">
                      {occurrence.offering?.title ?? "Untitled"}
                    </p>
                    <p className="text-sm font-semibold text-mid">
                      {formatOccurrence(
                        occurrence.starts_at,
                        occurrence.ends_at
                      )}
                    </p>
                  </div>
                  <span className="flex items-center gap-1 text-sm font-bold text-mid">
                    <Users className="h-3.5 w-3.5" aria-hidden />{" "}
                    {occurrence.booked_count}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
