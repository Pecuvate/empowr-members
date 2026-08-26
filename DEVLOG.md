# DEVLOG — Empowr Members

## 2026-08-26 — Catalogue reconciled against the KB: 3 offerings created, 2 renamed, a schedule gap and an out-of-season date fixed

All changes are **database only** — no code in this repo changed. Every new offering is `active=false`, so none of it is publicly visible.

- **The rule set this session: `vaults/EMPOWR CIC/entities/sessions.md` is the single source of truth** for what sessions exist. EELA displays it, this catalogue must correlate with it, and anything diverging is a defect to correct **toward the KB**. **Wix was explicitly ruled out of scope** as a reconciliation target.
- **Created 3 offerings**: `prep-to-street-skate-level-1` (Southwark Park, Tue+Thu, £55) and `-level-2` (Dulwich Park, Wed, £55) as **separate** offerings because their venues genuinely differ, plus `all-ages-roller-disco` (Ladywell, £15, 5+). Added `Southwark Park` and `Dulwich Park` to `mem_venues`; gave Honor Oak and Goldsmiths the full addresses/postcodes the KB now carries.
- **Beginners Foundation** gained its two course runs (Level 1 — Tuesdays, Level 2 — Wednesdays, £55 each, dates TBC), matching the L1/L2 split EELA shipped. Kept as **one offering with two runs** — unlike Prep to Street Skate — because both levels share Honor Oak. Renamed to the **singular** "Beginners Foundation" per Empowr: it is the foundation of a skater's skills. Slug stays plural; an open decision.
- **Renamed to KB canonical**: `synkron8` → "SYNKRON8: Roller Dance for Beginners", `roller-skate-events` → "Roller Skate Events 15+".
- **Two schedule defects fixed.** Sk8 Skool Kidz had no Wednesdays after 26 Aug — added 9 (2 Sep–28 Oct) at Honor Oak indoors with the BST→GMT shift handled, matching the KB's year-round Wednesday. Deleted one out-of-season Skate Jam occurrence (27 Aug, 0 bookings); the KB's Sept 3–Mar 25 season was confirmed 2026-08-25. The 13/20 Aug dates were left alone — both past, and **20 Aug carries the retained live £7 booking**.
- **Beginner Street Skate deliberately NOT created.** It is free (£0) and is the Outside Skating Pathway's destination, not a booking — the paid L1/L2 prep courses are the on-ramp. A £0 booking would not survive the Stripe Checkout flow as built. Its absence is correct, not a gap.
- **Open — refund policy.** 4 offerings still sit on `refund_policy='standard'` (Skate Jam, Kidz, All Ages, Roller Skate Events) while the KB marks every session non-refundable. **Deliberately parked**: Programme Policies v1.2 will reverse this stance, so it should be set once in that pass rather than twice.
- Supabase MCP disconnected mid-session; fell back to the Management API (`POST /v1/projects/{ref}/database/query`) per `[[reference_supabase_management_api_sql]]`. Also learned **`mem_occurrence_status` has no neutral `cancelled`** — only `scheduled`/`cancelled_by_empowr`/`completed`, and `cancelled_by_empowr` carries real member entitlement (alternative date / discretionary refund), so it is the wrong value for a seeding error. Delete the row instead, guarded on zero bookings.
- EELA side: `feat/eela-booking-cutover` in the **EELA** repo repoints `lib/links.ts` here. Its links 404 until these offerings are activated — deliberate.

## 2026-08-20 — Audited by the Web Build Framework harness: one real focus defect, and the PR #8 layout fix confirmed intact

Read-only audit from outside this project; **no files here were changed.**

- **`input#age-filter` on `/sessions` has no visible focus indicator** at any of 8 viewports (320-1920). Keyboard users cannot see where they are on the catalogue filter. Small fix, not yet made.
- **PR #8's layout fix verified still holding.** The harness initially flagged `/sessions` for phantom scroll; probing the live page disproved it — viewport 667, scrollHeight 880, `main` 566 + header 77 + footer 117 + consent banner 121 = 881px of genuine content, and only `html`/`body` are full-height. The page correctly scrolls; there is no nested `min-h-screen`. **The checker was wrong, not this site** — it has since been rewritten as a structural check.
- **`aria-current` clean on `/sessions`**, confirming PR #9's unified `SiteHeader` still matches by section as intended.
- Public routes only (`/`, `/sessions`, `/login`) — `(member)` and `(admin)` remain unaudited because the harness has no login step yet.
## 2026-08-19 (tidy-up) — Test data purged, site set to noindex and deployed, registry corrected

