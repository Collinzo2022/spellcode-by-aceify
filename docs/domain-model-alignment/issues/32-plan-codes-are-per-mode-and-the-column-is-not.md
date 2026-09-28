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

- `server/paystack.ts:45` — `if (!plan?.is_active) throw "This access plan is not available right now."`
- `server/paystack.ts:46` — `if (plan.interval !== "one_time" && !plan.paystack_plan_code) throw "This installment plan is not configured yet."`

Both are correct. They are doing their job; nothing has told them the plans now exist.

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

1. **`server/paystack.ts:38`** — `payload.plan = input.plan.paystack_plan_code` when initializing an
   installment checkout. Wrong-mode code here fails loudly at Paystack, which is survivable.
2. **`server/paystack.ts:97`** — `findOrCreateRecurringPayment` looks the plan **up by**
   `paystack_plan_code=eq.{planCode}` from the incoming webhook. No match → `return null` (`:99`).
3. **`server/paystack.ts:117`** — the subscription sync does the same. No match → `return` (`:119`).

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

## The open question, which is the user's

**Should the column carry both modes?** Three answers, and the decision belongs to the owner:

- **Leave it single and flip it at cutover.** Cheapest, and correct if test-mode installment testing
  is never wanted again. It makes the cutover irreversible in practice: going back to test means
  editing the column back.
- **Two columns** (`paystack_plan_code_test`, `paystack_plan_code_live`), chosen by the mode the
  secret key is in. Honest about the domain — a plan genuinely has two identities — and it makes the
  three-way cutover a one-way switch instead. Costs a migration and touches all three read sites.
- **Derive it at Paystack** rather than storing it, looking the plan up by name. Removes the column
  but adds a network call to a hot path and a new failure mode.

**This is a `CONTEXT.md` question as much as a schema one**: the domain currently says a Plan *has a*
Paystack plan code, and the truth is it has one **per mode**. `domain-modeling` is the skill for
settling that, and the decision is hard to reverse once installments are sold, which makes it ADR
material.

## Done when

- [ ] The live plan codes are recorded somewhere durable — this file or the handoff — so a cutover
      does not depend on someone reopening the Paystack dashboard.
- [ ] The question above is decided and, if it changes the schema, recorded as an ADR.
- [ ] The launch checklist says the cutover is **three** coupled changes, not two.
- [ ] Installments are either switched on with the live codes in place, or **deliberately withheld**
      and recorded as withheld.

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
