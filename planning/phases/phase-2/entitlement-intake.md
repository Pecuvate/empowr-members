# Phase 2 Step 1 — Entitlement Intake (for Jasmine/Shaun)

Take-into-the-conversation version of the entitlement definition gate. Each
question states what is already known and gives a **recommended default** — so
the answer can be a confirmation rather than a design exercise. Settled answers
go into `planning/decisions/CONTEXT.md` as ADR rows, per Step 1's done-when:
*"`mem_membership_plans` + `mem_plan_entitlements` rows can be written directly
from the ADRs."*

> **Rewritten 2026-08-26.** The previous version of this file was stale in two
> ways and should not be relied on from git history: it framed Q1 as
> *"Roller Disco £50/month; General membership from £30/month"*, and it built
> its whole priority argument around unblocking a **PassKit membership pass**.
> The £50 tier is retired, there is no general plan, and PassKit was removed
> from this project entirely on 2026-08-17.

---

## Status: Q1 and Q2 are now CLOSED by the KB

`vaults/EMPOWR CIC/entities/sessions.md` (as_of 2026-08-25) is the declared
single source of truth for what sessions exist, and it now defines
Subscriptions directly.

### Q1 — Which plans exist ✅ CLOSED

A Subscription is **per session**, not a sitewide plan:

| Session | Subscription | Drop-in price |
|---|---|---|
| Skate Jam | £25/month | £7 online / £10 door |
| Sk8 Skool for Kidz (Monday **&** Wednesday) | £30/month | £10 |
| Sk8 Skool for All Ages | £40/month | £12.50 |
| SYNKRON8: Roller Dance for Beginners | £45/month | £15 |

Courses (Beginners Foundation, Prep to Street Skate L1/L2) and Camps are paid
per course and have **no** Subscription option.

A free **Empowr Member** account is a separate concept from a paid
Subscription — every Member can book any session individually without one.

### Q2 — What each plan covers ✅ CLOSED

Each Subscription covers exactly its own offering. No cross-session coverage,
no type-level coverage. In schema terms every `mem_plan_entitlements` row uses
`offering_id`, and `offering_type` stays null.

---

## Still open — these four block Steps 4–6

Steps 2 and 3 (Stripe Billing setup, subscription lifecycle) need only Q1 and
are being built now. Steps 4 (entitled booking at £0), 5 (credit redemption)
and 6 (account UI) need the answers below.

### Q3 — Session caps per period

**Recommended default:** unlimited attendance at the subscribed session, with
no counter. The session runs weekly, so the cap is physical (~4–5 occurrences
a month) and a period counter would be accounting for a limit that reality
already enforces.

- Confirm unlimited, or give a real number per plan.
- If capped: calendar month, or rolling from the signup date?

### Q4 — Family coverage ⚠️ has a schema consequence

**Recommended default:** per participant — one Subscription covers one named
skater, not the whole household.

Rationale: capacity and coach-to-child ratios are counted per child, so a
£30 household plan covering three children is ~£10 per child per month against
a £10 drop-in.

**⚠️ This is not a free choice.** `mem_memberships` is keyed on `account_id`
with no `participant_id` column. *Per household* is what the schema does
today; *per participant* needs a migration before Step 4 can be built. Please
answer this one before the others — it is the only answer that changes the
database.

### Q5 — Do subscribers still reserve a place? ⚠️ conflicts with the KB wording

**Recommended default:** yes — a subscriber still books the specific date, and
pays £0 instead of being charged.

**The conflict:** the KB says a Subscription *"removes the need to book each
date."* Taken literally that breaks three things already live in Phase 1 —
capacity enforcement, the waiver gate, and the admin check-in register, all of
which key off a booking row existing. A subscriber who just turns up is
invisible to the door.

Suggested resolution: read the KB line as removing the need to **pay** each
date, keep a one-tap "reserve my place" action, and amend the KB wording to
match. Flag if members genuinely should be able to attend unreserved — that is
a bigger conversation than a settings change.

### Q6 — Grace behaviour on a failed payment (`past_due`)

**Recommended default:** entitlements pause immediately; the member reverts to
paying full price per session until the card is fixed. Nothing is cancelled,
and it reverses itself the moment payment succeeds.

Worth knowing: Stripe's Smart Retries run for roughly three weeks. A grace
window that matches the retry schedule means about three weeks of free
sessions per failed card.

---

## Q7 — Sanity check on the Kidz discount (new)

Sk8 Skool for Kidz runs **both** Monday and Wednesday, and the KB gives one
£30/month Subscription covering both. At £10 drop-in that is up to ~9 sessions
a month for £30 — roughly a 65–70% discount, materially deeper than the other
three plans:

| Plan | Sessions/month | At drop-in price | Subscription | Effective discount |
|---|---|---|---|---|
| Skate Jam | ~4 | £28 | £25 | ~11% |
| Sk8 Skool Kidz (Mon + Wed) | ~9 | £90 | £30 | ~67% |
| Sk8 Skool All Ages | ~4 | £50 | £40 | ~20% |
| SYNKRON8 | ~4 | £45 | £45 | 0% |

Almost certainly intentional (kids' programmes are the mission), but it is
cheap to confirm before it becomes a live Stripe Price. Also note SYNKRON8 at
£45 offers **no** saving over paying per session — worth a look at whether
that plan is meant to attract anyone.

---

## Once answered

1. One ADR row per question in `planning/decisions/CONTEXT.md`
2. Update the Subscriptions section of `entities/sessions.md` in the KB —
   it is the source of truth, so any change lands there first
3. Re-run `/sync-kb` so the CRM chat widget stops quoting the old policy
4. Step 1 closes; Steps 4–6 unblock
