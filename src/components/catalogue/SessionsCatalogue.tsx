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
import type { CatalogueListingOffering } from "@/lib/catalogue";
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
  offerings: CatalogueListingOffering[];
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

  // Two different questions, deliberately not one flag.
  //
  // `ageActive` gates the Clear button, which belongs to the age field and
  // nothing else: the type chips already carry their own reset in the "All"
  // chip, so having Clear light up on a chip tap gave the type filter a
  // second, redundant reset — and one that would also have silently
  // discarded a typed age. Clear now appears only when there is an age to
  // clear, and clears only that.
  //
  // `filtersActive` still asks the broader question, because the empty
  // state has to distinguish "your filters excluded everything" from
  // "there is genuinely nothing on".
  const ageActive = ageInput !== "";
  const filtersActive = type !== undefined || ageActive;

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
          {/* Always in the DOM, hidden rather than removed when there is
              nothing to clear. Mounting it on the first use changed the
              width of this group, which on a narrow viewport re-wrapped the
              whole filter row and pushed the grid down. `invisible` keeps
              the space reserved; disabled + aria-hidden + tabIndex -1 keep
              it out of the tab order and off the accessibility tree while it
              is inert. */}
          <button
            type="button"
            onClick={() => changeAge("")}
            disabled={!ageActive}
            aria-hidden={!ageActive}
            aria-label="Clear age filter"
            tabIndex={ageActive ? undefined : -1}
            className={`rounded-full px-3 py-2.5 text-sm font-bold text-mid transition-colors hover:text-blue ${
              ageActive ? "" : "invisible"
            }`}
          >
            Clear
          </button>
        </div>
      </div>

      {/* Announce result changes: filtering no longer reloads the page, so
          a screen reader would otherwise get no signal that the list moved. */}
      <p aria-live="polite" className="sr-only">
        {visible.length} session{visible.length === 1 ? "" : "s"} shown
      </p>

      {/* Both branches below start at mt-8. The empty state used mt-10, so
          filtering down to no results nudged the page by an extra 8px on top
          of swapping the content. */}
      {visible.length === 0 ? (
        <p className="mt-8 rounded-2xl bg-card p-8 text-center font-semibold text-mid shadow-sm">
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
