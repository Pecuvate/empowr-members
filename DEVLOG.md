# DEVLOG — Empowr Members

## 2026-09-04 (session 13) — CHECKIN_EMAILS had never been set, the door then ran live for the first time; PR backlog cleared; two catalogue defects fixed

Ran overnight; all commits landed 2026-09-03, PR #31 merged 09-04.

- 🔴 **`CHECKIN_EMAILS` did not exist in any Netlify context** while `/checkin` had already shipped. `isCheckinEmail()` is `isAdminEmail(email) || CHECKIN_EMAILS.includes(...)`, so every test as an admin satisfied the first branch while the second sat empty — the door area admitted only the 3 `ADMIN_EMAILS` holders and no door-only volunteer could ever have signed in. Set in **all three contexts** to `teams@empowrcic.org`, a shared staff account, and the full key set was diffed across contexts: the only remaining difference is `NETLIFY_CATALOGUE_BUILD_HOOK`, production-only by design.
- ✅ **The door then worked live, first time**: 5 people checked in at the 2026-09-03 Skate Jam between 20:46 and 21:09, against a 20:45 door. Accounts 11 → 27 and takings £117 → £226 across the same period.
- ✅ **PR backlog cleared** — #24, #25, #26, #29 merged; **#28 closed as superseded by #27**, which had merged 16 seconds after it opened: both created `.github/CODEOWNERS`, an add/add conflict, and the rule #28 wanted was already live.
- **PR #30 (`5435e28`) — `per_run` offerings showed no venue.** `listOfferingsWithVenues()` derived venues from upcoming occurrences, which a `per_run` course has none of; `prep-to-street-skate` also carries no offering venue (its levels run at two parks), so it rendered `"venues":[]` on a live bookable card. Now branches on `enrolment_scope` and reads `mem_course_runs`, mirroring the detail page. Replayed against the live catalogue first: of 9 active offerings exactly one changed.
- **PR #31 (`2c2c46e`) + migration `b8459b4` — Beginners Foundation was on sale at £55 with its time stated nowhere.** `mem_course_runs` had no time column at all; the weekday survived only because it is baked into the run label. Added `starts_at_local`/`ends_at_local` as **`TIME`, not `timestamptz`** — a run is a recurring weekly slot that stays at 7:30pm local across the BST/GMT boundary. All 20 runs populated from the KB, keyed on offering slug not label (both offerings have a "Level 2 - Wednesdays" run at different times). Verified live: 7:30–9:30pm and 7–9pm.
- 🔴 **Walk-ins are 0-for-3, ever.** All three created at the door ended `cancelled` with no payment intent — two of them *during* last night's session (20:28→20:29, 20:30→20:47). Not hold expiry: Stripe Checkout's minimum session expiry is 30 minutes. **Unresolved — pick this up first.**
- ⚠️ **The repo moved to the `PecuvateOrg` org mid-session and `main` froze for everyone**: the ruleset's `update` rule with an empty `bypass_actors` blocks all updates, and classic `enforce_admins` was `true`. User resolved it (`update` → `pull_request`, `enforce_admins: false`). **The "owner bypass" merge workflow recorded earlier no longer exists** — merges now go through the PR rule.

## 2026-09-03 (session 12) — Standalone door check-in shipped through the new owner-only PR workflow

- PR #19 added a standalone `/checkin` area with a minimal header, register and booking lookup pages; ticket QR codes and the admin Check in link now route staff there.
- Access is server-gated by `CHECKIN_EMAILS` or `ADMIN_EMAILS`, while check-in staff are limited to attendance, hold release, participant search and walk-in payment operations.
- The release gate caught a malformed `Metadata` import in the PR; it was corrected, the full production build passed, and runtime security headers remain active including `payment=()` denial.
- PR #19 was squash-merged by `Pecuvate` as `ca6616b`, Netlify deployed that exact commit `ready`, and the live `/checkin` route was confirmed to work for an authorised user.
- The repository is public with direct updates to `main` blocked; `EmpowrCIC` contributes by feature branch and PR, while only `Pecuvate` uses the owner bypass to merge.

## 2026-09-03 (session 11) — Auth email links no longer let scanners consume the member's one-time token

