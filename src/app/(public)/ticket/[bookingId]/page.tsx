// Public ticket page — the in-house replacement for a PassKit wallet
// pass install link. Deliberately unauthenticated (see plan notes): the
// booking id is a high-entropy UUID, the same trust level this app
// already gives Stripe's checkout_session_id on /book/confirmation, and
// getTicket() only ever selects ticket-safe fields. Always reads live
// status — a cancelled booking just renders a cancelled state, so there
// is no separate "void" step to build (unlike PassKit's voidPass()).
import { notFound } from "next/navigation";
import { Clock3, XCircle } from "lucide-react";
import { getTicket } from "@/lib/ticket";
import { qrDataUrl as renderQr } from "@/lib/qr";
import { membersUrl } from "@/lib/links";
import { TicketCard } from "@/components/ticket/TicketCard";
import { AutoRefresh } from "@/components/booking/AutoRefresh";

export const dynamic = "force-dynamic";

export default async function TicketPage({
  params,
}: {
  params: Promise<{ bookingId: string }>;
}) {
  const { bookingId } = await params;
  const ticket = await getTicket(bookingId);
  if (!ticket) notFound();

  if (ticket.status === "pending_payment") {
    return (
      <>
        <AutoRefresh active />
        <StatusPanel
          icon={<Clock3 className="mx-auto h-10 w-10 text-blue" aria-hidden />}
          title="Confirming your booking…"
          body="Payment received, just confirming your space. This page updates automatically."
        />
      </>
    );
  }

  if (ticket.status !== "confirmed" && ticket.status !== "attended") {
    return (
      <StatusPanel
        icon={<XCircle className="mx-auto h-10 w-10 text-blue" aria-hidden />}
        title="This booking is no longer valid"
        body="This booking is no longer active. If that's unexpected, email enquiries@empowrcic.org."
      />
    );
  }

  const checkinUrl = membersUrl(`/checkin/${ticket.id}`);
  const qrDataUrl = await renderQr(checkinUrl);

  return (
    <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <TicketCard ticket={ticket} qrDataUrl={qrDataUrl} />
    </main>
  );
}

function StatusPanel({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <div className="rounded-2xl bg-blue-pale p-6 text-center">
        {icon}
        <h1 className="mt-3 text-xl font-extrabold text-blue-dark">{title}</h1>
        <p className="mx-auto mt-2 max-w-md text-sm font-semibold text-blue-dark">
          {body}
        </p>
      </div>
    </main>
  );
}
