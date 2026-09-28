# 35: an unfinished payment is resolved without anyone watching

**Status:** done 2026-09-28 in code and tests. **Two pieces of operator work stand between this and
working in production** — run the migration, create the two secrets — and until they are done the
sweep is committed but not running. See Comments.

**Blocked by:** 33 (conditional payment transition), 34 (a Subscription begins at verified payment).

Written 2026-09-28 out of the ticket 29 grilling, which settled the three questions ticket 29 left
open. **Ticket 29 is the parent** and holds the evidence for why this is needed; this ticket is the
design that came out of grilling it.

## What to build

A payment Paystack accepted but the application never heard about resolves on its own, within a
cycle, with nobody watching. A checkout that died is marked dead.

Two things move a payment off `initialized` today: the webhook, and a single attempt on the return
leg when the Learner lands back on the site. **Both failed independently on 2026-09-25 and nothing
else was looking** — a ₦120,000 payment sat unrecorded for seven hours and was found by accident.
Neither net is server-initiated; both wait to be triggered from outside.

This adds the one that is not.

## How it runs

**A machine-triggered endpoint, called on a schedule from outside the application.** There is no
scheduler in this repository and there cannot usefully be one: the server runs on an instance that
sleeps when idle, so anything started at boot stops running when the process does.

- The endpoint lives under the `/api/scheduled/` path prefix, registered beside the Paystack webhook
  rather than on the tRPC router, because its caller is a machine and not a browser session.
- **It is guarded by a shared secret** supplied in a request header and compared in constant time.
  **If the secret is not configured, the endpoint refuses every request** — an unset variable must
  never mean an open door.
- It answers with a summary of what the run did, so a failed or empty run is visible to whoever
  called it.
- **The schedule lives in this repository**, as a workflow that runs every ten minutes, not in a
  third-party dashboard. That is deliberate: tickets 28, 30 and 31 were each a setting nobody could
  see from the code, and each cost hours. A schedule in a file is reviewable in a pull request.

**The scheduler's timing is best-effort and may drift by tens of minutes. That is acceptable** and
the cutoffs below are chosen so it stays acceptable. **It is not a keep-alive**: the instance that
does not sleep is a separate launch item and must not be made to depend on this.

## What it does with each unfinished payment

One verification request to Paystack per payment, then:

| Paystack says | Do |
|---|---|
| succeeded, amount **and** currency match | Record it. The Learner gets what they paid for |
| succeeded, amount or currency **mismatched** | **Do not grant.** Flag it for a human |
| died (abandoned or failed), older than the cutoff | Mark the payment with Paystack's own outcome |
| reference not found, or anything unrecognised | **Leave it alone. Flag it for a human** |

**Recording a success must reuse the existing write path**, the one the webhook and the return leg
already share. A payment reconciled by sweep must land identically to one reconciled by webhook;
a third write path guarantees drift.

**Map the death straight through** rather than flattening it. "Nobody completed the checkout" and
"the card was declined" are different facts, the payment state vocabulary already carries both, and
only one of them describes a Learner worth helping.

**Unrecognised means stop, not guess.** A reference that does not exist on this integration means the
application's view of the world is wrong — it happened once already, when a payment turned out to be
charged on a second Paystack business (ticket 30). Never release anything and never grant on it.

## The two cutoffs, which are not one cutoff

- **Succeeded: no age filter.** Every unfinished payment is a candidate on every run. A paid Learner
  is waiting, and the cost of asking early is one wasted request.
- **Died: two hours.** It must clear Paystack's own retries and a Learner who is slow with their card.

**Collapsing these into one number is the easy mistake.** Sweeping deaths as eagerly as successes
kills live checkouts; sweeping successes as lazily as deaths leaves a paid Learner waiting hours.

The two-hour figure is a judgement, not a derivation, and it is **the same cutoff ticket 34's
in-progress guard uses** — defined once, so the guard and the sweep cannot disagree about when an
attempt is dead.

Ticket 34 landed it as `ABANDONED_CHECKOUT_CUTOFF_MS`, with `abandonedCheckoutCutoff()` for the
timestamp, both exported from `server/paystack.ts`. **Import them. Do not restate two hours.** Note
that ticket 34's guard blocks on `initialized` alone, deliberately narrower than the candidate set
below — its reasoning is in that ticket's Comments, and it does not change what this sweep sweeps.

## Flagging has to survive a restart

There is no alerting in this project. A log line is not enough: the host keeps logs briefly and loses
them on restart, which is the same invisibility that let the 2026-09-25 payment sit unnoticed.

**Record the failure on the payment itself**, in a dedicated text field, following the pattern
already used for webhook processing errors — truncated, and written in a way that a failure to record
the failure cannot fail the run. Then one query finds every payment needing a human.

