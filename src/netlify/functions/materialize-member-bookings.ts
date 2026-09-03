// Daily member-booking reconciliation â€” Phase 2 Step 4 safety net.
//
// The Stripe webhook already reconciles a participant's Â£0 booking rows the
// moment their own membership changes (see app/api/webhooks/stripe/route.ts).
// This catches the case that reacting to membership changes alone cannot:
// an occurrence added to a slot AFTER someone already subscribed to it. Every
// active subscriber is re-synced from scratch daily, so a missed webhook or a
// newly seeded catalogue self-heals within 24h without anyone noticing.
//
// âš ï¸ BUILDS ITS OWN SUPABASE CLIENT â€” do NOT import lib/supabase/service.ts
// here. That module carries `import "server-only"`, whose exports map sends
// any bundle without the react-server condition (i.e. this one) to a file
// that is nothing but a `throw`. Importing it would kill this function on
// its first line, every night, in a log nobody reads â€” while the Netlify
// deploy still reported the function as deployed successfully. The shared
// logic in lib/materialize-member-bookings.ts therefore takes the client as
// a parameter and carries no guard of its own.
//
// Direct call, not an HTTP hand-off to a background function (contrast
// PecuvateDashboard's nightly-inventory, which fires a background function
// because ITS work â€” 8 site audits, external credential probes â€” can exceed
// the 30s scheduled ceiling). This job is a handful of Supabase round-trips
// per subscriber against a small subscriber base; if that stops being true,
// split it the same way.
import type { Config } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
import { reconcileAllMemberBookings } from "@/lib/materialize-member-bookings";
import { reconcileBrevo } from "@/lib/reconcile-brevo";

export default async function handler(): Promise<Response> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    // Loud and specific: a missing key here is a silent no-op otherwise, and
    // this job has no user watching it.
    console.error(
      "[materialize-member-bookings] missing Supabase env",
      JSON.stringify({ url: Boolean(url), serviceKey: Boolean(serviceKey) })
    );
    return new Response(null, { status: 500 });
  }

  const service = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const results = await reconcileAllMemberBookings(service);
    const brevo = await reconcileBrevo(service, { removeStale: true });
    const created = results.reduce((sum, r) => sum + r.created, 0);
    const cancelled = results.reduce((sum, r) => sum + r.cancelled, 0);
    console.log(
      "[materialize-member-bookings]",
      JSON.stringify({ participants: results.length, created, cancelled, brevo })
    );
    return new Response(null, { status: 200 });
  } catch (error) {
    console.error("[materialize-member-bookings] failed", error);
    return new Response(null, { status: 500 });
  }
}

export const config: Config = {
  // 03:15 UTC â€” after PecuvateDashboard's 03:00 nightly-inventory and any
  // evening deploy has settled, before the working day.
  schedule: "15 3 * * *",
};

