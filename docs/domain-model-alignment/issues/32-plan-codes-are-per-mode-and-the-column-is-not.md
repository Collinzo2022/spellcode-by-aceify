# 32: Paystack plan codes are per-mode; `plans.paystack_plan_code` is a single column

**Status:** open, written 2026-09-28 after the operator created the plan objects in Paystack's **live**
mode. **Part operator, part design decision.** Not a code defect today — it is a cutover hazard, and
it is the third instance of the failure shape tickets 28 and 30 each cost hours to.

## What happened

Live-mode webhook set, and the plan objects created in live mode. Neither reached the application.
Read from the live database immediately afterwards:

| `code` | `interval` | `is_active` | `paystack_plan_code` |
|---|---|---|---|
| `full-access-one-time` | `one_time` | `true` | `null` |
| `full-access-3-month` | `monthly` | **`false`** | **`null`** |
| `full-access-6-month` | `monthly` | **`false`** | **`null`** |

**Creating a plan at Paystack does not write back.** The two installment plans remain unsellable, and
they fail at two separate guards in `initializeCheckout`:

- `if (!plan?.is_active) throw "This access plan is not available right now."`
- `if (plan.interval !== "one_time" && !plan.paystack_plan_code) throw "This installment plan is not configured yet."`

The `is_active` guard sits immediately above the plan-code guard, so today an installment checkout is
refused by the first and never reaches the second.

**Cited here by symbol and thrown message, not by line number, and deliberately.** This ticket
originally carried `server/paystack.ts:45` and `:46`. Ticket 34's commit `a7383dc` then moved
`initializeCheckout` by roughly 34 lines, and the citations were wrong from that moment — wrong in
this file, and wrong again everywhere they had been copied, including into an operator wizard's
warnings about a cutover that moves money. A symbol and a string survive a refactor; a line number
does not. **Do not re-introduce line numbers here.**

Both guards are correct. They are doing their job; nothing has told them the plans now exist.

**There is an operator path and it does not need SQL.** `billing.updatePlan`
(`server/routers/billing.ts:26`) is an `adminProcedure` taking `paystackPlanCode`, `isActive` and
`amountMinor` together, and it patches by `code`. Use it rather than PostgREST by hand.

## The hazard, which is structural rather than operational

**A Paystack plan object exists in exactly one mode.** Creating `full-access-3-month` in test mode and
again in live mode yields **two different `PLN_…` codes**. The column that holds it has no mode
dimension:

```
plans.paystack_plan_code  text | null   -- one column, one value
```

It is read in three places, and the second and third are the dangerous ones:

1. **`buildPaystackInitializePayload`** — `payload.plan = input.plan.paystack_plan_code` when
   initializing an installment checkout. Wrong-mode code here fails loudly at Paystack, which is
   survivable.
2. **`findOrCreateRecurringPayment`** — looks the plan **up by** `paystack_plan_code=eq.{planCode}`
   from the incoming webhook. No match → `return null`.
3. **`updateSubscriptionLifecycle`** — does the same lookup. No match → a bare `return`.

(All three in `server/paystack.ts`, named by function for the reason given above.)

So whichever mode's code is stored is the mode that works, **and the other fails silently**: a
recurring charge succeeds at Paystack, the webhook arrives, is verified, finds no plan, and is
dropped without a record. Money moves and the application says nothing.

**That is ticket 28's shape for the third time** — a payment event with nowhere to land — except it
cannot be caught by testing, because exercising it requires being in the mode that is broken.

## Why this is not urgent today

`full-access-one-time` is `interval: "one_time"`, and `buildPaystackInitializePayload:37` takes the
`one_time` branch, which **never sends `plan`**. The one-time plan does not use `paystack_plan_code`
at all — which is why stage 10 passed, and why the column being `null` has cost nothing so far.

Both installment plans are `is_active: false`, so `:45` refuses them before `:46` is reached. Nothing
can currently hit the hazard. It arrives the moment installments are switched on.

## The cutover is three things, not two

