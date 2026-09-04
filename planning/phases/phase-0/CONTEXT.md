# Phase 0 — Foundation Build Plan

Execution plan for Phase 0. Scope defined in [spec](../../spec/CONTEXT.md); data model in [architecture](../../architecture/CONTEXT.md). This file is the build checklist — compress to a summary once Phase 0 closes.

**Phase 0 is done when:** the `mem_` schema is live in Supabase with RLS verified, a test signup creates a `mem_accounts` row, brand assets are in place, and the holding page is live at https://members.empowrcic.org over SSL.

Already complete: MWP scaffold, GitHub repo (`PecuvateOrg/empowr-members`, public), parent-repo .gitignore, first commits pushed.

---

## Step 1 — Brand assets (`/init-brand`)

- Source: Empowr CIC brand infrastructure (transparent logo + generate-favicons script — see memory `project_empowr_favicon`)
- Output: favicons + manifest into `src/public/`, `brand-identity.md`, brand tokens registered in `src/app/globals.css` `@theme` (replaces the placeholder comment)
- **Done when:** holding page renders with Empowr favicon and brand colours locally

## Step 2 — Database migration 1: `mem_` schema

Write `src/supabase/migrations/<timestamp>_members_initial_schema.sql` locally first, then apply to `empowr-cic` (`qrdlheqnnzpasbnayalm`) via MCP. One migration, four parts:

**2a. Enums**
`mem_offering_type` (drop_in, lesson, course, camp, event) · `mem_booking_status` (pending_payment, confirmed, cancelled, credited, refunded, attended, no_show) · `mem_occurrence_status` (scheduled, cancelled_by_empowr, completed) · `mem_refund_policy` (standard, non_refundable) · `mem_enrolment_scope` (per_occurrence, per_run) · `mem_booking_source` (online, walk_in, member) · `mem_membership_status` (active, past_due, cancelled)

**2b. Tables** — in dependency order per the [architecture data model](../../architecture/CONTEXT.md): `mem_accounts` (FK → auth.users), `mem_venues`, `mem_offerings`, `mem_course_runs`, `mem_occurrences`, `mem_participants` (nullable FK → `people` for waiver link), `mem_membership_plans`, `mem_plan_entitlements`, `mem_memberships`, `mem_bookings`, `mem_credits`. All with `created_at`/`updated_at` + `set_updated_at` trigger (new `mem_set_updated_at()` — do not reuse other apps' trigger functions).

**2c. RLS** — enabled on every table before the migration ends:
- `member_account_id()` — SECURITY DEFINER, `search_path` set, anon EXECUTE revoked; returns the caller's `mem_accounts.id`. Policies never inline-subquery their own table (recursion rule)
- Member-owned tables (`mem_accounts`, `mem_participants`, `mem_bookings`, `mem_memberships`, `mem_credits`): SELECT for authenticated where `account_id = member_account_id()`. No INSERT/UPDATE/DELETE policies — writes are service-role only
- Catalogue tables (`mem_offerings`, `mem_occurrences`, `mem_venues`, `mem_membership_plans`, `mem_plan_entitlements`, `mem_course_runs`): SELECT for `anon` + `authenticated` where `active = true` / status = scheduled — the public must browse sessions before signing up
- `auth.uid()` wrapped as `(select auth.uid())` in all policies (advisory rule)

**2d. Indexes** — all FKs, `mem_occurrences(starts_at)`, `mem_bookings(account_id, status)`, partial unique index preventing duplicate confirmed bookings per participant/occurrence

**Post-apply:** run Supabase advisors (expect zero new WARNs), update `_config/registry/supabase.md` (tables, enums, functions, migration row), commit migration file.

**Done when:** advisors clean, registry updated, local .sql committed.

## Step 3 — Supabase Auth configuration

- Enable email provider: **magic link + password** both on
- Redirect / site URLs: `https://members.empowrcic.org/**` + `http://localhost:3000/**`
- **Signup trigger** (migration 2, same session): `on_auth_user_created` → inserts `mem_accounts` row (SECURITY DEFINER, mirrors the standard Supabase pattern)
- **SMTP via Resend**: point Supabase Auth SMTP at Resend (empowrcic.org domain already verified for Heroes — confirm in Resend dashboard before wiring; if not verified, defer SMTP to Phase 1 and launch Phase 0 on Supabase default sender)
- Leaked-password protection: enable (flagged as WARN on the other project — don't repeat it)

**Done when:** test signup on localhost creates an auth user + `mem_accounts` row and the confirmation email arrives.

## Step 4 — Netlify site + domain

- `/pre-deploy-security` quick pass (holding page only — expect trivial PASS)
- `/netlify-deploy`: create site, `members.empowrcic.org` via Route53, verify SSL + domain attachment (post-step validation per skill notes)
- Env vars: set all four Supabase/Resend values now via API (`POST /accounts/{id}/env?site_id=` — MCP env tool silently fails; no scopes; never `envVarIsSecret`). Stripe vars wait for Phase 1 + the account decision
- Update `_config/registry/netlify-sites.md` + `github.md` (auto-deploy status), `env-vars.md`

**Done when:** https://members.empowrcic.org serves the holding page over SSL.

## Step 5 — Close

- memory.md → "Phase 0 complete"; DEVLOG entry; commit + push
- Registry commits in `_config`

---

## Decisions made in this plan (ADR log updated)

1. **Public catalogue reads** — `anon` SELECT on active catalogue rows; browsing must not require an account
2. **Signup trigger auto-creates `mem_accounts`** — standard Supabase pattern; avoids a "complete profile" dead-end
3. **Resend as Supabase Auth SMTP** — one email vendor; conditional on domain verification check
4. **Stripe deferred out of Phase 0 entirely** — nothing in Phase 0 needs it; the account question blocks Phase 1 only

## Not in Phase 0 (explicitly)

- pg_cron pending-booking expiry job — lands with the booking flow (Phase 1)
- Any Stripe configuration
- Catalogue seeding — Phase 1, after schedule verification with Jasmine
- Spec gap fixes (credit expiry policy, walk-in flow detail, per-feature acceptance criteria) — resolve at Phase 1 spec review
