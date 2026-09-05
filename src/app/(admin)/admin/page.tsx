import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, CalendarClock, MapPin, Package, QrCode, TrendingUp, Users } from "lucide-react";
import { listUpcomingOccurrencesForDashboard } from "@/lib/admin-data";
import { formatOccurrence } from "@/lib/format";

export const metadata: Metadata = { title: "Admin — Members Admin" };
export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const upcoming = await listUpcomingOccurrencesForDashboard(7);

  return (
    <main className="mx-auto max-w-4xl space-y-8 px-4 py-10 sm:px-6">
      <div>
        <h1 className="text-3xl font-black tracking-tight text-black">
          Admin
        </h1>
        <p className="mt-1 text-mid">The next 7 days, and where to manage the catalogue.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/admin/checkin"
          className="flex items-center gap-3 rounded-2xl bg-card p-5 shadow-sm transition-colors hover:bg-blue-pale/40 sm:col-span-2"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-pale">
            <QrCode className="h-5 w-5 text-blue" aria-hidden />
          </span>
          <div>
            <p className="font-extrabold text-black">Check in</p>
            <p className="text-sm text-mid">
              Today&apos;s sessions — take the register at the door
            </p>
          </div>
        </Link>
        <Link
          href="/admin/offerings"
          className="flex items-center gap-3 rounded-2xl bg-card p-5 shadow-sm transition-colors hover:bg-blue-pale/40"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-pale">
            <Package className="h-5 w-5 text-blue" aria-hidden />
          </span>
          <div>
            <p className="font-extrabold text-black">Offerings</p>
            <p className="text-sm text-mid">Sessions, courses, camps, events</p>
          </div>
        </Link>
        <Link
          href="/admin/guides"
          className="flex items-center gap-3 rounded-2xl bg-card p-5 shadow-sm transition-colors hover:bg-blue-pale/40"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-pale">
            <BookOpen className="h-5 w-5 text-blue" aria-hidden />
          </span>
          <div>
            <p className="font-extrabold text-black">Guides</p>
            <p className="text-sm text-mid">How to run things at the door</p>
          </div>
        </Link>
        <Link
          href="/admin/venues"
          className="flex items-center gap-3 rounded-2xl bg-card p-5 shadow-sm transition-colors hover:bg-blue-pale/40"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-pale">
            <MapPin className="h-5 w-5 text-blue" aria-hidden />
          </span>
          <div>
            <p className="font-extrabold text-black">Venues</p>
            <p className="text-sm text-mid">Where sessions run</p>
          </div>
        </Link>
        <Link
          href="/admin/analytics"
          className="flex items-center gap-3 rounded-2xl bg-card p-5 shadow-sm transition-colors hover:bg-blue-pale/40 sm:col-span-2"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-pale">
            <TrendingUp className="h-5 w-5 text-blue" aria-hidden />
          </span>
          <div>
            <p className="font-extrabold text-black">Analytics</p>
            <p className="text-sm text-mid">
              Signups, and how far people get
            </p>
          </div>
        </Link>
      </div>

      <section>
        <h2 className="flex items-center gap-2 text-xl font-extrabold text-black">
          <CalendarClock className="h-5 w-5 text-blue" aria-hidden /> Next 7 days
        </h2>
        {upcoming.length === 0 ? (
          <p className="mt-3 rounded-xl bg-blue-pale px-4 py-3 text-sm font-semibold text-blue-dark">
            Nothing scheduled in the next week.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-line rounded-2xl border border-line">
            {upcoming.map((occurrence) => (
              <li key={occurrence.id}>
                <Link
                  href={`/admin/registers/${occurrence.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 transition-colors hover:bg-blue-pale/40"
                >
                  <div>
                    <p className="font-extrabold text-black">
                      {occurrence.offering?.title ?? "Untitled"}
                    </p>
                    <p className="text-sm font-semibold text-mid">
                      {formatOccurrence(occurrence.starts_at, occurrence.ends_at)}
                    </p>
                  </div>
                  <span className="flex items-center gap-1 text-sm font-bold text-mid">
                    <Users className="h-3.5 w-3.5" aria-hidden /> {occurrence.booked_count}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
