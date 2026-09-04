# Empowr Members

> **This repository is PUBLIC** (`PecuvateOrg/empowr-members`).
>
> **Devlog and memory location:** `../workspace-docs/empowr-members/`
>
> `DEVLOG.md` and `memory.md` are **not** kept in this repo — they hold operational
> detail that must not be world-readable. Write session entries to the path above,
> in the private Empowr CIC hub. Both filenames are gitignored here, so a copy created
> in this directory is silently never committed.
>
> Never put live identifiers, unremediated security findings, or commercial state
> in any file tracked here. See `../CONTEXT.md` and
> `_config/guides/public-repo-collaboration.md`.

Membership and session booking platform for Empowr CIC — members book, pay for, and manage sessions and monthly memberships. Replaces the legacy Wix booking system.

This file is the map. Workspace detail lives in each CONTEXT.md.

## Routing

| Task | Go to | Read | Skills |
|---|---|---|---|
| Feature spec / scope / phases | planning/spec/ | CONTEXT.md | — |
| Architecture / data model / integrations | planning/architecture/ | CONTEXT.md | — |
| Decision records (ADRs) | planning/decisions/ | CONTEXT.md | — |
| Phase execution (build steps for current phase) | planning/phases/ | CONTEXT.md → phase-N/ | — |
| UI / components / app code | src/ | CONTEXT.md | /webapp-testing |
| Deployment / going live | ops/ | CONTEXT.md | /netlify-deploy, /netlify-supabase-check |
| Brand / favicon setup | ops/ | CONTEXT.md | /init-brand |

## Cross-Workspace Flows

- New feature: planning/spec/ → planning/architecture/ (if schema changes) → src/ → ops/ (if env vars or build config change)
- Schema change: apply via the Management API (see `_config/registry/supabase.md` reference), then regenerate `Empowr CIC/supabase/migrations/` with `dump-ledger.mjs` — **not** `src/supabase/migrations/`, which stopped existing here 2026-08-06 (this DB is shared with Waivers and the EFN dashboard; see registry) → update `_config/registry/supabase.md`
- Go-live: src/ → /pre-deploy-security → /netlify-supabase-check → ops/

## Naming Conventions

- Components: PascalCase (`BookingCard.tsx`)
- Database tables: `mem_` prefix (shared Supabase project)
- Migrations: `YYYYMMDDHHMMSS_name.sql`, generated into `Empowr CIC/supabase/migrations/` (schema-of-record repo) — never hand-authored, never under `src/`
- Decision records: `YYYY-MM-DD-decision-title.md`
- Env vars: `NEXT_PUBLIC_` prefix only for browser-safe values

## File Placement

- Application code, config, migrations → src/
- Specs and scope docs → planning/spec/
- Design and data-model docs → planning/architecture/
- ADRs → planning/decisions/
- Deployment and env documentation → ops/

## Token Management

- Do not load planning/ for routine code changes — only when specing or designing
- Do not load ops/ unless deploying or changing env/build config
- Do not read migration history in src/supabase/migrations/ unless writing a new migration
- Do not embed Empowr CIC identity here — route to the Empowr CIC KB (see CONTEXT.md)
- Load `_config/registry/supabase.md` only when touching the database; `_config/registry/third-party-services.md` only when touching Stripe/Resend

## Deployment

- Platform: Netlify
- Domain: members.empowrcic.org
- Branch: main
- Base directory: src/

## Skills and Tools

- /netlify-deploy — deploy to Netlify and wire up a custom domain
- /netlify-supabase-check — audit Netlify + Supabase integration before going live
- /webapp-testing — test UI in a browser with Playwright
- /init-brand — set up favicons, manifest, and brand assets
- /pre-deploy-security — security hygiene check before any deploy
- /ses-email — wire up transactional email via AWS SES (project default is Resend; see architecture)
- /esign — e-signature integration (waivers are handled by the existing Empowr Waivers app, not in-project)
- /audit-mwp — check MWP structure compliance
- /update-mwp — update MWP files when the project evolves

## Skills and Tools Available

| Tool / Skill | Trigger | Purpose |
|---|---|---|
| `/netlify-deploy` | going live | Deploy to Netlify and wire up `members.empowrcic.org` |
| `/netlify-supabase-check` | before going live | Audit Netlify + Supabase integration |
| `/webapp-testing` | after frontend changes | Test UI in a browser with Playwright |
| `/init-brand` | once, before first deploy | Set up favicons, manifest, and brand assets |
| `/pre-deploy-security` | before any deploy | Security hygiene check |
| `/ses-email` | if migrating off Resend | Wire up transactional email via AWS SES |
| `/esign` | not used in this project | Waivers are handled by the separate Empowr Waivers app |
| `/audit-mwp` | after structural changes | Check MWP structure compliance |
| `/update-mwp` | when the project evolves | Update MWP files |
