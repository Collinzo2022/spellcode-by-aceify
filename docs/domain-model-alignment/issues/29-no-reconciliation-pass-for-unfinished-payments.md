# 29: nothing ever looks again at a payment that did not complete

**Status:** open, written 2026-09-25 out of ticket 28. **Buildable** — the design questions below are
narrow and the seam already exists. Blocked by nothing in code. It is *not* the fix for 28, which is
operator configuration; this is the safety net whose absence let 28 stay invisible for seven hours.

A `payment_transactions` row reaches `status: "initialized"` at checkout and is moved off it by
exactly two things. **Both failed on 2026-09-25, independently, and nothing else was watching.**

## The evidence

Reference `spellcode-5a09dd9d-21fc-4268-bc50-a71fda2a734e`, ₦120,000, `success` at Paystack
03:44:07Z. In the application at 10:30Z: `payment_transactions.status = "initialized"`,
`paid_at: null`; `subscriptions.status = "pending"`, `installments_paid: 0`. Seven hours. No alert,
no log line, no report. It was found because someone happened to query Paystack's transaction list
while preparing an unrelated test.

## The two nets, and why each has a hole

**Net 1 — the webhook.** `registerPaystackWebhook` (`server/paystack.ts:128`) handles
`charge.success` and calls `recordVerifiedPayment`. It never fired because Paystack's Test Webhook
URL was empty (ticket 28). **A correctly-written handler is worthless if the sender was never told
where to send.** No code change in this repository could have prevented that, which is the whole
argument for this ticket.

**Net 2 — the return leg.** `PaymentComplete.tsx:12` calls `billing.verifyCheckout` once, in a
`useEffect` on mount, guarded by a `started` flag. That is **one attempt, ever**. It also requires a
live session: `verifyCheckout` is a `protectedProcedure` (`server/routers/billing.ts:24`), so an
expired token makes it a 401 — which is precisely the condition ticket 27 existed to fix and which
was live in production until 03:33Z that morning.

Its failure branch renders *"Your payment may still be processing. Please return to this page in a
moment"* — copy that promises a retry the code does not perform. Returning to the page only helps
because a remount re-fires the effect; a Learner who closes the tab has no path back at all, since
the `?reference=` query parameter is the only thing that identifies the transaction and it exists
nowhere else in the UI.

**Neither net is server-initiated.** Both wait to be triggered from outside. Grep confirms the
repository has **no scheduler of any kind** — no `node-cron`, no `setInterval`, nothing in
`package.json`. Nothing re-examines an `initialized` row, ever.

## The second defect this exposes, which may matter more

**An unreconciled checkout permanently locks the Learner out of that plan.**

`initializeCheckout` refuses to start when a subscription already exists in
`status=in.(pending,active,past_due)` (`server/paystack.ts:48-49`), throwing *"A payment for this
plan is already in progress."* The `pending` subscription row is written at initialization
(`:53`), and **nothing ever clears it.**

So every abandoned checkout — the Learner who opens Paystack and changes their mind — leaves a
`pending` row that blocks them from ever buying that plan again. There is no expiry and no cleanup
path. This is not hypothetical: it is blocking the project owner's own account right now, which is
how it was found.

That makes the sweep's *abandoned* branch load-bearing rather than tidy-up. It is arguably a
separate defect, but it cannot be fixed without deciding the same question — when is an
`initialized` row dead? — so it belongs here.

## What to build

A server-side reconciliation pass that asks Paystack about every `initialized` row and resolves it
one way or the other.

**Reuse `recordVerifiedPayment` (`server/paystack.ts:69`). Do not write a third write path.** It is
already shared by the webhook (`:143`) and `verifyCheckout` (`:65`), it already handles the
subscription patch and the create-if-missing case, and a payment reconciled by sweep must land
identically to one reconciled by webhook. Anything else guarantees drift.

The one refactor needed: **`verifyCheckout` bundles authorization with verification.** Its
ownership check (`:62`, `payment.user_id !== expectedUserId`) is right for a browser call and wrong
for a sweep, which has no user. Split it — a function taking a `PaymentRecord`, calling
`/transaction/verify/{reference}`, and delegating to `recordVerifiedPayment`; with `verifyCheckout`
keeping the ownership check and calling that. The sweep calls it directly.

