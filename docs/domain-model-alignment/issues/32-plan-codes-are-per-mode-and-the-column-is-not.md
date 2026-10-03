# 32: Paystack plan codes are per-mode; `plans.paystack_plan_code` is a single column

**Status:** open, written 2026-09-28 after the operator created the plan objects in Paystack's **live**
mode. **Part operator, part design decision.** Not a code defect today — it is a cutover hazard, and
it is the third instance of the failure shape tickets 28 and 30 each cost hours to.

**Amended 2026-10-03: the engineering half is done; the cutover is untouched and still blocked.**
"Not a code defect today" was true of the hazard and wrong about the handler — a webhook that landed
nowhere was marked `processed_at` with no error, indistinguishable from one that granted access. See
the 2026-10-03 entry under `## Comments`. The cutover **must not be attempted before stage 7's success path is
proved**, because ADR 0004 ends test-mode checkout against production: *"There is no third option
where they are tested with a test card against production."* The two installment plan codes are still
not written down, and reading them needs the Paystack dashboard in **live** mode — the repository's
keys are `sk_test_`/`pk_test_`, and Paystack's `/plan` endpoint only returns the plans of its key's
mode, so no agent can fetch them from here.

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

## Comments

### 2026-10-03 — the silent drop is closed; the cutover is not touched

**ADR 0004 left the failure mode open on purpose and said so**: *"This decision removes the
circumstance rather than the failure mode… They can still miss on an unconfigured plan, which
`initializeCheckout` guards on the outgoing path and nothing guards on the incoming one."* That gap
is now closed on the plan lookups, and it turned out to be worse than "silent".

**A dropped event was recorded as handled.** The route stores every event body before any branch
runs, which reads like a safety net. It then patches `processed_at` after the branches — so an event
whose plan lookup missed was stored with `processed_at` set and `processing_error: null`, **the same
row a successfully handled event leaves.** `processed_at` is the first column anyone auditing the
payment path reads, and it was answering "did we handle this?" with a confident yes.

The plan lookups now throw, which puts the reason in `processing_error`, leaves `processed_at` unset,
and answers non-200 so the drop shows in **Paystack's own webhook log** as well — a second place a
human looks, needing no database access. The message is built by `unappliedEventMessage` and **names
the plan code**, because comparing it against the stored `plans.paystack_plan_code` is the whole
diagnosis; "plan not found" would send the reader back to the dashboard to guess.

**Seven early exits, three now throw, four left alone**, and one of those four is a correction to an
earlier draft of this change:

- `findOrCreateRecurringPayment`'s `!plan` and `updateSubscriptionLifecycle`'s `!plan` — **throw**.
  These are the ticket's read sites 2 and 3, the two it calls "the dangerous ones".
- `findOrCreateRecurringPayment`'s `!subscription` — **throws**. Reaching it means a charge arrived
  whose reference has no payment row, which is a renewal rather than a first payment, so the
  Subscription it renews must already exist. Money has moved.
- `updateSubscriptionLifecycle`'s `!subscription` — **returns, and an earlier draft of this change
  wrongly threw here.** Since ticket 34 a checkout writes no Subscription (`recordVerifiedPayment`
  does, on `charge.success`), so a `subscription.create` that outruns the charge finds nothing, and
  that is **the ordinary first-installment interleaving, not a fault**. Throwing would have answered
  500 on the happy path of every installment plan — the plans this ticket exists to switch on. Caught
  by the Spec axis of `/code-review`, which read the repo's own fixture comment: `present: false`
  *"models a Learner whose first payment is landing, the path every checkout takes since ticket 34"*.
  Two tests now pin the asymmetry from both sides.
- `updateSubscriptionLifecycle`'s `!customerCode || !planCode` and `findOrCreateRecurringPayment`'s
  `!reference` — **return**. An event with no plan code is one this application has no branch for,
  which is ordinary traffic; ticket 25's connectivity probe is exactly that shape and is deliberately
  still in production.

**A remainder, named rather than fixed:** `findOrCreateRecurringPayment`'s
`!planCode || (!customerCode && !userId)` still returns `null`, so a `charge.success` taking it is
marked processed and answered 200 — the original defect shape, for a one-time charge whose payment row
is missing. It is left alone deliberately: widening the throw is what produced the mistake corrected
above, and this exit needs evidence about which real events reach it before anything throws there.

**The retry consequence is accepted, not overlooked.** Paystack retries a non-200, and a retry cannot
succeed until someone configures the plan, so an unconfigured plan now produces repeated visible
failures. That is the trade: noise that is visible, in exchange for a silence that is not — and the
retry succeeds on its own the moment the column is patched. The `processed_at` patch now also clears
`processing_error`, so a self-healed event reads as handled and nothing else rather than carrying both
columns at once; a test covers the retry.

**No migration.** `paystack_webhook_events.processing_error` already existed, written only from the
route's `catch` until now. This matters, because the migration half of this ticket is the blocked
half.

Nine tests in `server/paystack.webhook.test.ts`, under "Paystack webhook events that land nowhere".
Three assert the paths that must **not** be disturbed — the handled charge, the deliberately ignored
event, and the lifecycle event that outran its charge — because distinguishability has to be pinned
from both directions. `tsc --noEmit` clean.

**This is engineering, and it does not advance the cutover.** All three `Done when` boxes are
unchanged. The cutover **must not be attempted before stage 7's success path is proved**: ADR 0004
ends test-mode checkout against production.
