/**
 * verify-subscription-helpers.ts
 *
 * Run:  npm run verify:subscriptions     (from src/)
 *   or: node --test ops/scripts/verify-subscription-helpers.ts
 *
 * Covers the two API-shape traps and the ownership check in
 * src/lib/stripe-subscription.ts. The rejection cases are the point: the
 * Empowr CIC Stripe account is shared with Empowr Heroes, so this app is
 * delivered Heroes' subscription events too, and a suite that only feeds it
 * Members subscriptions would prove nothing about the guard.
 *
 * Fixtures mirror the real shape observed on the live account on 2026-08-26
 * (sub_1TRWLc…), which carries current_period_end on the ITEM and no
 * top-level current_period_end at all.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import type Stripe from 'stripe'
import {
  membersSubscriptionMeta,
  toMembershipStatus,
  currentPeriodEnd,
} from '../../src/lib/stripe-subscription.ts'
import { slotCoversOccurrence, localSlotOf } from '../../src/lib/slot-matching.ts'

const PERIOD_END = 1780054288 // 2026-05-29T18:11:28Z

function subscription(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sub_test',
    status: 'active',
    metadata: {
      app: 'members',
      mem_account_id: 'acc_1',
      mem_plan_id: 'plan_1',
      mem_participant_id: 'part_1',
    },
    items: { data: [{ current_period_end: PERIOD_END }] },
    ...overrides,
  } as unknown as Stripe.Subscription
}

test('IDENTIFIES a Members subscription from its metadata', () => {
  assert.deepEqual(membersSubscriptionMeta(subscription()), {
    accountId: 'acc_1',
    planId: 'plan_1',
    participantId: 'part_1',
  })
})

// A Subscription covers one named skater (Empowr, 2026-08-26). One that does
// not name a participant cannot be honoured at the door, so it is not ours.
test('REJECTS a Members subscription with no participant', () => {
  assert.equal(
    membersSubscriptionMeta(
      subscription({ metadata: { app: 'members', mem_account_id: 'a', mem_plan_id: 'p' } })
    ),
    null
  )
})

// Heroes' recurring Payment Links leave subscription_data.metadata empty, so
// its real donations arrive here with no metadata whatsoever. This is the
// case that must not be mistaken for ours.
test('REJECTS a Heroes subscription (no metadata at all)', () => {
  assert.equal(membersSubscriptionMeta(subscription({ metadata: {} })), null)
})

test('REJECTS a subscription with null metadata', () => {
  assert.equal(membersSubscriptionMeta(subscription({ metadata: null })), null)
})

test('REJECTS another app claiming a different app marker', () => {
  assert.equal(
    membersSubscriptionMeta(subscription({ metadata: { app: 'heroes' } })),
    null
  )
})

test('REJECTS a Members marker missing the account or plan id', () => {
  assert.equal(
    membersSubscriptionMeta(subscription({ metadata: { app: 'members', mem_plan_id: 'p' } })),
    null
  )
  assert.equal(
    membersSubscriptionMeta(subscription({ metadata: { app: 'members', mem_account_id: 'a' } })),
    null
  )
})

test('maps Stripe status onto the three mem_membership_status values', () => {
  assert.equal(toMembershipStatus('active'), 'active')
  assert.equal(toMembershipStatus('trialing'), 'active')
  assert.equal(toMembershipStatus('past_due'), 'past_due')
  assert.equal(toMembershipStatus('unpaid'), 'past_due')
  assert.equal(toMembershipStatus('canceled'), 'cancelled')
  assert.equal(toMembershipStatus('incomplete_expired'), 'cancelled')
  // Unknown/incomplete must NOT be treated as active — the cost of guessing
  // wrong that way is free sessions.
  assert.equal(toMembershipStatus('incomplete'), 'cancelled')
  assert.equal(toMembershipStatus('paused'), 'cancelled')
})

// The trap: current_period_end moved onto the items. Reading the top level
// returns undefined forever, exactly like Heroes' invoice.subscription bug.
test('reads current_period_end from the ITEM (current API shape)', () => {
  assert.equal(currentPeriodEnd(subscription()), new Date(PERIOD_END * 1000).toISOString())
})

test('falls back to the legacy top-level current_period_end', () => {
  const legacy = subscription({ items: { data: [] }, current_period_end: PERIOD_END })
  assert.equal(currentPeriodEnd(legacy), new Date(PERIOD_END * 1000).toISOString())
})

test('returns null rather than a wrong date when neither field is present', () => {
  assert.equal(currentPeriodEnd(subscription({ items: { data: [{}] } })), null)
  assert.equal(currentPeriodEnd(subscription({ items: undefined })), null)
})

// ---------------------------------------------------------------------------
// Weekly slot matching (lib/slot-matching.ts)
//
// Sk8 Skool for Kidz runs Mondays 16:00 and Wednesdays 17:00 at £30 each, so
// the two must not entitle each other. The BST cases are the real reason this
// suite exists: comparing in UTC would make a "Mondays 16:00" slot match for
// half the year and silently stop for the other half.
// ---------------------------------------------------------------------------

const KIDZ = 'offering_kidz'
const MON_1600 = { offering_id: KIDZ, weekday: 1, starts_at_local: '16:00:00' }
const WED_1700 = { offering_id: KIDZ, weekday: 3, starts_at_local: '17:00:00' }
const ANY_SLOT = { offering_id: KIDZ, weekday: null, starts_at_local: null }

test('MATCHES a Monday 16:00 occurrence in BRITISH SUMMER TIME', () => {
  // 2026-08-10 is a Monday. 16:00 UK local in August = 15:00 UTC.
  const occ = { offering_id: KIDZ, starts_at: '2026-08-10T15:00:00Z' }
  assert.deepEqual(localSlotOf(occ.starts_at), { weekday: 1, time: '16:00' })
  assert.equal(slotCoversOccurrence(MON_1600, occ), true)
})

test('MATCHES the same slot in GMT — the case a UTC comparison would break', () => {
  // 2026-12-14 is a Monday. 16:00 UK local in December = 16:00 UTC.
  const occ = { offering_id: KIDZ, starts_at: '2026-12-14T16:00:00Z' }
  assert.deepEqual(localSlotOf(occ.starts_at), { weekday: 1, time: '16:00' })
  assert.equal(slotCoversOccurrence(MON_1600, occ), true)
})

test('a naive UTC read WOULD have got the summer case wrong', () => {
  // Guards the reasoning, not just the result: in BST the UTC hour is 15,
  // so any comparison done in UTC against "16:00" fails.
  const utcHour = new Date('2026-08-10T15:00:00Z').getUTCHours()
  assert.equal(utcHour, 15)
  assert.notEqual(`${utcHour}:00`, '16:00')
})

test('Monday and Wednesday Kidz slots do NOT entitle each other', () => {
  const monday = { offering_id: KIDZ, starts_at: '2026-08-10T15:00:00Z' }
  const wednesday = { offering_id: KIDZ, starts_at: '2026-08-12T16:00:00Z' } // Wed 17:00 BST
  assert.equal(slotCoversOccurrence(WED_1700, wednesday), true)
  assert.equal(slotCoversOccurrence(WED_1700, monday), false)
  assert.equal(slotCoversOccurrence(MON_1600, wednesday), false)
})

test('the right day at the wrong time does not match', () => {
  const mondayLate = { offering_id: KIDZ, starts_at: '2026-08-10T19:30:00Z' } // Mon 20:30 BST
  assert.equal(slotCoversOccurrence(MON_1600, mondayLate), false)
})

test('a NULL slot entitles every occurrence of its offering', () => {
  assert.equal(slotCoversOccurrence(ANY_SLOT, { offering_id: KIDZ, starts_at: '2026-08-10T15:00:00Z' }), true)
  assert.equal(slotCoversOccurrence(ANY_SLOT, { offering_id: KIDZ, starts_at: '2026-12-14T16:00:00Z' }), true)
})

test('a slot never matches a different offering, even at the same day and time', () => {
  const other = { offering_id: 'offering_synkron8', starts_at: '2026-08-10T15:00:00Z' }
  assert.equal(slotCoversOccurrence(MON_1600, other), false)
  assert.equal(slotCoversOccurrence(ANY_SLOT, other), false)
})