Per row, one `GET /transaction/verify/{reference}`, then:

- **`success`** and amount and currency match → `recordVerifiedPayment`. The Learner gets what they
  paid for.
- **`success` but amount or currency mismatched** → do **not** grant. Flag it loudly for a human.
  `verifyCheckout:64` already refuses this case; the sweep must not be more permissive than the
  path it is backstopping.
- **`abandoned` / `failed`, and older than the cutoff** → move the payment to a terminal status and
  **release the `pending` subscription**, so the Learner can try again.

## The concurrency hazard, which must be designed for rather than discovered

`recordVerifiedPayment` guards with `if (payment.status === "success") return;` (`:70`) — a read in
the caller, then an unconditional `PATCH`. That is a check-then-act with no database-side condition.
Today only one writer exists in practice; **this ticket adds a second that runs on a timer**, so the
sweep and a webhook delivery can interleave on the same row.

For `one_time` the damage is contained: `installmentsPaid` is `Math.min(installmentsDue, paid + 1)`
(`:78`) with `due = 1`, so a double run still yields 1. **For an installment plan it double-counts**,
advancing `installments_paid` twice for one payment.

Make the transition conditional at the database instead: add `&status=eq.initialized` to the
`payment_transactions` PATCH filter (`:71`), ask for the representation back, and treat zero rows as
"another writer won — stop here" rather than continuing into the subscription patch. That is a
one-line change to existing code and it is the correct fix for the existing path too, not only for
the sweep.

## Open questions, which are the user's

1. **How does the sweep run?** No scheduler exists. The options are a Render cron job, an
   authenticated admin endpoint triggered externally, or an interval started at boot. **An interval
   is the weakest** — the launch checklist already carries "a Render instance that does not sleep",
   and a sweep that only runs while someone happens to be using the site cannot be relied on for the
   case where nobody is. Settle this before writing code; it decides where the entry point lives.
2. **What is the cutoff for "dead"?** It must clear Paystack's own retry behaviour and a slow
   Learner. Somewhere between 30 minutes and a few hours for the *abandoned* branch; the *success*
   branch should sweep far more eagerly, since a paid Learner is waiting. **These are probably two
   different intervals**, and treating them as one is the easy mistake.
3. **Does a mismatch or a repeated failure need to reach a human, and how?** There is no alerting in
   this project at all. "Log it" is an acceptable answer, but it should be a decision rather than a
   default.

## Proving it

Mutation testing applies cleanly; the sweep is pure enough to test against a stubbed Paystack.

- A row `initialized` whose reference verifies `success` becomes `success`, with the subscription
  `active`. Remove the `recordVerifiedPayment` call and this fails.
- A row whose reference verifies `success` with a **mismatched amount** is *not* granted. Delete the
  amount comparison and this fails.
- A row past the cutoff verifying `abandoned` releases the `pending` subscription; a row **inside**
  the cutoff is left alone. Collapse the two cutoffs into one and one of these fails.
- **The concurrency guard:** a row already `success` produces no second subscription write. Remove
  the `&status=eq.initialized` filter and, with the PATCH stubbed to report zero rows affected, this
  fails.
- Something covering "a Learner whose checkout is reconciled by sweep ends in the same state as one
  reconciled by webhook" is worth more than all of the above, if the seam allows it.

Tests live under `server/**` (`AGENTS.md`), which suits this ticket — it is entirely server-side.

## Not to be confused with

- **Ticket 28**, the single orphaned ₦120,000 row and the unset dashboard field. That one is
  operator work and needs no code. **This ticket would have caught it**; it does not replace it, and
  building this does not reconcile that row — the sweep is not to be used as a covert way of
  resolving 28 without the explicit decision 28 asks for.
- **Ticket 27**, sessions expiring. It is why net 2 failed rather than merely being single-shot, and
  it is fixed. A fixed net 2 is still one attempt requiring an open tab.

**Blocked by:** nothing. Worth sequencing after stage 10 passes, so the sweep is written against a
payment path known to work end to end rather than one that has never once completed.
