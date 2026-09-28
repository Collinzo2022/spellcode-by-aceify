# 29: nothing ever looks again at a payment that did not complete

**Status:** **parent ticket, grilled and split 2026-09-28.** Do not implement this file. The work is
**tickets 33, 34 and 35**, and this one stays as the evidence and the argument behind them.

| | | |
|---|---|---|
| **33** | A payment transition is conditional at the database | no blockers |
| **34** | A Subscription begins at verified payment, not at checkout | no blockers |
| **35** | An unfinished payment is resolved without anyone watching | blocked by 33 and 34 |

**The three open questions at the foot of this file are answered**, by a grilling session on
2026-09-28. In short: the sweep runs as a **secret-guarded endpoint called by a schedule committed to
this repository**, because the host sleeps and a dashboard-held schedule is the failure shape of
tickets 28, 30 and 31. The cutoffs are **every run for a success, two hours for a death**, and that
same two hours defines when a checkout stops blocking a retry. A mismatch or an unrecognised answer
is **recorded on the payment row**, because this host loses its logs on restart.

**The grilling changed the shape of the fix, not just its details.** This ticket proposed sweeping up
`pending` Subscriptions left by abandoned checkouts. Ticket 34 stops creating them instead — the
lockout described below is a symptom of writing a Subscription before any money moves, which
`CONTEXT.md` never said was a Subscription. So **35's abandoned branch has nothing to release**, and
the sweep is smaller than this file imagines.

Written 2026-09-25 out of ticket 28. It is *not* the fix for 28, which was operator configuration;
this is the safety net whose absence let 28 stay invisible for seven hours.

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

## Open questions — **all three answered 2026-09-28**, see ticket 35

1. ~~**How does the sweep run?**~~ **A secret-guarded endpoint under `/api/scheduled/`, called every
   ten minutes by a workflow committed to this repository.** A boot interval is not merely weakest,
   it is inert: the host sleeps when idle, so nothing started at boot is running to fire. The host's
   own cron needs a paid plan. An in-repo schedule was chosen over a third-party pinger with better
   timing because a setting nobody can see from the code is exactly what tickets 28, 30 and 31 each
   were. **It is not a keep-alive**; the non-sleeping instance stays a separate launch item.
2. ~~**What is the cutoff for "dead"?**~~ **Two, as this ticket suspected.** Successes sweep on every
   run with no age filter; deaths wait **two hours**. That same two hours is what ticket 34's
   in-progress guard uses, defined once, so the guard and the sweep cannot disagree about when an
   attempt is dead.
3. ~~**Does a mismatch need to reach a human, and how?**~~ **Recorded on the payment row**, following
   the pattern already used for webhook processing errors. "Log it" was rejected on a fact rather
   than a preference: this host keeps logs briefly and loses them on restart, so a log line recreates
   the invisibility that made this ticket necessary.

**One correction to this file's premise.** There *is* a scheduler in the tree —
`server/_core/heartbeat.ts`, a complete cron client with `/api/scheduled/` callback paths. **Nothing
imports it and it is unusable**: it calls the Manus Forge API, which this project is migrating off.
The claim below that the repository has "no scheduler of any kind" is true in effect and misleading
to anyone who greps. Ticket 35 keeps the `/api/scheduled/` prefix so the convention survives the
code that documented it.

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