This needs a schema migration with its rollback, alongside the ones already in `docs/`, **and** an
edit to the replay-order schema file. `AGENTS.md` requires that edit to land under a commit whose
subject names the file and the change; follow it.

## Two things ticket 33 left for this ticket

Both surfaced in ticket 33's review and belong here rather than there.

**The browser return leg has no test at all.** Nothing in the repository imports `verifyCheckout`;
every payment test drives the webhook. That is one of the two nets this ticket exists to backstop,
and it is the one that was never covered. **Split it and cover it in the same sitting** — the split
this ticket already needs is the natural moment.

Cover this in particular: the return leg answers the browser `verified: true` whenever Paystack
reports success, regardless of what the write actually did. Since ticket 33, a payment already
settled as `refunded` or `disputed` is deliberately **not** granted, yet the Learner is still told
their payment succeeded. Nothing reaches that state today, so it is latent rather than live — but
the return leg should report what happened rather than what was attempted.

**The candidate query must not select `initialized` alone.** This ticket's sweep looks for unfinished
payments; if it filters to `initialized`, the `abandoned`-can-still-be-settled path that ticket 33
deliberately preserved is unreachable from the sweep, and the two disagree about what "unfinished"
means. Use the same set ticket 33 defined, from the same place. Do not define it twice.

## Why the authorization split is needed

The return leg's verification bundles two jobs: proving the Learner owns the payment, and asking
Paystack what happened to it. The ownership check is right for a browser request and wrong for a
sweep, which has no Learner behind it.

Separate them — a verification that takes a payment record and asks Paystack, and the browser-facing
one keeping its ownership check and calling that. The sweep calls the inner one directly.

## Acceptance criteria

- [x] An unfinished payment whose reference succeeded at Paystack ends `success`, with the Learner's
      Subscription active and installment counts correct.
- [x] An unfinished payment whose reference succeeded with a **mismatched amount or currency** is
      **not** granted, and is flagged durably.
- [x] A payment past the cutoff whose reference died is marked with Paystack's own outcome; a payment
      **inside** the cutoff is left alone.
- [x] A reference Paystack does not recognise leaves the payment untouched and flags it.
- [x] The endpoint refuses a request with a missing or wrong secret, **and refuses every request when
      the secret is not configured.**
- [x] Two overlapping runs cannot double-advance an installment. (Ticket 33 provides this; prove it
      still holds through the sweep.)
- [ ] The schedule is committed to this repository and the secret is held as a secret, not in a file.
      **Half of this is operator work**: the workflow is committed at
      `.github/workflows/reconcile-payments.yml`, and the two secrets it reads do not exist yet.
      Unticked until they do.
- [x] A Learner reconciled by the sweep ends in the same state as one reconciled by the webhook.
      This is worth more than every criterion above it.

## Proving it

The sweep is pure enough to test against a stubbed Paystack, and each criterion above should fail
when the behaviour it names is removed:

- Delete the amount comparison and the mismatch test grants access.
- Collapse the two cutoffs into one and either the eager-success or the patient-death test fails.
- Treat an unrecognised reference as a death and that test releases something it should not.

**There is nothing to sweep on day one.** Production holds no unfinished payments — two dead and one
successful, measured 2026-09-28. This ticket is prevention, and its tests are the only proof it works
until something goes wrong.

## Not to be confused with

- **Ticket 28**, the orphaned payment and the unset webhook field. Operator work, closed. **This
  would have caught it**, and building this does not resolve it.
- **Ticket 30**, two Paystack businesses. It contributed the unrecognised-reference case. ADR 0004
  narrowed that case: a mode mismatch can no longer cause it, so cross-business is the only remaining
  cause.
- **Ticket 32.** A recurring charge whose plan cannot be matched never creates a payment record at
  all, so **this sweep does not backstop it.** It backstops checkout, not renewal. Anyone treating it
  as the general safety net is wrong.

## Comments

### What landed

`server/reconcilePayments.ts` holds the sweep and the endpoint;
`.github/workflows/reconcile-payments.yml` holds the schedule. The verification split is in
`server/paystack.ts`: `verifyPaymentAtPaystack` takes a payment row and asks Paystack, and
`verifyCheckout` keeps the ownership check and calls it. The sweep calls the inner one directly,
because it has no Learner behind it.

The candidate query uses `UNSETTLED_PAYMENT_STATES` from ticket 33, imported, not restated. The death
cutoff is `abandonedCheckoutCutoff()` from ticket 34, imported, not restated — **which closes ticket
34's one unticked acceptance box.** Narrowing the candidates to `initialized` fails 16 tests.

### Two decisions the ticket left implicit

**"Anything unrecognised" does not include a live checkout.** The ticket's fourth row says to flag
anything unrecognised, but `ongoing`, `pending`, `processing` and `queued` are the ordinary states of
a Learner still on the payment page. Flagging those would put every live checkout in front of a human
every ten minutes, which is how a queue meant to be read stops being read. They are left alone and
not flagged; a status this application has no word for — `reversed`, say — is flagged, because
guessing at one would write off money that moved.

