/**
 * apply-auth-templates.mjs
 *
 * Run:
 *   npm run apply:auth-emails
 *
 * PATCHes ops/auth-templates/payload.json — verbatim, byte for byte — to the
 * project's auth config, then verifies the result.
 *
 * WHY THIS SCRIPT EXISTS. On 2026-08-29 there was no applier. The payload was
 * hand-written from the template source instead, dropped the shell's 17-line
 * header comment in the process, and desynced all six live templates from the
 * repo. render-auth-templates.ts emits payload.json precisely so that the
 * applied content IS the rendered content; nothing enforced that until now.
 * The rule is simple and this file is how it is kept: never type a PATCH body
 * for these templates by hand.
 *
 * Before writing, the current live config is saved to
 * ops/auth-templates/rollback-<timestamp>.json so a bad apply can be undone.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { requireToken, AUTH_CONFIG_URL } from "./management-token.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RENDERED = path.resolve(HERE, "../auth-templates");
const PAYLOAD = path.join(RENDERED, "payload.json");

const token = requireToken(HERE);
const auth = { Authorization: `Bearer ${token}` };

const raw = readFileSync(PAYLOAD, "utf8");
const payload = JSON.parse(raw);
const keys = Object.keys(payload);
console.log(`payload.json: ${keys.length} fields, ${raw.length} bytes`);

// Refuse to ship a payload that still carries the browser-bound PKCE link.
// {{ .ConfirmationURL }} is browser-bound and cannot survive a second browser;
// see lib/emails/auth-templates.ts for the full reasoning.
if (raw.includes("ConfirmationURL")) {
  console.error(
    "REFUSING: payload still contains {{ .ConfirmationURL }} — that is the\n" +
      "PKCE link that only works in the browser that started the flow."
  );
  process.exit(1);
}

// A token-bearing GET that verifies immediately is vulnerable to corporate
// email scanners consuming the single-use token before the member clicks it.
// Every linked token must land on the non-consuming staging route first.
if (raw.includes("/auth/callback?token_hash=")) {
  console.error(
    "REFUSING: payload sends a token directly to the consuming callback."
  );
  process.exit(1);
}

// 1. Snapshot live config for rollback.
const before = await fetch(AUTH_CONFIG_URL, { headers: auth });
if (!before.ok) {
  console.error(`auth config fetch failed: HTTP ${before.status}`);
  process.exit(2);
}
const liveCfg = await before.json();
const snapshot = Object.fromEntries(
  keys.filter((k) => k in liveCfg).map((k) => [k, liveCfg[k]])
);
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const rollbackPath = path.join(RENDERED, `rollback-${stamp}.json`);
writeFileSync(rollbackPath, JSON.stringify(snapshot, null, 2), "utf8");
console.log(`rollback snapshot -> ${path.basename(rollbackPath)}`);

// 2. Apply, sending payload.json unmodified.
const res = await fetch(AUTH_CONFIG_URL, {
  method: "PATCH",
  headers: { ...auth, "Content-Type": "application/json" },
  body: raw,
});
if (!res.ok) {
  console.error(`PATCH failed: HTTP ${res.status}`);
  console.error((await res.text()).slice(0, 500));
  process.exit(1);
}
console.log(`PATCH ok (HTTP ${res.status})`);

// 3. Verify with a FRESH read. A PATCH response body is not a read — a claim
//    made from one on 2026-08-28 turned out to be false and had to be
//    retracted. Only a subsequent GET counts as evidence here.
const after = await fetch(AUTH_CONFIG_URL, { headers: auth });
const cfg = await after.json();
let bad = 0;
for (const k of keys) {
  if (cfg[k] !== payload[k]) {
    console.error(`  MISMATCH ${k}: live ${String(cfg[k]).length}B vs payload ${String(payload[k]).length}B`);
    bad++;
  }
}
console.log(
  bad === 0
    ? `\nAll ${keys.length} fields verified byte-identical against a fresh GET.`
    : `\n${bad} field(s) did not land — roll back with ${path.basename(rollbackPath)}`
);
process.exit(bad === 0 ? 0 : 1);
