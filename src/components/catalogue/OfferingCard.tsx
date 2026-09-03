import Link from "next/link";
import { MapPin } from "lucide-react";
// Value imports come from lib/offering-types, never lib/catalogue: that
// module carries `import "server-only"`, and this card is rendered by
// the client-side filter UI on /sessions. A type-only import is erased
// at compile time and stays safe.
import type { CatalogueListingOffering } from "@/lib/catalogue";
import { TYPE_LABELS_SINGULAR } from "@/lib/offering-types";
import { formatAgeRange, formatPrice } from "@/lib/format";

export function OfferingCard({ offering }: { offering: CatalogueListingOffering }) {
  return (
    <Link
      href={`/sessions/${offering.slug}`}
      className="group flex flex-col rounded-2xl bg-card p-6 shadow-sm transition-shadow duration-200 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="rounded-full bg-blue-pale px-3 py-1 text-xs font-bold text-blue-dark">
          {TYPE_LABELS_SINGULAR[offering.type]}
        </span>
        <span className="rounded-full bg-red-soft px-3 py-1 text-xs font-bold text-red-dark">
          {formatAgeRange(offering.age_min, offering.age_max)}
        </span>
      </div>
      <h2 className="mt-3 text-xl font-extrabold text-black transition-colors group-hover:text-blue">
        {offering.title}
      </h2>
      {offering.description && (
        <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-mid">
          {offering.description}
        </p>
      )}
      <div className="mt-auto flex items-center justify-between gap-3 pt-4">
        {offering.venues.length > 0 ? (
          <span className="flex min-w-0 items-start gap-1 text-sm font-semibold text-muted">
            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>{offering.venues.map((venue) => venue.name).join(" & ")}</span>
          </span>
        ) : (
          <span className="text-sm font-semibold text-muted">
            Venue varies
          </span>
        )}
        <span className="font-black text-blue">
          {formatPrice(offering.price_pence)}
          {offering.enrolment_scope === "per_run" && (
            <span className="text-sm font-bold text-mid"> / course</span>
          )}
        </span>
      </div>
    </Link>
  );
}
