# 4. Payment mode is a property of the environment, not of the domain

Date: 2026-09-28

## Status

Accepted

## Context

Paystack runs every integration in two modes, test and live, and they are near-total mirrors: separate
keys, separate webhook URL fields, separate transaction histories, and **separate plan objects**. The
same plan created in both modes has two different `PLN_…` codes.

`plans.paystack_plan_code` is one column with no mode dimension. It is read in three places:

```ts
payload.plan = input.plan.paystack_plan_code;                        // paystack.ts:38, outgoing
`/rest/v1/plans?paystack_plan_code=eq.${planCode}&select=…`           // paystack.ts:97, incoming
`/rest/v1/plans?paystack_plan_code=eq.${planCode}&select=…`           // paystack.ts:117, incoming
```

The first fails loudly against the wrong mode. The second and third fail **silently**: a recurring
charge succeeds, the webhook arrives and verifies, no plan matches, and the handler returns without
writing anything. Money moves and the application records nothing — the same shape as the empty Test
Webhook URL that cost seven hours on 2026-09-25 (ticket 28).

The obvious remedy is a second column, one code per mode, so the application works in both modes
against one database. Pursuing it surfaced the real problem.

**The database cannot tell a test charge from a real one.** `payment_transactions` carries `provider`,
`paystack_reference`, `paystack_transaction_id`, `amount_minor`, `currency`, `status`, `paid_at` and a
free-form `provider_payload`. None of them records the mode. Paystack knows — it returns
`"domain":"test"` on every transaction, which is how the orphaned ₦120,000 was established as test
money (ticket 30) — and nothing persists it.

This is not hypothetical. Production holds an `active` Subscription, `installments_paid` 1 of 1, won
with Paystack's test card during switch stage 10 on 2026-09-27. That Learner holds Full Access, and
no column distinguishes them from someone who paid.

So a second column would not be a neutral convenience. Its purpose is to make running test mode
against the production database easy, and every such run writes a `success` Payment and an `active`
Subscription indistinguishable from a real one. `adminLearnerBilling` reports
`latest_payment_amount_minor` across all Learners, so each one silently inflates revenue, and the only
way to clean up afterwards is to ask Paystack about each reference individually.

`CONTEXT.md` had already taken a position without anyone noticing: **Payment** was defined as "a single
verified money movement". By that definition a test charge is not a Payment at all, and storing both
modes' plan codes would institutionalise the opposite.

## Decision

**Mode is a property of the environment, not of the domain.** SpellCode keeps one production world and
it is the live one.

- `plans.paystack_plan_code` stays a **single column**, holding the code for whichever mode the
  environment's Paystack secret key is in.
- Going live is **three coupled changes** applied together: the secret and public keys to live, the
  live-mode Webhook URL set, and `plans.paystack_plan_code` patched to the live plan codes via
  `billing.updatePlan`. Any two without the third breaks installments.
- After cutover, exercising the payment path means a **separate database**, not a separate column.
- No mode column is added to `payment_transactions`. A Payment in production is real by construction,
  because production is only ever in live mode.

`CONTEXT.md` gains **Test Charge** as the word for what a test-mode charge is, so the distinction has
a name rather than being implied by the absence of one.

## Consequences

**The cutover becomes one-way in practice.** Returning to test mode means editing the plan codes back,
and anyone doing so should treat it as reconfiguring the environment rather than flipping a switch.
That friction is the point: it is a barrier in front of writing test rows into production.

**Installment plans cannot be exercised end to end in production before launch.** They will be switched
on with live codes and proven with a live-money test (already on the launch checklist), or deliberately
withheld. There is no third option where they are tested with a test card against production, and that
is deliberate.

**Testing the payment path after launch requires infrastructure that does not exist yet** — a second
Supabase project and a second Render service on test keys. Nothing needs it today, and this ADR is the
record of why it will be needed the first time someone wants to change billing code after launch.

**The existing test-money Subscription stays**, recorded as what it is rather than deleted, so nobody
later reads it as the first customer. It is the project owner's own stage 10 account. Any revenue
figure must exclude it, and the absence of a mode column means that exclusion is by `user_id` and by
hand — the clearest possible argument for the rule this ADR sets.

**The three silent read sites remain silent.** This decision removes the circumstance rather than the
failure mode: with one mode ever in play, `paystack.ts:97` and `:117` cannot miss on a mode mismatch.
They can still miss on an unconfigured plan, which `initializeCheckout:46` guards on the outgoing path
and nothing guards on the incoming one.

## Alternatives considered

**Two columns, `paystack_plan_code_test` and `paystack_plan_code_live`**, selected by the mode of the
secret key. Honest about the provider's shape, and it turns a three-part cutover into a one-part
switch. Rejected because its purpose is to make test and live coexist against one database, which is
exactly the thing that put an unpaid `active` Subscription into production, and because it treats mode
as a property of a Plan when it is a property of the world the application is running in.

**A mode column on `payment_transactions`**, persisting Paystack's `domain` field, with reports
filtering on it. This is the honest version of the two-column option and would have made the existing
test row self-describing. Rejected as the *primary* decision because recording the mode legitimises
mixing modes; the aim is that production never contains a Test Charge, not that it labels them well.
Worth revisiting if the separate test environment above is ever built, since a mislabelled row is then
the failure to defend against.

**Look the plan up at Paystack by name** instead of storing a code, making the application
mode-agnostic by construction. Rejected: it puts a network call on the checkout path, adds a failure
mode to a path that already has too many, and makes plan naming load-bearing in a way nothing else is.
