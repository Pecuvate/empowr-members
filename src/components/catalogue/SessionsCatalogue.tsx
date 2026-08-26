"use client";

// Client-side catalogue filtering.
//
// Filtering used to be server-side off searchParams, which meant every
// chip tap was a full server navigation with no visual feedback — the
// route reads searchParams, so it could never be prefetched or cached
// and the UI sat completely still for the round trip. The active set is
// single-digit rows, so filtering it in the browser is instant and lets
// /sessions render as a static page.
//
// The URL is still the shareable source of truth, updated through the
// native History API rather than router.push so it does NOT trigger a
// navigation — Next keeps usePathname/useSearchParams in sync with
// history.replaceState.

import { useEffect, useMemo, useState } from "react";
import type { CatalogueOffering } from "@/lib/catalogue";
import {
  OFFERING_TYPES,
  TYPE_LABELS,
  type OfferingType,
} from "@/lib/offering-types";
import { filterOfferings, parseAge } from "@/lib/catalogue-filters";
import { OfferingCard } from "@/components/catalogue/OfferingCard";

function isOfferingType(value: string | null): value is OfferingType {
  return value !== null && (OFFERING_TYPES as readonly string[]).includes(value);
}

function buildUrl(type: OfferingType | undefined, age: string) {
  const params = new URLSearchParams();
  if (type) params.set("type", type);
  if (age) params.set("age", age);
  const qs = params.toString();
  return qs ? `/sessions?${qs}` : "/sessions";
}

export function SessionsCatalogue({
  offerings,
}: {
  offerings: CatalogueOffering[];
}) {
  // Deliberately NOT useSearchParams(): calling it during render is a
  // dynamic API, so Next skips prerendering this subtree and emits the
  // Suspense fallback as the page's static HTML. That shipped once — the
  // public catalogue's HTML was a loading skeleton, with the offerings
  // present only in the RSC payload, so a cold load flashed a skeleton
  // and crawlers saw no sessions at all.
  //
  // Starting from the unfiltered state means the full catalogue
  // prerenders, and the URL is read after mount instead. The only cost
  // is that a deep link like ?type=lesson paints the whole list for one
  // frame before narrowing it.
  const [type, setType] = useState<OfferingType | undefined>(undefined);
  const [ageInput, setAgeInput] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const rawType = params.get("type");
    if (isOfferingType(rawType)) setType(rawType);
    const rawAge = params.get("age");
    if (rawAge) setAgeInput(rawAge);
  }, []);

  const age = parseAge(ageInput);

  const visible = useMemo(
    () => filterOfferings(offerings, { type, age }),
    [offerings, type, age]
  );

  function syncUrl(nextType: OfferingType | undefined, nextAge: string) {
    window.history.replaceState(null, "", buildUrl(nextType, nextAge));
  }

  function chooseType(next: OfferingType | undefined) {
    setType(next);
    syncUrl(next, ageInput);
  }

  function changeAge(next: string) {
    setAgeInput(next);
    syncUrl(type, next);
  }

  const filtersActive = type !== undefined || ageInput !== "";

  return (
    <>
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <FilterChip
          label="All"
          active={!type}
          onClick={() => chooseType(undefined)}
        />
        {OFFERING_TYPES.map((value) => (
          <FilterChip
            key={value}
            label={TYPE_LABELS[value]}
            active={type === value}
            onClick={() => chooseType(value)}
          />
        ))}

        <div className="flex w-full items-center gap-2 sm:ml-auto sm:w-auto">
          <label htmlFor="age-filter" className="text-sm font-bold text-mid">
            Age
          </label>
          <input
            id="age-filter"
            name="age"
            type="number"
            inputMode="numeric"
            min={0}
            max={120}
            value={ageInput}
            onChange={(event) => changeAge(event.target.value)}
            placeholder="any"
            className="w-20 rounded-full border border-line bg-card px-3 py-2.5 text-sm font-semibold text-black focus:border-blue focus:outline-none focus:ring-2 focus:ring-blue-soft"
          />
          {filtersActive && (
            <button
              type="button"
              onClick={() => {
                setType(undefined);
                setAgeInput("");
                syncUrl(undefined, "");
              }}
              className="rounded-full px-3 py-2.5 text-sm font-bold text-mid transition-colors hover:text-blue"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Announce result changes: filtering no longer reloads the page, so
          a screen reader would otherwise get no signal that the list moved. */}
      <p aria-live="polite" className="sr-only">
        {visible.length} session{visible.length === 1 ? "" : "s"} shown
      </p>

      {visible.length === 0 ? (
        <p className="mt-10 rounded-2xl bg-card p-8 text-center font-semibold text-mid shadow-sm">
          {filtersActive
            ? "No sessions match those filters — try widening them."
            : "Our session timetable is being finalised — check back soon."}
        </p>
      ) : (
        <div className="mt-8 grid gap-5 sm:grid-cols-2">
          {visible.map((offering) => (
            <OfferingCard key={offering.id} offering={offering} />
          ))}
        </div>
      )}
    </>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full px-4 py-2.5 text-sm font-bold transition-colors ${
        active ? "bg-blue text-white" : "bg-card text-mid hover:text-blue"
      }`}
    >
      {label}
    </button>
  );
}