The handoff and the launch checklist treat going live as "Render on live keys" plus "the live webhook
set". **It is three**, and the third is invisible:

1. Render's `PAYSTACK_SECRET_KEY` and the client's public key → live.
2. The live-mode Webhook URL set, **on the business confirmed by the `963cdeab` test** (ticket 30).
   **Done 2026-09-28.**
3. **`plans.paystack_plan_code` → the live plan codes**, via `billing.updatePlan`, at the same time.

Move 1 and 2 without 3 and installment checkouts break at `:46`. Move 3 early, while Render still
holds test keys, and any test-mode installment work breaks instead. **They have to move together**,
which is precisely the kind of coupling that has failed twice already in this project when it was
left implicit.

## The open question — **settled 2026-09-28, ADR 0004**

**Should the column carry both modes? No.** Mode is a property of the **environment**, not of the
domain: SpellCode keeps one production world and it is the live one. The column stays single and is
patched at cutover. Exercising the payment path after launch means a **separate database**, not a
second column.

The three options were: leave it single and flip at cutover (**chosen**); two columns, one per mode;
or look the plan up at Paystack by name. ADR 0004 records why the two-column option was rejected —
briefly, its purpose is to let test and live coexist against one database, and that is what put an
unpaid `active` Subscription into production.

### What the question turned up, which was worse than the question

**The database cannot tell a test charge from a real one.** `payment_transactions` has no mode
column — checked: `provider`, `paystack_reference`, `paystack_transaction_id`, `amount_minor`,
`currency`, `status`, `paid_at`, `provider_payload`, and nothing else. Paystack persists the
distinction as `"domain":"test"`; the application discards it.

Production currently holds:

```
user 5499b299…   subscription active   installments_paid 1/1   created 2026-09-27T19:01
```

That is switch stage 10 — **Full Access granted by a test card**, indistinguishable in the data from
a Learner who paid. `CONTEXT.md` had already ruled on this without anyone noticing: a **Payment** is
"a single verified money movement", so by the project's own glossary that row is not a Payment.

**Decided: the row stays**, recorded here rather than deleted, because it is the owner's own stage 10
account and deleting it would erase the evidence that stage 10 passed. **It must be excluded from any
revenue figure**, and with no mode column that exclusion is by `user_id`, by hand. `adminLearnerBilling`
(`server/routers/billing.ts:30`) reports `latest_payment_amount_minor` across all Learners and will
include it.

`CONTEXT.md` gained **Test Charge** for this, and sharpened **Payment** to say the money is what makes
it one.

## Done when

- [ ] The live plan codes are recorded somewhere durable — this file or the handoff — so a cutover
      does not depend on someone reopening the Paystack dashboard. **Still open**; the plans exist in
      Paystack's live mode, and their `PLN_…` codes have not been written down anywhere.
- [x] The question above is decided and, if it changes the schema, recorded as an ADR. **ADR 0004**,
      accepted 2026-09-28. It changes no schema, which is the decision.
- [x] The launch checklist says the cutover is **three** coupled changes, not two.
- [ ] Installments are either switched on with the live codes in place, or **deliberately withheld**
      and recorded as withheld.

**What remains here is operator work, not design.** Fetch the two live `PLN_…` codes from the
Paystack dashboard in live mode, record them, and apply them with `billing.updatePlan` — at cutover,
together with the keys, not before.

## Related

- **Ticket 28** — the empty Test Webhook URL. Same shape: a configuration field nobody had looked at,
  failing silently on the payment path.
- **Ticket 30** — two Paystack businesses. Its lesson, "establish which copy you are looking at",
  applies here with *mode* in place of *business*.
- **Ticket 31** — three Supabase projects. The counting lesson.
- **Ticket 29**, the reconciliation sweep. It would **not** catch this: it sweeps
  `payment_transactions` rows, and a dropped recurring webhook never creates one. Worth knowing
  before anyone treats 29 as the general safety net — it backstops checkout, not renewal.

No secrets appear in this file. `PLN_…` plan codes are public identifiers, and none is recorded here
yet.