Session goal was a small backlog sweep. The Skate Jam check turned up something the backlog had mis-framed.

- **The catalogue had exactly one active offering, not "one leftover flag."** Memory recorded `skate-jam active=true` as smoke-test residue for the user to revert. In fact **all three other offerings were already `active=false`** — Sk8 Skool Kidz, Sk8 Skool All Ages and SYNKRON8 — despite every one of them having occurrences seeded through October. Verified against the live site, not just the DB: `curl /sessions` returned Skate Jam and nothing else, because [lib/catalogue.ts](src/lib/catalogue.ts) filters `.eq("active", true)`. So "deactivate Skate Jam" actually meant "empty the catalogue". **The user confirmed the site is not publicly launched yet**, which makes that correct rather than alarming — but it was worth surfacing before acting, and the backlog note would have led straight past it.
- **Skate Jam deactivated, then REVERSED later the same session at the user's request.** Final state: **Skate Jam `active=true`, the other three `active=false`.** The user wants the retained £7 booking to line up with a session that actually appears on the site, so the confirmation can be reviewed against the real listing before public launch. Verified live: `/sessions` shows Skate Jam at £7, `/sessions/skate-jam` lists **Thu 20 Aug, 8:45pm–10:45pm** (the booked occurrence) at Honor Oak Community Centre, and the ticket page 200s.
- **Test data deleted, scoped to one account.** All three `mem_bookings` rows were synthetic-era, but they split cleanly by account rather than by status:
  - **Deleted** — everything belonging to `localdev.test@empowrcic.org` (`b3169b5d`): 2 participants ("Adult Tester", "Minor Tester"), 2 bookings (both `cs_test_` checkout sessions, one with a fabricated `pi_test_1786988204246`), 2 waiver consents, and the account row.
  - **Kept deliberately** — the real booking on `admin@pecuvate.com` (`ee8e2e4a`): £7, `cs_live_` session, real payment intent `pi_3U5ks1CpJGJ55gu5...`, participant Shaun Barnett, Skate Jam **starting 2026-08-20 19:45**. The user wants to review it before deletion. Note it is a **live charge** — deleting the row later will not refund it.
  - **Kept** — `tech@pecuvate.com` (`b649352a`), a real login with zero participants and zero bookings.
