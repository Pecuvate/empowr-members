import test from "node:test";
import assert from "node:assert/strict";
import {
  brevoListKeyForOffering,
  brevoListKeyForPlan,
  configuredBrevoLists,
} from "../../src/lib/brevo.ts";

test("maps every supplied session family", () => {
  assert.equal(brevoListKeyForOffering({ title: "Skate Jam" }), "skateJam");
  assert.equal(brevoListKeyForOffering({ title: "SYNKRON8" }), "synkron8");
  assert.equal(brevoListKeyForOffering({ title: "Beginners Foundations" }), "beginnersFoundations");
  assert.equal(brevoListKeyForOffering({ title: "Prep to Street Skate" }), "prepToStreet");
  assert.equal(brevoListKeyForOffering({ title: "Roller Skate Events 15+" }), "adultRollerEvents");
  assert.equal(brevoListKeyForOffering({ title: "Roller Quad Camp" }), "rollerQuadCamp");
});

test("routes Kidz Monday and Wednesday by Europe/London weekday", () => {
  assert.equal(brevoListKeyForOffering({ title: "Sk8 Skool for Kidz", startsAt: "2026-09-07T15:00:00Z" }), "sk8KidzMonday");
  assert.equal(brevoListKeyForOffering({ title: "Sk8 Skool for Kidz", startsAt: "2026-09-09T16:00:00Z" }), "sk8KidzWednesday");
});

test("maps the five live Stripe subscription lookup keys", () => {
  assert.equal(brevoListKeyForPlan("members_skate_jam_monthly"), "skateJam");
  assert.equal(brevoListKeyForPlan("members_synkron8_monthly"), "synkron8");
  assert.equal(brevoListKeyForPlan("members_sk8_skool_kidz_mon_monthly"), "sk8KidzMonday");
  assert.equal(brevoListKeyForPlan("members_sk8_skool_kidz_wed_monthly"), "sk8KidzWednesday");
  assert.equal(brevoListKeyForPlan("members_sk8_skool_all_ages_monthly"), "sk8AllAges");
});

test("ignores missing and invalid list configuration", () => {
  const lists = configuredBrevoLists({
    BREVO_SKATE_JAM_LIST_ID: "10",
    BREVO_SYNKRON8_LIST_ID: "not-a-number",
  } as NodeJS.ProcessEnv);
  assert.equal(lists.get("skateJam"), 10);
  assert.equal(lists.has("synkron8"), false);
});