**A Paystack outage is not an unrecognised reference.** Only a 404, or another client-side answer
saying `status: false`, means Paystack denies knowing the reference. A 5xx means it said nothing at
all, so the payment is left untouched and the run reports a failure. Reading a bad minute at Paystack
as "this reference does not exist on our integration" would send a human hunting for a second
Paystack business (ticket 30) every time the API wobbled.

### Reporting what happened, not what was attempted

Ticket 33's review left the return leg answering `verified: true` whenever Paystack reported success,
even for a payment already settled as `refunded` or `disputed` that is deliberately **not** granted.
`recordVerifiedPayment` now returns `granted`, `already-granted` or `withheld`, and the leg reports
that instead. Telling those apart needs one extra read, and it happens only on the branch where the
conditional write matched nothing, so the common path pays nothing for it.

The leg **throws** on `withheld` rather than returning `verified: false`, because
`client/src/pages/PaymentComplete.tsx` renders a spinner for anything that is neither `verified` nor
an error — so returning false would hang that page forever. The client's error copy still says the
payment "may still be processing", which is wrong for a reversal; **that copy is a loose end**, worth
a ticket, and not worth widening this one into the client.

### What the review changed, and it was not cosmetic

**A flag could be stranded on a settled payment, permanently.** `flagForHuman` was the only write
here with no condition on it. Two overlapping runs — one flagging a transient Paystack failure, the
other settling the same payment — could clear the flag and then have the late write put it back on a
`success` row, where no run ever looks again. The column's whole value is that a non-null value means
a payment still needing attention, and that was false. The write is now conditional on
`status=neq.success`, chosen over the unsettled set because a payment sitting in `refunded` or
`disputed` is exactly the kind a human should see.

**The flag was not cleared when a payment was written off**, only when one was recorded, so a payment
flagged by one bad minute at Paystack and then abandoned kept the flag for good. The column comment in
the migration promised otherwise. Both fixed, and the promise is now true.

**Clearing the flag from the shared write path was the wrong place for it**, and this is the finding
worth the most. `recordVerifiedPayment` was sending `reconciliation_error: null` on every settlement,
which meant the shared path named a column that only this ticket adds — so a deploy that ran ahead of
the migration would have failed the webhook and the browser return leg as well as the sweep. **One
unrun migration would have stopped every payment in the system from granting anything**, which is a
worse version of the failure this ticket exists to prevent, introduced by the ticket itself. The clear
now lives in the sweep, conditional on the candidate row actually carrying a flag, so a healthy
payment costs no extra write and an unrun migration costs only the sweep. The migration, the rollback
and `docs/production_architecture.md` all said the old thing loudly and have been rewritten.

**A payment stuck `ongoing` was left alone forever, unflagged and invisible** — the one state nothing
looked at, which is this ticket's own premise. A live state is still never rewritten, because Paystack
has not finished with it, but past the cutoff it is now flagged.

**The return leg's new message never reached the Learner.** `PaymentComplete.tsx` renders one generic
line for any error, so a Learner whose payment was reversed read "your payment may still be
processing" and would refresh forever. The page now shows the server's message. This was called a
loose end in an earlier draft of these notes; it was not, since this change is what routes reversals
into that copy.

Smaller: the `concurrency` comment in the workflow described cancelling runs while the config does the
opposite; the workflow had no `permissions:` floor, and as the repo's first workflow it sets the
precedent; the secret was passed in `curl`'s argv; and the migration had `#120,000` where every other
file has `₦`.

### The 204 trap is now owned in one place

`markDead` had reproduced `recordVerifiedPayment` whole — same conditional filter, same `Prefer`
header, same throw on an unanswered write. Two copies of the trap that made ticket 33's first attempt
worse than the bug it fixed is one too many, so both go through `writeIfUnsettled`, and
`markPaymentDead` takes a `DeadPaymentState` rather than a string, which keeps a status Paystack
invented out of an enum column.

### Mutations: fifteen run, fifteen killed — after three survived

Each one run, not reasoned about. The three the ticket named are the first three: delete the amount
comparison (4 tests), collapse the two cutoffs (1), treat an unrecognised reference as a death (1).

Each one run, not reasoned about. The three the ticket named are the first three: delete the amount
comparison (4 tests), collapse the two cutoffs (1), treat an unrecognised reference as a death (1).
Then: narrow the candidates to `initialized` (16), make the death write unconditional (9), treat
Paystack's live states as deaths (1), drop the unconfigured-secret guard (1), drop the flag write (5),
read a 5xx as an unrecognised reference (2), report `withheld` as success (1), drop the `Prefer` header
(13), remove the 204 throw (2), make the flag write unconditional (1), stop clearing a flag on a
recorded payment (1), stop clearing one on a written-off payment (1), stop flagging a live state past
the cutoff (1), have the shared write path name `reconciliation_error` again (2), remove the
truncation (1), and let a failed flag write escape (1).