- **Checked the FK trap before deleting, not after.** `mem_credits` carries two FKs to `mem_bookings` (`source_booking_id`, `redeemed_booking_id`) both with **`NO ACTION`** — the same shape that killed the scheduled purge in August (see `[[feedback_shared_db_fk_breaks_scheduled_purge]]`). It happened to be harmless here only because `mem_credits` is empty; with one credit row against a cancelled booking the delete would have failed outright. Any future booking-purge job must clear credits first.
- **Archived before deleting.** Full JSON of every removed row written to the session scratchpad (`members-testdata-archive-2026-08-19.json`) and validated as parseable before the transaction ran. Deletes ran inside a single `begin/commit`, child rows first.
- **Not deleted, and deliberately so**: the `auth.users` row for `localdev.test@empowrcic.org`, Stripe customer `cus_V5dyanMpoqqZJY` (lives in Stripe, not the DB), and the Waivers-app `waiver_response`/`person` records the consents pointed at — those belong to Empowr Waivers and are out of this project's scope.
- **⚠️ A direct SQL toggle does not update the public site.** `revalidateCatalogue()` in [lib/revalidate.ts](src/lib/revalidate.ts) drops *two* layers (data cache tag + rendered page) and only the admin API route calls it. Changing `active` in SQL bypasses both, so `/sessions` kept serving Skate Jam. It self-heals via the `revalidate = 300` backstop on the page and the same 300s window on `unstable_cache`. **Prefer `/admin/offerings` for this in future** — it invalidates immediately.
- **Registry corrected** (`_config/registry/env-vars.md`, outside this project — flagged as a follow-up last session, now done): `ADMIN_EMAILS` records the per-context split (production carries Jasmine, the other three contexts do not), that it is the *only* gate on admin, and the `env:get`-not-`env:list` rule. Also fixed an adjacent stale entry found while there — `STRIPE_SECRET_KEY` still said *"TEST until Step 9"*, but production has been live-mode since the 18th; `.env.local` is correctly still `rk_test_`, and the note now says the difference is deliberate.
- **🔴 "Not launched" turned out not to mean "not reachable".** While verifying, found the site is **publicly reachable and indexable**: `/`, `/sessions`, `/login` all 200 to an anonymous request with **no password gate**, **`/robots.txt` does not exist** (the URL serves the app's own 404 HTML), and no page carried `noindex`. Nothing sensitive is exposed — admin is gated by the `ADMIN_EMAILS` allowlist, member routes 307 to login, and open ticket pages are a deliberate design decision — so this was **release control, not a security hole**, and it was described as such after initially over-framing it as security.
- **Shipped `noindex` (PR #10, MERGED, deployed).** Two lines on the root layout's metadata; every route inherits it since no page sets its own `robots`. **Deliberately NOT paired with a `robots.txt` `Disallow`** — blocking the crawl would stop search engines ever *reading* the tag, and a blocked page can still be listed as a bare URL. The code comment says so, to stop a later session "completing" it and silently breaking it. A real password gate was **assessed and declined as disproportionate** (the user is the only reviewer; it needs Netlify Pro, and a naive blanket gate would 401 the Stripe webhook and leave payments taken with bookings never confirmed).
- **Verified on the live deploy, not the build output.** `noindex, nofollow` confirmed on `/`, `/sessions`, `/sessions/skate-jam`, `/login`, `/signup`, `/waiver` and `/ticket/[id]` — **including the dynamic routes that could not be checked locally**, which had been flagged as unverified rather than assumed. `/bookings` and `/admin` still 307 for anonymous visitors; catalogue still real content; `/sessions` still `o (Static)`, `/sessions/[slug]` still SSG, zero skeleton markers, so PR #3's caching and PR #6's prerender fix both survive. Deploy `6a85ff97` on commit `135f91c`.
- **`gh pr merge` and a local `git merge` were both blocked by the auto-mode classifier**; the merge went through only after the user left auto mode. Worth knowing for future deploys — see `[[feedback_automode_blocks_production_writes]]`.
- **Analytics assessed, no work done (user's explicit call: consider it, does not block launch).** **The site already has analytics** — PostHog has been wired in since 2026-07-30 and is live: `posthog-js` is a dependency and the library is bundled into the chunks the site actually serves (grepping the HTML finds nothing because it initialises client-side, which is why the first check looked like a false negative). Config is correct, including `capture_pageview: 'history_change'` — the fleet-wide bug where `true` silently captured no client-side navigation at all. **The two real gaps are NOT installation:** (1) the event flow has still never been verified end-to-end, and a Playwright check cannot prove it because PostHog blocks headless browsers (see `[[feedback_posthog_headless_bot_detection]]`); (2) there are **no custom funnel events**, so pageviews show that people reached `/sessions` but nothing about booking-started → checkout → confirmed, which is exactly the booking-specific reporting Wix gave for free. **Wrote `planning/spec/analytics-funnel-events.md`** so the next session executes rather than re-derives: six stages mapped to real files, and the three traps — `booking_confirmed` cannot be client-side (the webhook confirms, the confirmation page only reads + auto-refreshes, so a page event measures the wrong thing and double-counts; use `posthog-node` server-side with a consistent `distinct_id`), **no PII in properties** given this platform holds children's data, and `booking_blocked` with a `reason` property is the highest-value event because `waiver_required`/`capacity`/`duplicate` are **already discrete branches** in `BookingForm.tsx`.

## 2026-08-19 (admin access) — jasmine.barnett@empowrcic.org granted admin on production

- Added `jasmine.barnett@empowrcic.org` to `ADMIN_EMAILS` on the **production context only**. Production went from `tech@pecuvate.com,admin@pecuvate.com` to those two plus Jasmine. **The other contexts were deliberately left alone** — `deploy-preview`, `branch-deploy` and `dev` each hold only `tech@pecuvate.com`, and this variable is scoped per context rather than shared.
- **No code change.** Admin is an env-var allowlist read server-side by `isAdminEmail()` in `lib/admin.ts`, enforced in the `(admin)` layout and in `getAuthedAdmin()` for every `/api/admin/*` route (Pattern 2/3 hybrid). There is **no self-serve path to admin** — signing up cannot grant it, and RLS does not gate admin writes, so this allowlist is the only gate.
- **Read the current value with `netlify env:get ADMIN_EMAILS --context <ctx>`, deliberately NOT `env:list`/`getAllEnvVars`** — this site holds the live Stripe secret and the Supabase service-role key, and dumping every variable to read one would have pulled them into the transcript. Per-key reads only.
- **A redeploy was required and a docs commit would NOT have triggered one**: the site's base directory is `src/`, so a root-only push cancels as "no content change" (see `[[feedback_netlify_base_dir_build_diff]]`). Triggered explicitly with `netlify api createSiteBuild`; deploy `6a85a14b81d33210bb78bfa6` reached `ready`, and `/`, `/sessions`, `/sessions/skate-jam`, `/login` all still 200 with `/admin` correctly 307-ing for anonymous visitors and the catalogue intact.
- **Not verified end-to-end**: Jasmine's actual sign-in was not exercised — that needs her to use a magic link on her own account. She does not need an account created first; the gate matches on email, so she signs in at `/login` as normal and `/admin` opens.
- **Follow-up not done**: `_config/registry/env-vars.md` still records the old ADMIN_EMAILS membership. It lives outside this project folder, so it was flagged rather than edited.

## 2026-08-19 (end) — Unified the site header: /sessions was rendering a different nav (PR #9, MERGED and live)

User reported that clicking "Sessions" from the navbar "opens up in a different page to that of bookings and account". Correct, and it was a real inconsistency.

- **`/sessions` lives in the `(public)` route group, so it always rendered `PublicHeader`** regardless of session — a different link set (Sessions / **My account**), **no Bookings entry at all**, no menu button, and the wordmark hidden below `sm`. **PR #8 made it worse**: it gave the member and admin headers a collapsible nav and a permanent wordmark and left the public one untouched. **Same shape as the AdminHeader bug — three near-identical headers, two updated.** The shared `CollapsibleNav` from PR #8 prevented the drift between member and admin but did nothing for the third header, which was still separate.
- `MemberHeader` and `PublicHeader` are **deleted**, replaced by one `SiteHeader` with a single link set (Sessions / Bookings / Account) used by both the `(member)` and `(public)/sessions` layouts.
- **Only the auth action differs, and it resolves CLIENT-side** via the new `AuthNavAction`. This is deliberate and load-bearing: reading the session server-side means `cookies()`, a dynamic API, which would drop `/sessions` and `/sessions/[slug]` out of static rendering and undo PR #3/#5's caching. The slot reserves its width so the nav does not shift when it settles; signed-out visitors see "Sign in". Signed-out Bookings/Account hit the existing middleware and 307 to `/login` (verified in production).
- **Verified against the built artifact, not the route table** (PR #6 lesson applied): `/sessions` still `o (Static)`, `/sessions/[slug]` still `● (SSG)`, and `.next/server/app/sessions.html` carries the real catalogue plus all three nav links with **zero** skeleton markup. In-browser the header is identical across `/sessions`, `/bookings`, `/account` with `aria-current` correct on each. Full 320-768px audit over 80 combinations clean.
- **Deferred by the user to a future session**: the pre-purchase `PolicyNotice` wording, and a contradiction found while quoting it — the admin dropdown in `OfferingForm.tsx` labels the `standard` option **"Standard (48h refund/credit window)"** while the member-facing copy for that same value says refunds are not offered. Fallout from the 2026-07-21 T&Cs v1.1 change: member copy was rewritten, the admin label was not. Both should be resolved together in Programme Policies v1.2.

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
