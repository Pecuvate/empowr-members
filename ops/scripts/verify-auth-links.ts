import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  decodePendingAuthConfirmation,
  encodePendingAuthConfirmation,
  parseEmailOtpType,
  safeNext,
} from "../../src/lib/auth-confirmation.ts";
import { allAuthTemplates } from "../../src/lib/emails/auth-templates.ts";

const PROJECT_ROOT = path.resolve(import.meta.dirname, "../..");

test("confirmation cookies round-trip only supported OTP data", () => {
  const encoded = encodePendingAuthConfirmation({
    tokenHash: "test-token-hash",
    type: "magiclink",
    next: "/book/example",
  });

  assert.deepEqual(decodePendingAuthConfirmation(encoded), {
    tokenHash: "test-token-hash",
    type: "magiclink",
    next: "/book/example",
  });
  assert.equal(decodePendingAuthConfirmation("not-base64-json"), null);
  assert.equal(parseEmailOtpType("unsupported"), null);
});

test("post-verification destinations cannot leave the app", () => {
  assert.equal(safeNext("/book/example"), "/book/example");
  assert.equal(safeNext("https://attacker.example"), "/account");
  assert.equal(safeNext("//attacker.example"), "/account");
  assert.equal(safeNext(null), "/account");
});

test("auth emails never consume a token directly from their GET link", () => {
  const templates = allAuthTemplates();
  for (const template of templates) {
    assert.doesNotMatch(
      template.html,
      /\/auth\/callback\?token_hash=/,
      `${template.key} still points a token at the consuming callback`
    );
  }

  for (const key of ["confirmation", "recovery", "email_change", "invite"]) {
    const template = templates.find((candidate) => candidate.key === key);
    assert.ok(template?.html.includes("/auth/confirm/start?token_hash="));
  }
});

test("both in-app email requests stage tokens on the confirmation route", () => {
  const signup = readFileSync(
    path.join(PROJECT_ROOT, "src/components/auth/SignupForm.tsx"),
    "utf8"
  );
  const login = readFileSync(
    path.join(PROJECT_ROOT, "src/components/auth/LoginForm.tsx"),
    "utf8"
  );

  assert.match(signup, /emailRedirectTo:.*\/auth\/confirm\/start\?next=/);
  assert.match(login, /emailRedirectTo:.*\/auth\/confirm\/start\?next=/);
});