- Investigated the reported "invalid or expired" sign-in link against the live Supabase Auth logs. This was **not capacity**: signup and OTP verification were returning 200, with no 429 or 5xx failures; the same one-time tokens were then presented again and returned `otp_expired` / `One-time token not found`. The affected signup itself was confirmed successfully.
- The direct cause in the app was architectural: every auth email pointed its token at a GET `/auth/callback`, and that route verified immediately. A mail-security scanner or duplicate fetch could therefore spend the token before the member's browser used it. Supabase documents this exact failure mode.
- **All token-bearing email flows are scanner-safe now**: `/auth/confirm/start` validates and stages the token in a one-hour HttpOnly, SameSite cookie without calling Supabase, then redirects to a clean `/auth/confirm?staged=1` page. Only the member pressing **Continue** submits the POST to `/auth/confirm/complete`, which calls `verifyOtp()` and clears the staging cookie. Signup, magic-link, recovery, invitation and email-change templates all use this path; legacy `/auth/callback` remains for already-issued links and PKCE codes.
- The `?staged=1` marker is load-bearing on Netlify. The first production probe found that its edge layer preserves the source query when a redirect destination has no query of its own, which carried `token_hash` into the address bar even though the application specified `/auth/confirm`. Adding a harmless destination query forces replacement. The second live probe proved a 303 to exactly `/auth/confirm?staged=1`, no token in `Location`, and an HttpOnly cookie.
- Added `verify:auth-links` (5 tests): cookie round-trip/type validation, internal-only next paths, no template may point a token at the consuming callback, both client request paths must stage, and the Netlify query-replacement marker cannot disappear. Production build passed for the feature; Playwright proved the token absent from the redirected URL and DOM and verification occurred only after the button POST.
- PRs #20 (`c690bbb`) and #22 (`ba4798b`) merged and deployed. The hardened Supabase templates were applied only after both routes and the Netlify-specific correction were live; all 12 auth config fields then verified byte-identical on a fresh GET, and the production/local/preview redirect allow-list passed.
- The required deployment gate also exposed a pre-existing header gap: `netlify.toml` headers do not reach Next.js runtime HTML. `next.config.ts` now emits the same X-Frame-Options, nosniff, Referrer-Policy and Permissions-Policy headers. Security and build gates finished with zero FAILs.

## 2026-09-02 (session 10) — The "Dates coming soon" mailto was a placeholder; Brevo now exists, so it links to the real list

- **`DatesComingSoon` now links to the Brevo hosted signup form** (`links.mailingList`), replacing the interim `mailto:general@empowrcic.org`. That mailto was explicitly a stopgap — the component's own note said Brevo was set up but not wired in.
- **Still no email input in this app, and that is the point.** Brevo's hosted form owns the field, the storage and the double opt-in, so nothing here can accept an address and drop it — the bug found on EELA's `/members` on 2026-09-01. The note was rewritten to say so, and to require that if this ever becomes a native form, the API route and the list write land in the SAME change.
- **URL lives in `lib/links.ts`, not the component**, per that file's own "never hardcode URLs in components" rule. One form serves both audiences — it carries three opt-ins (Adult 15+, Kids 5+ parent/guardian, General).
- **This state finally rendered in production for the first time**: `roller-quad-camp` and `all-ages-roller-disco` were flipped `active = true` today, and both now show it. Until today no active offering had zero dates *and* zero course runs, so the component had been deployed but never exercised.
- ⚠️ **Brevo-side nit, no code fix possible:** the form's `<title>` is "Adults sign up", so that is the browser-tab text even when a parent arrives from the children's camp page. Rename it in Brevo.
- Verified on production: both pages show "Join our mailing list", the old mailto is gone from both, and the 248-char href survives rendering intact (no entity-mangling of the trailing `==`) and resolves 200.

## 2026-09-02 (concurrent session) — Course runs had no head-count and no register; early bird was an advertised price nobody could buy

## 2026-09-02 (session 9) — Review found and fixed three deployed defects: a nightly-function import crash, duplicate subscriber rows after early check-in, and walk-in alerts that contradicted the docs

## 2026-09-02 (session 8) — Beginners Foundation capacity 25 → 16 across all 14 runs (data change, no migration needed); staff alert re-scoped after "subs" was read literally as Subscriptions, adding a second alert

