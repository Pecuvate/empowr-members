import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import { getRegister } from "@/lib/admin-data";
import { formatOccurrence, formatPrice } from "@/lib/format";
import { BOOKING_STATUS_LABELS } from "@/lib/booking-status-labels";
import { summariseRegister } from "@/lib/register-summary";
import { MarkAttendedButton } from "@/components/admin/MarkAttendedButton";
import { ReleaseHoldButton } from "@/components/admin/ReleaseHoldButton";
import { WalkInPanel } from "@/components/admin/WalkInPanel";

export const metadata: Metadata = { title: "Register — Door Check-in" };
export const dynamic = "force-dynamic";

export default async function RegisterPage({
  params,
}: {
  params: Promise<{ occurrenceId: string }>;
}) {
  const { occurrenceId } = await params;
  const register = await getRegister(occurrenceId);
  if (!register) notFound();

  const active = register.bookings.filter(
    (b) => b.status === "confirmed" || b.status === "attended"
  );
  // Holds count against capacity for ~41 minutes (30-minute hold + Stripe's
  // 31-minute session + 10 minutes of grace), so a register that reported
  // only confirmed places would show free space that is actually taken.
  const pending = register.bookings.filter(
    (b) => b.status === "pending_payment"
  );

  // Arithmetic lives in lib/register-summary.ts so the over-capacity branch
  // can be tested — there are no bookings on any occurrence yet, so it cannot
  // be tripped by real data.
  const { expected, systemCount, capacity, overCapacity, stillSellable } =
    summariseRegister({
      confirmed: register.bookings.filter((b) => b.status === "confirmed").length,
      attended: register.bookings.filter((b) => b.status === "attended").length,
      pending: pending.length,
      subscribers: register.subscribers.length,
      capacity: register.capacity,
    });

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-10 sm:px-6">
      <Link
        href="/checkin"
        className="flex w-fit items-center gap-1.5 text-sm font-bold text-mid transition-colors hover:text-blue"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden /> Check in
      </Link>

      <div>
        <h1 className="text-3xl font-black tracking-tight text-black">
          {register.offering?.title ?? "Register"}
        </h1>
        <p className="mt-1 text-mid">
          {formatOccurrence(register.starts_at, register.ends_at)}
          {capacity !== null && (
            <>
              {" · "}
              <span className={overCapacity ? "font-extrabold text-red-dark" : "font-bold"}>
                {expected} of {capacity} places
              </span>
            </>
          )}
        </p>
        <p className="mt-0.5 text-sm text-mid">
          {active.length} booked
          {register.subscribers.length > 0 &&
            ` · ${register.subscribers.length} subscribed`}
          {pending.length > 0 && ` · ${pending.length} awaiting payment`}
        </p>
      </div>

      {/* Only when it actually matters. A capacity line that is always
          present but usually fine trains staff to stop reading it. */}
      {overCapacity && (
        <section className="rounded-2xl border border-red bg-red-soft p-5 sm:p-6">
          <h2 className="flex items-center gap-2 text-lg font-extrabold text-red-dark">
            <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden />
            Over capacity
          </h2>
          <p className="mt-2 text-sm font-semibold text-mid">
            {expected} people are entitled to attend a {capacity}-place session.
            Subscribers hold no booking, so the booking system has counted only{" "}
            {systemCount}
            {stillSellable !== null && stillSellable > 0 ? (
              <>
                {" "}
                and will sell {stillSellable} more place
                {stillSellable === 1 ? "" : "s"}.
              </>
            ) : (
              "."
            )}
          </p>
        </section>
      )}

      {register.bookings.length === 0 ? (
        <p className="rounded-xl bg-blue-pale px-4 py-3 text-sm font-semibold text-blue-dark">
          No bookings on this date yet.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-line">
          <table className="w-full text-left text-sm">
            <thead className="bg-blue-pale/50 text-xs font-bold uppercase tracking-wide text-mid">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Paid</th>
                <th className="px-4 py-3">Notes</th>
                <th className="px-4 py-3">Check in</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {register.bookings.map((booking) => (
                <tr key={booking.id}>
                  <td className="px-4 py-3 font-bold text-black">
                    {booking.participant?.name ?? "—"}
                  </td>
                  <td className="px-4 py-3 font-semibold text-mid">
                    {BOOKING_STATUS_LABELS[booking.status] ?? booking.status}
                  </td>
                  <td className="px-4 py-3 font-semibold text-mid">
                    {booking.source === "member" ? (
                      <span className="rounded-full bg-blue-pale px-2 py-0.5 text-xs font-bold text-blue-dark">
                        Subscribed
                      </span>
                    ) : (
                      <>
                        {booking.price_paid_pence !== null
                          ? formatPrice(booking.price_paid_pence)
                          : "—"}
                        {booking.source === "walk_in" && (
                          <span className="ml-1.5 rounded-full bg-blue-pale px-2 py-0.5 text-xs font-bold text-blue-dark">
                            Door
                          </span>
                        )}
                      </>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {booking.participant?.medical_notes ? (
                      <span className="flex items-center gap-1 font-semibold text-red-dark">
                        <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                        {booking.participant.medical_notes}
                      </span>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {!booking.waiverSigned ? (
                      <span className="rounded-full bg-red-soft px-3 py-1 text-xs font-extrabold text-red-dark">
                        No waiver — do not let them take part
                      </span>
                    ) : booking.status === "confirmed" ||
                      booking.status === "attended" ? (
                      <MarkAttendedButton
                        bookingId={booking.id}
                        alreadyAttended={booking.status === "attended"}
                      />
                    ) : booking.status === "pending_payment" ? (
                      <ReleaseHoldButton bookingId={booking.id} />
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {register.subscribers.length > 0 && (
        <section className="rounded-2xl border border-line bg-card p-5 shadow-sm sm:p-6">
          <h2 className="text-lg font-extrabold text-black">Recently subscribed</h2>
          {/* Since Phase 2 Step 4, a subscriber normally appears in the main
              table above like anyone else — the webhook adds them the moment
              they subscribe. This section is now the gap between that and a
              daily catch-up sweep (a brand-new occurrence, or a webhook that
              failed), so it should read as transient, not as the everyday
              case it used to be — there is still no check-in button here,
              because these skaters hold no booking row yet. */}
          <p className="mt-1 text-sm text-mid">
            These skaters hold a subscription covering this session but
            haven&apos;t been added to the list above yet — that happens
            automatically, usually within a day. Their place is reserved.
            There is no check-in button for them yet — tick them off as they
            arrive.{" "}
            <Link
              href="/checkin/guide"
              className="font-bold text-blue underline"
            >
              How check-in works
            </Link>
            .
          </p>
          <ul className="mt-4 divide-y divide-line">
            {register.subscribers.map((sub) => (
              <li
                key={sub.participantId}
                className="flex flex-wrap items-center justify-between gap-2 py-3"
              >
                <div>
                  <p className="font-extrabold text-black">{sub.name}</p>
                  <p className="text-sm text-mid">{sub.planName}</p>
                  {sub.medicalNotes && (
                    <p className="mt-1 flex items-start gap-1.5 text-sm font-semibold text-red-dark">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                      {sub.medicalNotes}
                    </p>
                  )}
                </div>
                {sub.waiverSigned ? (
                  <span className="rounded-full bg-blue-pale px-3 py-1 text-xs font-extrabold text-blue-dark">
                    Waiver signed
                  </span>
                ) : (
                  <span className="rounded-full bg-red-soft px-3 py-1 text-xs font-extrabold text-red-dark">
                    No waiver — do not let them take part
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <WalkInPanel
        occurrenceId={register.id}
        offeringTitle={register.offering?.title ?? "this session"}
        walkInPricePence={register.offering?.walk_in_price_pence ?? null}
        sessionOver={new Date(register.ends_at) <= new Date()}
      />
    </main>
  );
}
