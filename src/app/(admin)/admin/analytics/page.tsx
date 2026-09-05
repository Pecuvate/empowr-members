import type { Metadata } from "next";
import { AlertTriangle, TrendingUp, Users } from "lucide-react";
import { getMemberStats, getSignupsByWeek } from "@/lib/admin-analytics";
import { formatPrice } from "@/lib/format";

export const metadata: Metadata = { title: "Analytics — Members Admin" };
export const dynamic = "force-dynamic";

/** "31 Aug" — the week label under each bar. */
function weekLabel(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

function StatCard({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <div className="rounded-2xl bg-card p-5 shadow-sm">
      <p className="text-sm font-bold uppercase tracking-wide text-muted">
        {label}
      </p>
      <p className="mt-1 text-3xl font-black text-black">{value}</p>
      {note && <p className="mt-1 text-sm text-mid">{note}</p>}
    </div>
  );
}

function FunnelRow({
  label,
  value,
  total,
  note,
}: {
  label: string;
  value: number;
  total: number;
  note: string;
}) {
  // Guard the divide rather than the render: a brand-new platform with no
  // accounts at all would otherwise show NaN% on its very first load.
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-bold text-black">{label}</span>
        <span className="text-sm font-semibold text-mid">
          <span className="text-lg font-black text-black">{value}</span>{" "}
          {total > 0 && <span className="text-muted">({pct}%)</span>}
        </span>
      </div>
      <div
        className="h-2.5 w-full overflow-hidden rounded-full bg-blue-pale"
        role="img"
        aria-label={`${label}: ${value} of ${total} (${pct}%)`}
      >
        <div className="h-full rounded-full bg-blue" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-sm text-mid">{note}</p>
    </div>
  );
}

export default async function AnalyticsPage() {
  const [stats, weeks] = await Promise.all([
    getMemberStats(),
    getSignupsByWeek(12),
  ]);

  if (!stats) {
    return (
      <main className="mx-auto max-w-4xl space-y-6 px-4 py-10 sm:px-6">
        <h1 className="text-3xl font-black tracking-tight text-black">
          Analytics
        </h1>
        {/* Deliberately not zeroes. "0 members" would be a false statement
            about the business, not a cautious one. */}
        <div className="rounded-2xl bg-red-soft p-5">
          <p className="font-extrabold text-red-dark">
            Could not load the figures
          </p>
          <p className="mt-1 text-sm text-mid">
            The database read failed, so nothing is shown rather than a number
            that might be wrong. Try again, and check the function logs if it
            keeps happening.
          </p>
        </div>
      </main>
    );
  }

  const peak = Math.max(1, ...weeks.map((w) => w.signups));

  return (
    <main className="mx-auto max-w-4xl space-y-8 px-4 py-10 sm:px-6">
      <div>
        <h1 className="text-3xl font-black tracking-tight text-black">
          Analytics
        </h1>
        <p className="mt-1 text-mid">
          Who has signed up, and how far they get.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Members"
          value={String(stats.membersTotal)}
          note={
            stats.internalAccounts > 0
              ? `${stats.accountsTotal} accounts, less ${stats.internalAccounts} Empowr`
              : undefined
          }
        />
        <StatCard label="New this week" value={String(stats.newThisWeek)} />
        <StatCard label="New this month" value={String(stats.newThisMonth)} />
        <StatCard
          label="Gross to date"
          value={formatPrice(stats.grossPaidPence)}
          note="All paid bookings"
        />
      </div>

      <section className="rounded-2xl bg-card p-5 shadow-sm sm:p-6">
        <h2 className="flex items-center gap-2 text-xl font-extrabold text-black">
          <Users className="h-5 w-5 text-blue" aria-hidden /> How far people get
        </h2>
        <p className="mt-1 text-sm text-mid">
          Each step as a share of the {stats.membersTotal} members who signed
          up. Empowr&apos;s own accounts are left out of all three.
        </p>
        <div className="mt-5 space-y-5">
          <FunnelRow
            label="Signed up"
            value={stats.membersTotal}
            total={stats.membersTotal}
            note="Created an account"
          />
          <FunnelRow
            label="Added a skater"
            value={stats.membersWithParticipant}
            total={stats.membersTotal}
            note="Nobody can book until they add the people who skate"
          />
          <FunnelRow
            label="Booked and paid"
            value={stats.membersWithPaidBooking}
            total={stats.membersTotal}
            note="At least one booking that took real money"
          />
        </div>
      </section>

      <section className="rounded-2xl bg-card p-5 shadow-sm sm:p-6">
        <h2 className="flex items-center gap-2 text-xl font-extrabold text-black">
          <TrendingUp className="h-5 w-5 text-blue" aria-hidden /> Signups by
          week
        </h2>
        <p className="mt-1 text-sm text-mid">
          Last {weeks.length} weeks. A week with nobody joining shows as an
          empty column, not a gap.
        </p>
        {weeks.length === 0 ? (
          <p className="mt-4 rounded-xl bg-blue-pale px-4 py-3 text-sm font-semibold text-blue-dark">
            The weekly trend could not be loaded.
          </p>
        ) : (
          <div className="mt-5 flex items-end justify-between gap-1 sm:gap-2">
            {weeks.map((week) => (
              <div
                key={week.weekStart}
                className="flex flex-1 flex-col items-center gap-1"
              >
                <span className="text-xs font-bold text-black">
                  {week.signups > 0 ? week.signups : ""}
                </span>
                <div
                  className="w-full rounded-t bg-blue"
                  style={{
                    // Floor of 2px so a zero week is still a visible baseline
                    // rather than nothing at all.
                    height: `${Math.max(2, (week.signups / peak) * 96)}px`,
                  }}
                  role="img"
                  aria-label={`Week of ${weekLabel(week.weekStart)}: ${
                    week.signups
                  } signups`}
                />
                <span className="text-[10px] font-semibold text-muted sm:text-xs">
                  {weekLabel(week.weekStart)}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl bg-card p-5 shadow-sm sm:p-6">
        <h2 className="text-xl font-extrabold text-black">Subscriptions</h2>
        <p className="mt-1 text-3xl font-black text-black">
          {stats.activeMemberships}
        </p>
        {stats.activeMemberships === 0 && (
          // Not decoration. Every subscription-dependent path in the platform
          // — the webhook's membership write, Step 4 materialisation, the
          // staff alert, the register's live read, the self-clear on cancel —
          // is unexercised until this number moves off zero, and until now
          // that fact was only visible to someone who ran a query.
          <p className="mt-2 flex items-start gap-2 rounded-xl bg-red-soft px-4 py-3 text-sm font-semibold text-red-dark">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>
              Subscriptions are on sale but nobody has taken one, so nothing
              that depends on a membership has ever run in production.
            </span>
          </p>
        )}
      </section>

      <p className="text-sm text-mid">
        &ldquo;Members&rdquo; excludes accounts on Empowr and Pecuvate email
        domains, because a login is created for staff too. The excluded count
        is shown above so the adjustment stays checkable — a staff member who
        genuinely skates is left out by that rule.
      </p>
    </main>
  );
}