## 2026-09-02 (session 7) — Home page still said "coming soon" 6 days post-launch and pointed traffic out to EELA (backwards); WhatsApp opt-in replaced with the Brevo list, since the column was write-only

## 2026-09-02 (session 6) — Public capacity counters built fleet-wide (not just Beginners Foundation), plus the queued staff booking alert
## 2026-09-02 (session 5) — Phase 2 Step 4 built: a subscriber's reserved place is now a real booking row, not just a live-read fallback

## 2026-09-02 (session 4) — Cancelled bookings were being listed on the door register; found by a "remove the test data" request

## 2026-09-02 (session 3) — Self-serve cancellation restored and LIVE; the published policy no longer promises a button that isn't there

## 2026-09-02 (session 2) — Every session page 404'd on production; the cause was `revalidatePath` on a dynamic route pattern, and I got it wrong twice before proving it

## 2026-09-02 — A subscriber can no longer be charged for a place they already hold; verified on production

## 2026-09-01 (later) — Subscriptions would have taken money and granted nothing; capacity gaps closed

## 2026-09-01 — Subscriptions on sale, subscribers on the register, catalogue layout steadied

## 2026-08-30/31 — Auth email links were bound to one browser; password reset built; four Phase 2 questions closed

## 2026-08-29 — Logo centred in auth emails, departure consent captured at the door; and I broke the drift guard on my first use of it

## 2026-08-28/29 (session 2) — Auth emails branded: the first email a member ever receives was stock Supabase (all 6 applied and verified)

## 2026-08-28 (continued) — Drop-in eligibility was wrong on 5 of 7 sessions; soft-404 fixed, and fixing it required a rebuild trigger

## 2026-08-28 — Pay-on-the-door walk-ins built and e2e-verified in production; the e2e found a live sign-in bug that had nothing to do with it

## 2026-08-27 (session 3, continued) — Anniversary event live, Prep to Street merged into one offering behind a new `mem_course_runs.venue_id`, door check-in fallback added, walk-in spec written and its premise corrected by Empowr

## 2026-08-27 (session 3) — Members went PUBLIC: 1 → 8 offerings live, noindex removed, first-ever robots.txt, catalogue seeded to March 2027

## 2026-08-27 — Phase 2 model corrected to per-participant/per-slot, live Stripe config completed and verified, docs realigned

## 2026-08-27 — Focus-ring fix finally reached production, three days after the docs said it had (PR #12, MERGED `b745c8d`)

## 2026-08-26 (session 2) — Phase 2 Steps 2-3 built, merged and verified end to end; a cross-app leak fixed in Heroes first; the test-mode webhook endpoint found dead

## 2026-08-26 — Catalogue reconciled against the KB: 3 offerings created, 2 renamed, a schedule gap and an out-of-season date fixed

## 2026-08-20 — Audited by the Web Build Framework harness: one real focus defect, and the PR #8 layout fix confirmed intact

## 2026-08-19 (tidy-up) — Test data purged, site set to noindex and deployed, registry corrected

## 2026-08-19 (admin access) — jasmine.barnett@empowrcic.org granted admin on production

## 2026-08-19 (end) — Unified the site header: /sessions was rendering a different nav (PR #9, MERGED and live)

## 2026-08-19 (later) — Member nav collapsed too; found the real cause of "unnecessary scrolling"; remaining refund copy removed (PR #8, MERGED and live) — Member header now collapses below sm like admin, at the user's request after seeing it working. Behaviour moved into a shared CollapsibleNav rather...

## 2026-08-19 — Bookings cancel/transfer notice removed (pre-purchase PolicyNotice KEPT deliberately); active-nav indicator on all headers; admin-only burger nav (PR #7, MERGED and live)

## 2026-08-18 (session 5) — UX pass: no loading boundaries existed anywhere; also shipped and fixed a prerender regression on /sessions (PRs #4, #5, #6 all MERGED and live)

## 2026-08-18 (session 4) — Multi-viewport mobile audit: admin pages horizontally scrolled at 320px, dates list wrapped every button (PR #4 — MERGED 2026-08-18 as `984349f`; was open when this was written)

