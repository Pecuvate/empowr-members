// Waiver gate. Primary check is mem_waiver_consents (Members-owned,
// decoupled from Waivers' own retention policy and form-version bumps —
// see the 2026-08-17 migration notes). A participant with no live consent
// row falls back to matching the Empowr Waivers tables directly (people /
// waiver_responses / form_versions — service-role only, no RLS policies):
// the account email matches the signer's `people` row; a participant is
// covered when a response on the ACTIVE form version lists their
// normalised name in skater_names (or it's the signer booking themselves).
// This fallback is what recognises someone who signed on the standalone
// waiver.empowrcic.org app before ever having a consent row here. A
// fallback match returns enough to backfill a consent row (see
// recordWaiverConsent below) so the next check takes the fast primary path.
//
// submitWaiver() below is the write path (Phase 1) — the same
// people/waiver_responses tables the standalone app at waiver.empowrcic.org
// writes to. That app stays the public route for anyone without an account
// here; this is the in-app equivalent for members.
//
// Corrected 2026-08-28: this used to say the standalone app was "the route
// for walk-ins, who are not members". Membership is a condition of
// attending, so a walk-in is a MEMBER who forgot to book — and
// POST /api/admin/walk-ins runs checkWaivers() below as its gate, exactly
// as the member booking route does.
import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { ageOn } from "@/lib/age";
import type { Participant } from "@/lib/types";

export type WaiverStatus = {
  participantId: string;
  signed: boolean;
  /** people.id to persist onto mem_participants when newly matched via the
   *  fallback path. Null when already linked or not signed. */
  matchedPersonId: string | null;
  /** Set alongside a fallback match: the waiver_responses row that
   *  justified it, so the caller can backfill a mem_waiver_consents row
   *  via recordWaiverConsent(). Null when covered by an existing consent
   *  row already, or not signed. */
  backfillFromResponseId: string | null;
};

function normaliseName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

type SignerRow = { id: string; first_name: string; last_name: string };
type ResponseRow = { id: string; person_id: string; skater_names: string[] | null };

function unsignedStatus(participantId: string): WaiverStatus {
  return { participantId, signed: false, matchedPersonId: null, backfillFromResponseId: null };
}

/** Check every participant against mem_waiver_consents first, then the
 *  active waiver form version as a fallback. */
