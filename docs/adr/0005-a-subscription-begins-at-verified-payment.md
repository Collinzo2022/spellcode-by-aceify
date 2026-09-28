# 5. A Subscription begins at verified payment

Date: 2026-09-28

## Status

Accepted

## Context

`initializeCheckout` wrote two rows when a Learner was sent to Paystack: a payment record, and a
Subscription with status `pending`. The same function then refused to start a checkout when a
Subscription existed in `pending`, `active` or `past_due`:

```ts
const existingAccess = await supabaseAdminRequest(`…&status=in.(pending,active,past_due)&…`);
if (existingAccess.length > 0) throw new Error(existingAccess[0].status === "pending"
  ? "A payment for this plan is already in progress."
  : "You already have access through this plan.");
```

Nothing ever cleared a `pending` row. There was no expiry, no sweep, and no path back. **So every
Learner who opened the Paystack page and closed the tab was permanently barred from buying that
plan** — by a row written before any money moved, on their behalf, recording that they had begun.
The refusal even told them the truth: a payment was in progress, forever.

`CONTEXT.md` had already ruled on this without anyone noticing:

> **Subscription** — a Learner's holding of a Plan, with a status and validity period.

A Learner who changed their mind holds nothing. The row recorded an *intention*, and the word for an
intention is not Subscription. The glossary was right and the code disagreed with it; the lockout is
what that disagreement cost.

Ticket 29 proposed sweeping up `pending` rows on a timer. That treats the symptom: a row that must
be cleaned up should not have been written.

## Decision

**A Subscription begins at verified payment.** Nothing creates one before the money is confirmed.

- `initializeCheckout` writes the payment record and nothing else. The attempt is a Payment
  transaction in `initialized`, which is exactly what it is.
- `recordVerifiedPayment` already created a Subscription when none existed. That branch now carries
  every Learner's first payment rather than being the rare one, so it is covered by a test of its
  own.
- **The guard splits, because it was answering two questions with one row.** They are now two
  questions against two tables:
  - *Do you already have access?* A Subscription in `active` or `past_due` → "You already have
    access through this plan."
  - *Are you mid-payment?* A payment record in `initialized`, created within the cutoff → "A payment
    for this plan is already in progress."
- **The in-progress guard is bounded by age.** `ABANDONED_CHECKOUT_CUTOFF_MS` is two hours, defined
  once in `server/paystack.ts` and read both by this guard and by the reconciliation sweep that
  declares a dead checkout dead. An attempt older than the cutoff stops blocking whether or not
  anything has swept it, **so a sleeping server cannot lock anyone out.** If the guard held on
  longer than the sweep, this ADR's own failure would come back.
- **The in-progress state is `initialized` alone**, deliberately narrower than the unsettled set
  ticket 33 defined. That set answers "could this still become `success`?", which `abandoned` and
  `failed` can. This one answers "is the Learner paying right now?", which they are not — and a
  declined card is the commonest reason anyone starts over.

Nothing needs migrating. Production held zero `pending` Subscriptions when this was decided; the two
historic ones were cancelled and the third is `active`.

## Consequences

**An abandoned checkout costs nothing.** It leaves one payment row in `initialized`, which ticket
35's sweep resolves into Paystack's own outcome. Until then it blocks for two hours and then stops.

**Two refusals a Learner can act on.** "You already have access" and "a payment is in progress" are
now distinguishable and both true, where before the second was shown to people who had neither.

**A brief double-payment window remains, by choice.** Two checkouts started inside the same moment
can both reach `initialized`; the guard reads committed rows and does not lock. A Learner who pays
both gets two installments credited on one plan, which is a bounded overcount in their favour, not a
lockout. Removing it would need a uniqueness constraint over live attempts, which would reintroduce
a row that has to be cleaned up — the thing this ADR exists to stop.

**The Plan snapshot moved with the write.** The deleted checkout write recorded
`plan_snapshot: { plan_code }` because it had the Plan in hand. The create-if-missing branch starts
from a payment row instead, so it fetches the code and snapshots it there. Nothing reads that column
yet, which is why dropping it would have been a silent loss rather than a failure.

**A Subscription's `created_at` now means something.** It is when the Learner's holding began, not
when they first clicked. Any report reading it as intent-to-buy is wrong from here on.

**`pending` remains in the `subscription_state` enum** and in `recordVerifiedPayment`'s lookup, so a
row predating this decision is credited rather than duplicated. Nothing writes it. When the state is
dropped from the database it should go from that filter too.

## Alternatives considered

**Expire `pending` rows on a timer** (ticket 29's proposal). It would have ended the permanent
lockout, but every Learner would still be barred for the length of the timer by a row recording
something they did not do, and the cleanup would be load-bearing forever: a run that failed would
restore the lockout. Rejected — the write is the defect.

**Keep the row and rename the state**, `attempting` or `intent`. Honest about what the row is, and
`CONTEXT.md` would gain a word for it. Rejected because the row still has no owner and no clearer:
nothing needs it. The payment record already carries the attempt, with a reference and a timestamp.

**Keep the single combined guard, reading only the payment table.** Fewer queries. Rejected because
the two questions have different right answers and a Learner needs to know which one they hit;
collapsing them is how "a payment is in progress" ended up being shown to people whose only payment
was one they abandoned weeks earlier.
