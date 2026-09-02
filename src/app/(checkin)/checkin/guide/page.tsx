import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, AlertTriangle, QrCode, UserCheck } from "lucide-react";

export const metadata: Metadata = {
  title: "Checking people in — Door Check-in",
};

/**
 * How check-in works while subscribers hold no booking row.
 *
 * Written for the door, not for developers: short lines, the safeguarding
 * rules first, and the "if this happens" cases someone can actually hit on a
 * Thursday night. It describes the app AS IT IS — including the fact that a
 * subscriber cannot be checked in — rather than as Phase 2 Step 4 will make
 * it. When Step 4 lands and subscribers get real booking rows, rewrite this
 * page in the same commit.
 */
export default function CheckInGuidePage() {
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
          Checking people in
        </h1>
        <p className="mt-1 text-mid">
          Two kinds of skater turn up. They are handled differently.
        </p>
      </div>

      <section className="rounded-2xl border border-red bg-red-soft p-5 sm:p-6">
        <h2 className="flex items-center gap-2 text-lg font-extrabold text-red-dark">
          <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden />
          Before anyone skates
        </h2>
        <p className="mt-2 text-sm font-semibold text-mid">
          Check the waiver. If the register shows{" "}
          <strong className="text-red-dark">
            &ldquo;No waiver &mdash; do not let them take part&rdquo;
          </strong>
          , that is exactly what it means. No exceptions on the night.
        </p>
        <p className="mt-2 text-sm font-semibold text-mid">
          For a subscriber that badge is the <strong>only</strong> place an
          unsigned waiver ever shows, because they never go through booking.
          Medical notes appear under the name for everyone.
        </p>
      </section>

      <section className="rounded-2xl bg-card p-5 shadow-sm sm:p-6">
        <h2 className="flex items-center gap-2 text-lg font-extrabold text-black">
          <QrCode className="h-5 w-5 shrink-0 text-blue" aria-hidden />
          1. People who booked
        </h2>
        <p className="mt-1 text-sm text-mid">
          Paid online, or paid at the door as a walk-in. They have a ticket
          with a QR code.
        </p>
        <ul className="mt-3 space-y-2 text-sm font-semibold text-mid">
          <li>
            Point your phone camera at their QR code. It opens their check-in
            page directly.
          </li>
          <li>
            Check the name matches the skater, then tap{" "}
            <strong>Check in</strong>.
          </li>
          <li>
            No phone, flat battery, or they never opened the email? Go to{" "}
            <strong>Check in</strong>, pick today&rsquo;s session, and find them
            in the register list. Same button.
          </li>
        </ul>
        <p className="mt-3 rounded-xl bg-blue-pale px-4 py-3 text-sm font-semibold text-blue-dark">
          Their attendance is recorded. Scanning twice is safe: it just tells
          you they are already checked in.
        </p>
      </section>

      <section className="rounded-2xl bg-card p-5 shadow-sm sm:p-6">
        <h2 className="flex items-center gap-2 text-lg font-extrabold text-black">
          <UserCheck className="h-5 w-5 shrink-0 text-blue" aria-hidden />
          2. Subscribers
        </h2>
        <p className="mt-1 text-sm text-mid">
          They pay monthly. They have not booked, they have no QR code, and
          they pay nothing today. Their place is already reserved.
        </p>
        <ul className="mt-3 space-y-2 text-sm font-semibold text-mid">
          <li>
            They are in a separate <strong>Subscribers</strong> list at the
            bottom of the register, underneath the main table.
          </li>
          <li>
            <strong className="text-black">
              There is no Check in button for them.
            </strong>{" "}
            Nothing to tap. Read the list, check the waiver badge, and tick
            them off however you are tracking the night.
          </li>
          <li>
            The app records no attendance for subscribers. That is expected for
            now, not a fault. Do not go hunting for the button.
          </li>
        </ul>
      </section>

      <section className="rounded-2xl bg-card p-5 shadow-sm sm:p-6">
        <h2 className="text-lg font-extrabold text-black">
          When something looks wrong
        </h2>
        <dl className="mt-3 space-y-4 text-sm">
          <div>
            <dt className="font-extrabold text-black">
              They say they subscribe, but they are not on the list
            </dt>
            <dd className="mt-1 font-semibold text-mid">
              Then the subscription is not active right now &mdash; cancelled,
              or a payment failed. The list is read live, so it is current.
              Take them as a <strong>drop-in at the door price</strong> and ask
              them to check their email from Stripe. Do not let them in free.
            </dd>
          </div>
          <div>
            <dt className="font-extrabold text-black">
              They are in the main table <em>and</em> the subscribers list
            </dt>
            <dd className="mt-1 font-semibold text-mid">
              They have paid for a session their subscription already covers.
              Let them skate as normal, then tell the office so it can be
              refunded.
            </dd>
          </div>
          <div>
            <dt className="font-extrabold text-black">
              The register says <em>Over capacity</em>
            </dt>
            <dd className="mt-1 font-semibold text-mid">
              More people are entitled to attend than the room holds.
              Subscribers do not count towards the number the booking system
              uses, so it can keep selling places into a full session. Run the
              session, then tell the office the same day so bookings can be
              stopped.
            </dd>
          </div>
          <div>
            <dt className="font-extrabold text-black">
              Someone on a course wants checking in for one week
            </dt>
            <dd className="mt-1 font-semibold text-mid">
              Not possible. A course is booked as a whole block, so there is no
              single week to mark. Take that register on paper.
            </dd>
          </div>
        </dl>
      </section>

      <section className="rounded-2xl bg-blue-pale p-5 sm:p-6">
        <h2 className="text-base font-extrabold text-blue-dark">
          Why subscribers work this way
        </h2>
        <p className="mt-2 text-sm font-semibold text-blue-dark">
          A subscription reserves a place without making a booking, so there is
          no booking for the app to mark as attended. Listing subscribers on
          the register at all is what makes running sessions possible in the
          meantime &mdash; and because that list is read live, cancelling a
          subscription removes someone straight away, with nobody having to
          remember.
        </p>
        <p className="mt-2 text-sm font-semibold text-blue-dark">
          A later release gives subscribers real bookings, and then they check
          in exactly like everyone else. This page changes when that lands.
        </p>
      </section>
    </main>
  );
}
