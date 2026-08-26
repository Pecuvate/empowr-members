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

const PERIOD_END = 1780054288 // 2026-05-29T18:11:28Z

function subscription(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sub_test',
    status: 'active',
    metadata: {
      app: 'members',
      mem_account_id: 'acc_1',
      mem_plan_id: 'plan_1',
    },
    items: { data: [{ current_period_end: PERIOD_END }] },
    ...overrides,
  } as unknown as Stripe.Subscription
}

test('IDENTIFIES a Members subscription from its metadata', () => {
  assert.deepEqual(membersSubscriptionMeta(subscription()), {
    accountId: 'acc_1',
    planId: 'plan_1',
  })
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
