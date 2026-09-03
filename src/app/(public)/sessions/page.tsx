import type { Metadata } from "next";
import { listOfferingsWithVenues } from "@/lib/catalogue";
import { SessionsCatalogue } from "@/components/catalogue/SessionsCatalogue";

export const metadata: Metadata = {
  title: "Sessions — Empowr Members",
  description:
    "Browse and book Empowr CIC skating sessions — drop-ins, lessons, courses, camps and events.",
};

// Static, and revalidated the same way as /sessions/[slug]. This route
// used to read searchParams for the type/age filters, which forced a
// per-request render and made it uncacheable no matter what the data
// layer did — session 3 measured that as its hard floor at 274ms.
// Filtering moved into SessionsCatalogue on the client, so the page
// itself now has no per-request input and serves from the CDN.
//
// Admin writes drop this immediately via revalidateCatalogue(); the
// window below is only the backstop.
export const revalidate = 300;

export default async function SessionsPage() {
  // The whole active set — the client filters it. Single-digit rows.
  const offerings = await listOfferingsWithVenues({});

  return (
    <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-black tracking-tight text-black">
        Sessions
      </h1>
      <p className="mt-1 max-w-xl text-mid">
        Skating for every age and level — drop in, learn with our coaches, or
        join a course.
      </p>

      {/* No Suspense boundary: SessionsCatalogue is a client component but
          touches no dynamic API during render, so it prerenders with the
          full catalogue in the static HTML. Wrapping it in Suspense with a
          skeleton fallback is what previously shipped the skeleton itself
          as this page's HTML. */}
      <SessionsCatalogue offerings={offerings} />
    </main>
  );
}
