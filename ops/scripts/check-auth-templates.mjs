/**
 * check-auth-templates.mjs
 *
 * Run:
 *   npm run check:auth-emails
 *
 * Needs a Supabase Management API token. Taken from SUPABASE_ACCESS_TOKEN if
 * it is set, otherwise read straight out of the workspace secrets file — see
 * resolveToken() below for why that fallback exists.
 *
 * Compares the Supabase auth email templates LIVE on the project against the
 * output of render-auth-templates.ts in ops/auth-templates/. Exits non-zero
 * if any applied template has drifted.
 *
 * Why this exists: the auth templates are the one part of this app's email
 * surface that does not live in the codebase — Supabase stores them as
 * strings in project config. Nothing about a green build or a clean git tree
 * says the deployed template still matches the shell it was rendered from, so
 * a brand change to shell.ts silently desyncs them. This is the only check
 * that catches that.
 *
 * A template reported "not applied" is stock Supabase content, not drift.
 *
 * It ALSO checks the redirect allow list, because of a failure on 2026-09-01
 * that no template diff could have caught — see checkRedirectContract() at the
 * bottom of this file.
 */
const KEYS = [
  "confirmation",
  "magic_link",
  "recovery",
  "email_change",
  "invite",
  "reauthentication",
];

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { requireToken, AUTH_CONFIG_URL } from "./management-token.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RENDERED = path.resolve(HERE, "../auth-templates");

const token = requireToken(HERE);

const res = await fetch(AUTH_CONFIG_URL, {
  headers: { Authorization: `Bearer ${token}` },
});
if (!res.ok) {
  console.error(`auth config fetch failed: HTTP ${res.status}`);
  process.exit(2);
}
const cfg = await res.json();

let drift = 0;
let unapplied = 0;

for (const key of KEYS) {
  const live = cfg[`mailer_templates_${key}_content`] ?? "";
  const applied =
    cfg.mailer_templates_custom_contents?.[
      `MAILER_TEMPLATES_${key.toUpperCase()}_CONTENT`
    ] === true;

  let local;
  try {
    local = readFileSync(path.join(RENDERED, `${key}.html`), "utf8");
  } catch {
    console.log(`  ${key.padEnd(18)} SKIP    (not rendered locally)`);
    continue;
  }

  if (!applied) {
    console.log(`  ${key.padEnd(18)} STOCK   (branded version not applied)`);
    unapplied++;
  } else if (live === local) {
    console.log(`  ${key.padEnd(18)} OK      in sync with ops/auth-templates`);
  } else {
    console.log(
      `  ${key.padEnd(18)} DRIFT   live ${live.length}B vs local ${local.length}B`
    );
    drift++;
  }
}

console.log(
  `\n${KEYS.length - drift - unapplied} in sync, ${unapplied} stock, ${drift} drifted`
);
// Set exitCode rather than calling process.exit(). Node aborts on Windows if
// the process is torn down while undici's keep-alive socket from the fetch
// above is still closing — "Assertion failed: !(handle->flags &
// UV_HANDLE_CLOSING)", which exits 127 instead of 1 and buries the report
// under a crash dump. Letting the event loop drain exits cleanly with the
// code we set.
//
// Both checks run before exiting: a drifted template and a missing allow-list
// entry are independent faults, and short-circuiting on the first would hide
// the second until someone fixed the first and ran it again.
let failed = false;

if (drift > 0) {
  console.error("Re-run `npm run render:auth-emails` and re-apply payload.json.");
  failed = true;
}

if (!checkRedirectContract(cfg)) failed = true;

if (failed) process.exitCode = 1;

/**
 * The {{ .RedirectTo }} contract.
 *
 * magic_link is the ONLY template that builds its link from
 * `{{ .RedirectTo }}&token_hash=...` rather than a fixed SiteURL.
 * That is deliberate and should stay: a magic link's destination varies
 * (signing in from /login?next=/book/x has to return to that booking page),
 * and SiteURL is pinned to production so a SiteURL-based link cannot work on
 * a deploy preview at all.
 *
 * The price is a contract that nothing else enforces: the template appends
 * `&token_hash=`, so .RedirectTo MUST already contain a query string. It does
 * — LoginForm always sends `?next=` — but ONLY while the requesting origin is
 * in uri_allow_list. When it is not, Supabase silently DISCARDS the requested
 * redirect and substitutes the bare site_url, and the template then produces
 *
 *     https://members.empowrcic.org&token_hash=...&type=magiclink
 *
 * which is not a valid URL at all. The browser refuses it, so the member sees
 * a raw "invalid URL" warning rather than any error this app could word.
 *
 * That is exactly what happened on 2026-09-01 when the first Netlify branch
 * preview was tested: the preview origin was not allow-listed. Nothing in the
 * template had drifted, so the drift check above was silent — correctly, and
 * uselessly. Hence this check.
 *
 * Adding a new origin (a second custom domain, a different Netlify site, a
 * staging host) means adding it BOTH here and to uri_allow_list, or magic-link
 * sign-in from that origin ships broken.
 */
function checkRedirectContract(cfg) {
  const usesRedirectTo = KEYS.filter((key) =>
    (cfg[`mailer_templates_${key}_content`] ?? "").includes("{{ .RedirectTo }}")
  );
  if (usesRedirectTo.length === 0) {
    console.log("\nNo template uses {{ .RedirectTo }} — allow-list check not needed.");
    return true;
  }

  const allowList = (cfg.uri_allow_list ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  // Every origin that can START a magic-link flow. Production, local dev, and
  // this site's Netlify previews (branch deploys AND pull-request previews,
  // which is why the wildcard is on the subdomain rather than a fixed name).
  const required = [
    "https://members.empowrcic.org/**",
    "http://localhost:3000/**",
    "https://*--empowr-members.netlify.app/**",
  ];

  console.log(
    `\n{{ .RedirectTo }} used by: ${usesRedirectTo.join(", ")} — checking uri_allow_list`
  );
  const missing = required.filter((entry) => !allowList.includes(entry));
  for (const entry of required) {
    console.log(
      `  ${missing.includes(entry) ? "MISSING" : "OK     "} ${entry}`
    );
  }
  if (missing.length > 0) {
    console.error(
      `\n${missing.length} origin(s) missing from uri_allow_list. Magic-link ` +
        `sign-in from them produces a MALFORMED URL, not an error message — ` +
        `Supabase falls back to the bare site_url and the template appends ` +
        `"&token_hash=" onto a URL with no query string.`
    );
    return false;
  }
  console.log("Redirect contract holds.");
  return true;
}