## 2026-08-18 (session 3) — Public catalogue was uncacheable by design, not slow at the database; fixed and measured (PR #3 — MERGED 2026-08-18 as `108e6bb`; was open when this was written)

## 2026-08-18 (session 2) — Live-mode Stripe smoke test run for real; found and fixed a waiver bug, a cross-app Stripe webhook bug, and three mobile-responsiveness issues

## 2026-08-18 — PR #2 (tier 1 waiver decoupling + PassKit removal) merged to main, confirmed live in production

## 2026-08-17 (later session) — PassKit removed, replaced with an in-house QR ticket page

## 2026-08-17 — Tier 1 built (scoped down after a Waivers-side retention change), plus per-booking departure consent; PR #1 unblocked

## 2026-08-14 — Added a `## Skills and Tools Available` section to CLAUDE.md, closing a scheduled mwp-health M8 finding

## 2026-08-10 — Retention blocker cleared at the database: the purge now keys on session_date, and a latent FK would have killed the job entirely

## 2026-08-09 — Waiver copy aligned verbatim; 24h retention found, which invalidates Phase 1's core premise — PR #1 now ON HOLD

## 2026-08-06 (session) — In-app waiver built (Phase 1, PR #1 open, NOT merged); waiver-app scare resolved

## 2026-08-06 — Migrations moved out of this repo to the shared `empowr-cic-workspace` schema of record; all 22 migrations now generated from the Supabase migration ledger via `dump-ledger.mjs`

## 2026-08-05 (session) — PassKit pre-launch verification: found `lib/passkit.ts` silently broken in production (JWT `iat` on PassKit's 60s rejection boundary, 0/12 accepted), disproved "Apple blocked by cert" (real blocker is DRAFT mode's 48h expiry) and "Google Wallet unaffected", fixed a broken QR and empty name field, and wrote the cert-day runbook

## 2026-07-30 (session) — KB timetable investigation: KB held usable schedule data, and capacity was named the last seeding blocker — CORRECTED 2026-08-05, capacity is nullable and NULL means unlimited, so seeding was never actually blocked

## 2026-07-30 (session) — PostHog analytics instrumentation (Variant B: cookieless on_reject + consent banner); analytics_sites row created; CSP patch deliberately skipped; commit f7c72b2

## 2026-07-30 — PostHog route-change tracking fix (fleet-wide): `capture_pageview: true` → `'history_change'`, since `true` silently captured no client-side `<Link>` navigation at all; fixed across all 5 Next.js sites plus the canonical template

## 2026-07-29 (Launch-gate: legal policy links wired) — spec risk #5 resolved: reused the existing org privacy policy rather than adding a Members-specific one, added the `/legal/:slug` LegalHub proxy + a root-mounted `Footer.tsx` (the app had zero legal links before); live Stripe smoke test deferred — catalogue tables still empty

## 2026-07-21 (PassKit Track A — Step A8: live e2e proof passed, deployed — Track A COMPLETE) — self-signed a real Stripe webhook event end-to-end: pass issued + `passkit_pass_id` persisted, confirmation email wallet link verified via Gmail MCP, admin occurrence-cancel voided the pass (ticket 404s after); zero leftover rows after cleanup; deployed (commit `6d8f6b5`). Track A fully built/e2e-proven/deployed; still open: install a pass on a real phone, Apple Wallet blocked on Developer cert, Track B blocked on Phase 2

## 2026-07-21 (PassKit Track A — Steps A5, A6, A7 built: issue-on-confirm, email link, void-on-cancel) — `issuePassesForSession()` issues one pass per booking on Stripe first-confirm; confirmation email renders a wallet-install link per participant; admin occurrence-cancel voids the pass after refund/credit succeeds; clean build verified, not yet e2e-proven live at this point (that became Step A8)

## 2026-07-21 (PassKit Track A — Steps A3 + A4 built, venue wiring e2e-proven) — schema migration added `passkit_pass_id`/`passkit_venue_id`; `lib/passkit.ts` built (hand-rolled JWT, `createPassKitVenue`/`issueSessionPass`/`voidPass`); venue creation wired into `POST /api/admin/venues` and e2e-proven live (real Supabase row + real PassKit API)

