"use client";

import { useState } from "react";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { Pencil, Plus, Trash2, UserRound } from "lucide-react";
import { ageOn } from "@/lib/age";
import type { Participant } from "@/lib/types";
import type { ParticipantInput } from "@/lib/validation";
import { Button, FormNotice } from "@/components/ui/form";
import { ParticipantForm } from "@/components/account/ParticipantForm";

export function HouseholdManager({
  initialParticipants,
  initialUnsignedIds,
  accountName,
}: {
  initialParticipants: Participant[];
  accountName: string;
  /** Ids with no valid waiver, resolved server-side by checkWaivers(). */
  initialUnsignedIds: string[];
}) {
  const [participants, setParticipants] = useState(initialParticipants);
  // Tracked in state rather than read from the prop so the banner is correct
  // the instant someone is added — this page never reloads on add, and a
  // brand-new participant cannot have a waiver by definition. Waivers are
  // signed on /waiver, a different page, so nothing here can clear an id.
  const [unsignedIds, setUnsignedIds] = useState<string[]>(initialUnsignedIds);
  const [adding, setAdding] = useState(false);
  const [addingSelf, setAddingSelf] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const needWaiver = participants.filter((p) => unsignedIds.includes(p.id));
  // Read off the row rather than by comparing names with the account: both
  // are free text, a household can legitimately repeat a name, and a match
  // would start failing the moment somebody corrects their profile. The row
  // created through "Add myself" carries the fact directly, so adding
  // yourself removes the button on the spot — this list is state, and the
  // page never reloads on add.
  const hasSelf = participants.some((p) => p.is_account_holder);

  async function create(values: ParticipantInput) {
    const res = await fetch("/api/participants", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...values, is_account_holder: addingSelf }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error ?? "Could not add the participant.");
    const created = body.participant as Participant;
    setParticipants((list) => [...list, created]);
    setUnsignedIds((ids) => [...ids, created.id]);
    setAdding(false);
  }

  async function update(id: string, values: ParticipantInput) {
    const res = await fetch(`/api/participants/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error ?? "Could not save the participant.");
    setParticipants((list) =>
      list.map((p) => (p.id === id ? (body.participant as Participant) : p))
    );
    setEditingId(null);
  }

  async function remove(participant: Participant) {
    setError(null);
    if (
      !window.confirm(
        `Remove ${participant.name} from your household? This can't be undone.`
      )
    ) {
      return;
    }
    const res = await fetch(`/api/participants/${participant.id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Could not remove the participant.");
      return;
    }
    setParticipants((list) => list.filter((p) => p.id !== participant.id));
    setUnsignedIds((ids) => ids.filter((id) => id !== participant.id));
  }

  return (
    <div className="space-y-4">
      {error && <FormNotice tone="error">{error}</FormNotice>}

      {/* Persistent until every person is covered. The waiver is a hard gate
          on booking, walk-ins AND subscribing, so leaving it unmentioned
          until one of those refuses is how someone ends up discovering it at
          the door. Named per person, because a household can be half done. */}
      {needWaiver.length > 0 && (
        <FormNotice tone="error">
          <span className="block">
            {needWaiver.map((p) => p.name).join(", ")}{" "}
            {needWaiver.length === 1 ? "needs" : "need"} a signed waiver before
            being booked onto a session or subscribed.
          </span>
          <Link href="/waiver" className="mt-1 inline-flex underline">
            Complete the waiver
          </Link>{" "}
          <span>— once per person, not once per session.</span>
        </FormNotice>
      )}

      {participants.length === 0 && !adding && (
        <p className="rounded-xl bg-blue-pale px-4 py-3 text-sm font-semibold text-blue-dark">
          No one in your household yet — add your first participant to get
          ready for booking.
        </p>
      )}

      <ul className="space-y-3">
        {participants.map((participant) =>
          editingId === participant.id ? (
            <li
              key={participant.id}
              className="rounded-xl border border-line p-4"
            >
              <ParticipantForm
                initial={participant}
                submitLabel="Save changes"
                onSubmit={(values) => update(participant.id, values)}
                onCancel={() => setEditingId(null)}
              />
            </li>
          ) : (
            <li
              key={participant.id}
              className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-line p-4"
            >
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-full bg-blue-pale">
                  <UserRound className="h-4.5 w-4.5 text-blue" aria-hidden />
                </span>
                <div>
                  <p className="font-extrabold text-black">
                    {participant.name}
                    <span className="ml-2 rounded-full bg-blue-soft px-2.5 py-0.5 text-xs font-bold text-blue-dark">
                      age {ageOn(participant.dob)}
                    </span>
                  </p>
                  <p className="mt-0.5 text-sm text-mid">
                    Born {format(parseISO(participant.dob), "d MMMM yyyy")}
                    {participant.emergency_contact_name && (
                      <>
                        {" · "}Emergency: {participant.emergency_contact_name}
                        {participant.emergency_contact_phone &&
                          ` (${participant.emergency_contact_phone})`}
                      </>
                    )}
                  </p>
                  {participant.medical_notes && (
                    <p className="mt-1 text-sm text-muted">
                      Medical: {participant.medical_notes}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setAdding(false);
                    setEditingId(participant.id);
                  }}
                  className="flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-bold text-mid transition-colors hover:bg-blue-pale hover:text-blue"
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden /> Edit
                </button>
                <button
                  type="button"
                  onClick={() => remove(participant)}
                  className="flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-bold text-mid transition-colors hover:bg-red-soft hover:text-red-dark"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden /> Remove
                </button>
              </div>
            </li>
          )
        )}
      </ul>

      {adding ? (
        <div className="rounded-xl border border-line p-4">
          <ParticipantForm
            submitLabel={addingSelf ? "Add myself as a skater" : "Add skater"}
            defaultName={addingSelf ? accountName : undefined}
            participantKind={addingSelf ? "self" : "other"}
            onSubmit={create}
            onCancel={() => setAdding(false)}
          />
        </div>
      ) : (
        <div className="flex flex-wrap gap-3">
          {!hasSelf && (
            <Button
              type="button"
              onClick={() => {
                setEditingId(null);
                setAddingSelf(true);
                setAdding(true);
              }}
              className="flex items-center gap-1.5"
            >
              <Plus className="h-4 w-4" aria-hidden /> Add myself as a skater
            </Button>
          )}
          {/* Promoted to primary once the self button is gone, so the screen
              always offers one obvious action rather than a lone secondary. */}
          <Button
            type="button"
            variant={hasSelf ? "primary" : "secondary"}
            onClick={() => {
              setEditingId(null);
              setAddingSelf(false);
              setAdding(true);
            }}
            className="flex items-center gap-1.5"
          >
            <Plus className="h-4 w-4" aria-hidden /> Add a child or someone else
          </Button>
        </div>
      )}
    </div>
  );
}
