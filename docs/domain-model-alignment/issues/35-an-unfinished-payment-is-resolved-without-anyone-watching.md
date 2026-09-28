# 35: an unfinished payment is resolved without anyone watching

**Status:** ready-for-agent

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

## Flagging has to survive a restart

There is no alerting in this project. A log line is not enough: the host keeps logs briefly and loses
them on restart, which is the same invisibility that let the 2026-09-25 payment sit unnoticed.

**Record the failure on the payment itself**, in a dedicated text field, following the pattern
already used for webhook processing errors — truncated, and written in a way that a failure to record
the failure cannot fail the run. Then one query finds every payment needing a human.

This needs a schema migration with its rollback, alongside the ones already in `docs/`, **and** an
edit to the replay-order schema file. `AGENTS.md` requires that edit to land under a commit whose
subject names the file and the change; follow it.

## Why the authorization split is needed

The return leg's verification bundles two jobs: proving the Learner owns the payment, and asking
Paystack what happened to it. The ownership check is right for a browser request and wrong for a
sweep, which has no Learner behind it.

Separate them — a verification that takes a payment record and asks Paystack, and the browser-facing
one keeping its ownership check and calling that. The sweep calls the inner one directly.

## Acceptance criteria

- [ ] An unfinished payment whose reference succeeded at Paystack ends `success`, with the Learner's
      Subscription active and installment counts correct.
- [ ] An unfinished payment whose reference succeeded with a **mismatched amount or currency** is
      **not** granted, and is flagged durably.
- [ ] A payment past the cutoff whose reference died is marked with Paystack's own outcome; a payment
      **inside** the cutoff is left alone.
- [ ] A reference Paystack does not recognise leaves the payment untouched and flags it.
- [ ] The endpoint refuses a request with a missing or wrong secret, **and refuses every request when
      the secret is not configured.**
- [ ] Two overlapping runs cannot double-advance an installment. (Ticket 33 provides this; prove it
      still holds through the sweep.)
- [ ] The schedule is committed to this repository and the secret is held as a secret, not in a file.
- [ ] A Learner reconciled by the sweep ends in the same state as one reconciled by the webhook.
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