## 2026-07-21 (PassKit Track A — Step A0 verified + Step A2 built and proven end-to-end) — REST JWT auth empirically verified live (fixed claim/header-scheme bugs + a PowerShell local-time-vs-UTC bug); built the shared Production/Ticket Type/Template via live API calls (full ID table + every REST-vs-gRPC JSON-shape gotcha written to `planning/passkit/CONTEXT.md` — read that before touching `lib/passkit.ts`); Apple Wallet blocker surfaced (needs a paid Apple Developer cert, Google Wallet unaffected); `mem_venues` confirmed empty (Q6/Jasmine real-timetable gap, unchanged)

## 2026-07-21 — Self-serve cancellation removed entirely (deleted `lib/cancellation.ts`, the member cancel route/email); matches new no-refund T&Cs v1.1 — only admin occurrence-cancel remains as a refund/credit path

## 2026-07-16 — PassKit integration scoped and ADR'd (Track A session pass greenlit, Track B membership pass blocked on Phase 2); credentials vaulted; entitlement intake Q1–Q6 drafted

## 2026-07-12 — Phase 1 Step 9: full e2e regression 6/6 PASS, pre-deploy-security 0 FAILs, Stripe switched to live mode in production (Netlify env PATCH-per-key gotcha documented); live-mode smoke test still outstanding at the time

## 2026-07-11 (Phase 1 Step 8) — Built admin area: allowlist-gated CRUD for venues/offerings/occurrences/course-runs, register view, cancel-occurrence bulk refund/credit folded into one email; e2e verified incl. folded multi-child email and FK-blocked venue delete

## 2026-07-11 (Phase 1 Step 7) — Built My Bookings + self-serve cancellation (48h refund/credit policy); e2e 6/6 incl. a real Stripe test-mode refund. **Superseded 2026-07-21: this entire flow was removed to match the new no-refund legal policy — see that entry.**

## 2026-07-10 — Phase 1 Step 6 DONE: Resend transactional emails (3 pure builders + never-throw sendEmail + orchestrators; confirmation wired into Stripe webhook); e2e all 3 delivered + Gmail-confirmed, zero leftover rows

## 2026-07-10 — Phase 1 Step 5 DONE: Stripe Checkout payments (card-only, webhook confirm/release, per-booking price snapshot); e2e 5/5 UI + 22/22 DB/webhook; prod TEST webhook wired, Netlify env pushed

## 2026-07-09 — Stripe test keys vaulted (Step 5 prep): MEMBERS_STRIPE_* keys created in the shared Empowr CIC dashboard, intook to vault, pulled to local; live keys deferred to Step 9 go-live

## 2026-07-09 — Phase 1 Step 4 DONE: booking flow (`mem_hold_bookings()` row-locked RPC, waiver gate against the Waivers tables, pg_cron expiry sweep); e2e 15/15 incl. a true concurrent capacity-1 race

## 2026-07-09 — Phase 1 Step 3 pages DONE: catalogue `/sessions` + `/sessions/[slug]`; e2e 25/25 against KB-shaped seed data; real-timetable seeding still gated on Q6 (Jasmine)

## 2026-07-09 (Phase 1 Step 2 — auth + account UI) ✅ — magic-link+password auth, Pattern 1 middleware guard, lib layer (supabase clients, business-rules constants, zod validation), route groups, household CRUD via service-client API routes; e2e 18/18; shadcn deferred for brand-token primitives

## 2026-07-08 — Phase 1 kickoff: spec gate closed (4 provisional rules ADR'd, Stripe = shared Empowr CIC account confirmed), e2e signup PASSED, fixed missing mem_ table grants (hardened default ACL), vault pipeline onboarded, .env.local written; only Q6 left open

## 2026-07-06 — Phase 0 COMPLETE: brand, 11-table mem_ schema + RLS, signup trigger, Resend SMTP auth config, Netlify site + members.empowrcic.org live, push-to-deploy verified (publish ".next" two-sided rule); bookings.empowrcic.org Wix A record deleted

## 2026-07-06 — Project planned from Empowr KB, MWP-scaffolded, repo + registries set up, phase 0–4 execution plans written (9 ADRs)
