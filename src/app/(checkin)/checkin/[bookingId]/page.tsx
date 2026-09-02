// Staff check-in lookup — reached by scanning a ticket's QR code (see
// src/app/(public)/ticket/[bookingId]/page.tsx). A read-only lookup, not
// an auto-mark: a GET must never mutate attendance (bots, link previews,
// back-button reloads), and staff need the visual-confirm step anyway
// for safeguarding. Inherits the standalone check-in layout's session and CHECKIN_EMAILS gate.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AlertTriangle, User } from "lucide-react";
import { getBookingForCheckin } from "@/lib/admin-data";
import { BOOKING_STATUS_LABELS } from "@/lib/booking-status-labels";
import { MarkAttendedButton } from "@/components/admin/MarkAttendedButton";

export const metadata: Metadata = { title: "Check in — Door Check-in" };
export const dynamic = "force-dynamic";

export default async function CheckinPage({
  params,
}: {
  params: Promise<{ bookingId: string }>;
}) {
  const { bookingId } = await params;
  const booking = await getBookingForCheckin(bookingId);
  if (!booking) notFound();

  return (
    <main className="mx-auto max-w-md px-4 py-10 sm:px-6">
      <div className="rounded-2xl bg-card p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-pale">
            <User className="h-5 w-5 text-blue" aria-hidden />
          </span>
          <div>
            <p className="text-lg font-extrabold text-black">
              {booking.participantName}
            </p>
            <p className="text-sm font-semibold text-mid">
              {booking.offeringTitle} · {booking.when}
            </p>
          </div>
        </div>

        {booking.medicalNotes && (
          <p className="mt-4 flex items-start gap-1.5 rounded-lg bg-red-soft px-3 py-2.5 text-sm font-semibold text-red-dark">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden />
            {booking.medicalNotes}
          </p>
        )}

        <p className="mt-4 text-sm font-bold text-mid">
          Status: {BOOKING_STATUS_LABELS[booking.status]}
        </p>

        <div className="mt-5 border-t border-line pt-5">
          {booking.isCourseRun ? (
            <p className="text-sm font-semibold text-muted">
              This is a multi-week course booking — attendance for
              individual weeks isn&apos;t tracked here. Check them off on
              the register for the specific date instead.
            </p>
          ) : booking.status === "confirmed" || booking.status === "attended" ? (
            <MarkAttendedButton
              bookingId={booking.id}
              alreadyAttended={booking.status === "attended"}
            />
          ) : (
            <p className="text-sm font-semibold text-muted">
              This booking isn&apos;t confirmed ({BOOKING_STATUS_LABELS[booking.status].toLowerCase()}) — nothing to check in.
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