**Four survived a first pass, and each one was a requirement this ticket states in words.**

- Replacing the constant-time comparison with `configured.startsWith(received)` passed everything: the
  wrong-secret cases were `"guessed"` and a value *longer* than the secret, and neither is a prefix. A
  guard accepting `"c"` would have shipped. Two prefix cases now cover it.
- Removing the truncation passed everything, though the ticket says the flag is written "truncated".
- Removing the `.catch` that swallows a failed flag write passed everything, though the ticket says it
  must be "written in a way that a failure to record the failure cannot fail the run".
- Removing the flag-clearing on a written-off payment passed everything, because that behaviour came
  out of the review and arrived without a test.

The pattern is worth naming: **three of the four were requirements stated in prose that no assertion
had ever been pointed at.** A behaviour described in a ticket and implemented in code still has no net
under it until something fails when it is removed, and the ones that read as obvious housekeeping —
truncate, swallow, clear — are exactly the ones nobody writes a test for. The fourth says a comparison
needs a test for the *sloppy comparison that would replace it*, not only for values that are plainly
wrong.

### One thing the review found that is not fixed here

**The glossary has no word for the record of a payment attempt**, and this ticket's vocabulary is
wrong because of it. `CONTEXT.md` defines a **Payment** as "a single verified movement of **real
money**", so `PaymentRecord`, `UNSETTLED_PAYMENT_STATES`, `UnfinishedPayment` and the phrase
"unfinished payment" — including this ticket's own title — all name rows that are, by the glossary,
not Payments at all. Most of it is inherited from before this ticket.

Not fixed here, deliberately. Inventing a domain term is a decision to be made and recorded, not
slipped into an implementation commit, and the rename would touch every payment file. It belongs in
`/domain-modeling`, and it is the same shape of finding as ADR 0005: the glossary was right and the
code disagreed with it.

### The two weak tests that did not survive review of my own drafts

The first draft asserted "does not overwrite a payment settled while the run was deciding" against a
stub that never wrote anything, so it passed for no reason — the tautology shape ticket 33's review
deleted. It now stages a genuine stale read: the candidate query answers the row as it was, the write
meets it as it is. And `markDead` had no idea whether it marked anything, so a death that matched
nothing was still counted as a death; it now asks for the affected rows, treats an absent answer as a
fault rather than a miss, and reports `leftAlone` instead.

### What is left, and it is not an agent's to do

1. **Run `docs/supabase_payment_reconciliation_migration.sql` against production, before the deploy.**
   Not the usual mild ordering advice: the shared write path names `reconciliation_error` on every
   settlement, and PostgREST rejects a whole request that writes an unknown column, so deploying
   first fails the webhook, the return leg and the sweep together — a Learner pays and gets nothing.
   `docs/production_architecture.md` now carries this.
2. **Create two repository secrets** — `APP_URL` and `SCHEDULED_TASKS_SECRET` — and set
   `SCHEDULED_TASKS_SECRET` on the Render service to the same value. Until then the endpoint refuses
   every request, which is the designed behaviour for an unset secret, and the workflow fails loudly
   rather than sweeping silently. `/wizard` is the natural way to do this if it is worth scripting.

There is nothing to sweep on day one — production holds no unfinished payments, measured 2026-09-28 —
so nothing is degraded while those two steps are outstanding. The sweep is prevention.

### A hole this sweep does not close, found while writing the schedule

Deciding whether the workflow should cancel a run in flight surfaced a **pre-existing** gap that needs
its own ticket. It predates tickets 33, 34 and 35 and is not introduced here, but it is the same
failure class this effort exists to remove, so it should not stay unwritten.

`recordVerifiedPayment` marks the payment `success` (`server/paystack.ts:201`) and credits the
Subscription in *later, separate* HTTP requests. PostgREST cannot span them in one transaction. If the
process dies between the two — a cancelled run, a crash, the instance sleeping — the result is a
payment recorded as `success` with no `active` Subscription, and **nothing will ever notice**:

- `verifyFullAccess` requires an `active` Subscription, so the Learner has no Full Access.
- This sweep's candidates are the unfinished states, which exclude `success`, so it never looks again.
- A webhook replay and the return leg both return early on `payment.status === "success"` and report
  the payment as granted.

A Learner has paid, every system agrees the payment succeeded, and no one is told they have nothing.
That is why `cancel-in-progress` is `false` in the workflow and must stay false — cancelling a sweep
is one way to reach this state deliberately — but the underlying hole is reachable without any
scheduler at all, and closing it is a separate ticket.