export async function checkWaivers(
  accountEmail: string,
  participants: Pick<Participant, "id" | "name" | "person_id">[]
): Promise<WaiverStatus[]> {
  const service = createServiceClient();

  const { data: consents, error: consentsError } = await service
    .from("mem_waiver_consents")
    .select("participant_id")
    .in("participant_id", participants.map((p) => p.id))
    .is("revoked_at", null)
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`);
  if (consentsError) {
    console.error("mem_waiver_consents read failed", consentsError);
  }
  const consentedIds = new Set((consents ?? []).map((c) => c.participant_id as string));

  const covered: WaiverStatus[] = participants
    .filter((p) => consentedIds.has(p.id))
    .map((p) => ({
      participantId: p.id,
      signed: true,
      matchedPersonId: null,
      backfillFromResponseId: null,
    }));
  const remaining = participants.filter((p) => !consentedIds.has(p.id));
  if (remaining.length === 0) return covered;

  const { data: activeVersion, error: versionError } = await service
    .from("form_versions")
    .select("id")
    .eq("active", true)
    .limit(1)
    .maybeSingle();
  if (versionError) console.error("waiver form_versions read failed", versionError);
  if (versionError || !activeVersion) {
    // No active form version — nothing can be signed against; fail closed.
    return [...covered, ...remaining.map((p) => unsignedStatus(p.id))];
  }

  // Signers matched by the account holder's email (case-insensitive).
  const { data: signers } = await service
    .from("people")
    .select("id, first_name, last_name")
    .ilike("email", accountEmail);
  const signerRows = (signers ?? []) as SignerRow[];

  const personIds = new Set<string>(signerRows.map((s) => s.id));
  for (const p of remaining) {
    if (p.person_id) personIds.add(p.person_id);
  }
  if (personIds.size === 0) {
    return [...covered, ...remaining.map((p) => unsignedStatus(p.id))];
  }

  const { data: responses } = await service
    .from("waiver_responses")
    .select("id, person_id, skater_names")
    .in("person_id", [...personIds])
    .eq("form_version_id", activeVersion.id);
  const responseRows = (responses ?? []) as ResponseRow[];

  const respondedPersonIds = new Set(responseRows.map((r) => r.person_id));

  const fallback: WaiverStatus[] = remaining.map((p) => {
    // Already linked (previous match or admin manual link) — trust it,
    // just backfill the consent row since it's missing one.
    if (p.person_id && respondedPersonIds.has(p.person_id)) {
      const response = responseRows.find((r) => r.person_id === p.person_id)!;
      return {
        participantId: p.id,
        signed: true,
        matchedPersonId: null,
        backfillFromResponseId: response.id,
      };
    }

    const name = normaliseName(p.name);

    // Signer booking themselves.
    const selfSigner = signerRows.find(
      (s) =>
        respondedPersonIds.has(s.id) &&
        normaliseName(`${s.first_name} ${s.last_name}`) === name
    );
    if (selfSigner) {
      const response = responseRows.find((r) => r.person_id === selfSigner.id)!;
      return {
        participantId: p.id,
        signed: true,
        matchedPersonId: selfSigner.id,
        backfillFromResponseId: response.id,
      };
    }

    // Named skater on one of the signer's active-version responses.
    const covering = responseRows.find(
      (r) =>
        signerRows.some((s) => s.id === r.person_id) &&
        (r.skater_names ?? []).some((n) => normaliseName(n) === name)
    );
    if (covering) {
      return {
        participantId: p.id,
        signed: true,
        matchedPersonId: covering.person_id,
        backfillFromResponseId: covering.id,
      };
    }

    return unsignedStatus(p.id);
  });

  return [...covered, ...fallback];
}

/** Persist a mem_waiver_consents row so future checkWaivers() calls take
 *  the fast primary path instead of re-running the fallback match. Never
 *  throws — a failed backfill just means the fallback runs again next
 *  time, not lost cover. The partial unique index on (participant_id)
 *  where revoked_at is null makes a duplicate call harmless. */
export async function recordWaiverConsent(params: {
  participantId: string;
  personId: string;
  waiverResponseId: string;
}): Promise<void> {
  const service = createServiceClient();
  const { error } = await service.from("mem_waiver_consents").insert({
    participant_id: params.participantId,
    person_id: params.personId,
    waiver_response_id: params.waiverResponseId,
  });
  if (error && error.code !== "23505") {
    console.error("mem_waiver_consents insert failed", params.participantId, error);
  }
}

/** Persist everything a checkWaivers() pass just learned: fresh person_id
 *  links onto mem_participants, and backfilled mem_waiver_consents rows so
 *  the next check takes the fast primary path.
 *
 *  Extracted 2026-09-03 when the subscribe route became the third caller.
 *  The booking and walk-in routes each carried their own copy of this
 *  block; a third copy is exactly how two gates that must agree drift
 *  apart, which the header comment on checkWaivers() already warns about.
 *  Never throws — a failed persist costs a slower check next time, not
 *  lost cover. */
export async function persistWaiverMatches(
  statuses: WaiverStatus[],
  participants: Pick<Participant, "id" | "person_id">[]
): Promise<void> {
  const service = createServiceClient();

  await Promise.all(
    statuses
      .filter((s) => s.matchedPersonId)
      .map((s) =>
        service
          .from("mem_participants")
          .update({ person_id: s.matchedPersonId })
          .eq("id", s.participantId)
      )
  );

  await Promise.all(
    statuses
      .filter((s) => s.backfillFromResponseId)
      .map((s) => {
        const participant = participants.find((p) => p.id === s.participantId);
        const personId = s.matchedPersonId ?? participant?.person_id;
        if (!personId) return Promise.resolve();
        return recordWaiverConsent({
          participantId: s.participantId,
          personId,
          waiverResponseId: s.backfillFromResponseId!,
        });
      })
  );
}

// --- Write path (Phase 1: in-app waiver) ---

export type SubmitWaiverInput = {
  accountId: string;
  /** Account holder's name — split into people.first_name / last_name. */
  accountName: string;
  /** Auth email — what checkWaivers() matches signers on. Must be the
   *  account's own email or the resulting row would never be found. */
  email: string;
  participantIds: string[];
  emergencyContactName: string;
  emergencyContactPhone: string;
  emergencyContactRelationship: string;
  agreedPhoto: boolean;
};

export type SubmitWaiverResult =
  | { ok: true; personId: string; covered: number }
  | { ok: false; error: string };

/** Split a free-text name into the first/last pair `people` requires.
 *  Single-word names keep the surname non-null (the column is NOT NULL)
 *  by repeating the given name rather than inventing one. */
function splitName(full: string): { first: string; last: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: "Member", last: "Member" };
  if (parts.length === 1) return { first: parts[0], last: parts[0] };
  return { first: parts.slice(0, -1).join(" "), last: parts[parts.length - 1] };
}

/** Record a waiver for the given account's participants, writing the same
 *  people + waiver_responses shape the standalone waiver app writes.
 *
 *  Coverage is then made explicit by stamping mem_participants.person_id
 *  with the signer's people.id — which is exactly what checkWaivers()
 *  already persists when it matches a child by name (`matchedPersonId` is
 *  the signer's id, not the child's). Doing it at write time means
 *  coverage is resolved by id instead of by normalised-name comparison,
 *  so "Jo Smith" vs "Joseph Smith" can no longer silently fail to match.
 *  skater_names is still populated for the staff check-in portal, which
 *  searches it directly.
 *
 *  Never throws — returns a result object; the caller maps it to a
 *  status code. */
export async function submitWaiver(
  input: SubmitWaiverInput
): Promise<SubmitWaiverResult> {
  const service = createServiceClient();

  // Participants must belong to the signing account — never trust ids
  // straight from the request body.
  const { data: participantRows, error: participantsError } = await service
    .from("mem_participants")
    .select("id, name, dob")
    .in("id", input.participantIds)
    .eq("account_id", input.accountId);
  if (participantsError) {
    console.error("waiver: participants read failed", participantsError);
    return { ok: false, error: "Could not save the waiver — please try again." };
  }
  const participants = participantRows ?? [];
  if (participants.length !== input.participantIds.length) {
    return { ok: false, error: "Some of those people aren't on your account." };
  }

  // Emergency contact is only required when the waiver covers a minor —
  // checked against real DOB data, never the client's own claim about who
  // it covers.
  const hasMinors = participants.some((p) => ageOn(p.dob, new Date()) < 18);
  if (
    hasMinors &&
    (!input.emergencyContactName.trim() ||
      !input.emergencyContactPhone.trim() ||
      !input.emergencyContactRelationship.trim())
  ) {
    return {
      ok: false,
      error: "Enter an emergency contact — required when the waiver covers anyone under 18.",
    };
  }

  const { data: activeVersion, error: versionError } = await service
    .from("form_versions")
    .select("id")
    .eq("active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (versionError || !activeVersion) {
    console.error("waiver: no active form version", versionError);
    return { ok: false, error: "Could not save the waiver — please try again." };
  }

  const { first, last } = splitName(input.accountName);
  const { data: person, error: personError } = await service
    .from("people")
    .insert({ first_name: first, last_name: last, email: input.email })
    .select("id")
    .single();
  if (personError || !person) {
    console.error("waiver: people insert failed", personError);
    return { ok: false, error: "Could not save the waiver — please try again." };
  }

  const today = new Date();
  // 'self' when the signer is only covering themselves, 'others' when the
  // waiver covers anyone else — the standalone form's third mode ('party')
  // has no equivalent here.
  const selfOnly =
    participants.length === 1 &&
    participants[0].name.trim().toLowerCase() ===
      input.accountName.trim().toLowerCase();

  const { data: response, error: responseError } = await service
    .from("waiver_responses")
    .insert({
      person_id: person.id,
      form_version_id: activeVersion.id,
      // session_date is NOT NULL and means "the session being attended" in
      // the standalone form. An account-level waiver isn't tied to one, so
      // this records the signing date. See planning note: making this
      // nullable belongs with the Phase 2 standing-waiver work.
      session_date: today.toISOString().slice(0, 10),
      skating_mode: selfOnly ? "self" : "others",
      skater_names: participants.map((p) => p.name),
      has_minors: hasMinors,
      emergency_contact_name: input.emergencyContactName,
      emergency_contact_phone: input.emergencyContactPhone,
      emergency_contact_relationship: input.emergencyContactRelationship,
      // Departure consent moved to the per-booking flow (2026-08-10
      // decision) — a standing yes/no here doesn't reflect that a parent's
      // judgement can reasonably change session to session. Always null
      // from Members going forward; recordDepartureConsent() in
      // departure-consent.ts is the write path now.
      consent_unaccompanied_departure: null,
      // Not tied to a specific session, so no session id and no
      // session-specific policy block.
      session_id: null,
      session_other: null,
      session_policy_type: "none",
      roller_disco_policies: null,
      sk8skool_policies: null,
      // agreed_tc / agreed_waiver are required true by waiverSchema before
      // this is called, so recording them as true is not an assumption.
      agreed_tc: true,
      agreed_waiver: true,
      agreed_photo: input.agreedPhoto,
    })
    .select("id")
    .single();
  if (responseError || !response) {
    console.error("waiver: response insert failed", responseError);
    return { ok: false, error: "Could not save the waiver — please try again." };
  }

  // Link coverage by id. A failure here is not fatal — the response row
  // exists and checkWaivers() would still match these participants by
  // name — so log loudly and continue rather than fail a saved waiver.
  const { error: linkError } = await service
    .from("mem_participants")
    .update({ person_id: person.id })
    .in("id", input.participantIds)
    .eq("account_id", input.accountId);
  if (linkError) {
    console.error("waiver: participant person_id link failed", person.id, linkError);
  }

  // Grant coverage on the decoupled gate directly — no need to wait for
  // checkWaivers()'s fallback path to backfill it next time.
  await Promise.all(
    input.participantIds.map((participantId) =>
      recordWaiverConsent({
        participantId,
        personId: person.id,
        waiverResponseId: response.id,
      })
    )
  );

  // Deliberately does NOT copy the emergency contact onto mem_participants.
  // The standalone waiver form tells signers, in as many words, "Required
  // each time they attend — contact numbers are not stored on file". Writing
  // waiver-collected contact details into participant records would
  // contradict that notice. Members does hold emergency contact fields on
  // mem_participants, but those are volunteered separately in the account
  // area; the two must not be silently merged. See planning/waiver/CONTEXT.md.

  return { ok: true, personId: person.id, covered: participants.length };
}
