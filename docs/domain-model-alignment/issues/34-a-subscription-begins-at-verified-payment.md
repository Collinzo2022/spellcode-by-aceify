# 34: a Subscription begins at verified payment, not at checkout

**Status:** ready-for-agent

**Blocked by:** None (can start immediately).

Written 2026-09-28 out of the ticket 29 grilling. Ticket 29 proposed sweeping up the wreckage this
causes; this ticket removes the cause instead. **It changes checkout behaviour** — read "Proving it"
before starting.

## What to build

A Learner who opens the Paystack page and changes their mind can buy that plan afterwards.

Today they cannot. `initializeCheckout` writes a Subscription row at the moment the Learner is sent
to Paystack, with status `pending`, before any money moves. The same function refuses to start a
checkout when a Subscription exists in `pending`, `active` or `past_due`. Nothing ever clears a
`pending` row, so **every abandoned checkout permanently bars that Learner from that plan.** There is
no expiry and no cleanup path.

The fix is to stop creating it. The success path already creates a Subscription when none exists, so
nothing is lost.

## Why this is the domain being wrong, not just a bug

`CONTEXT.md` says:

> **Subscription** — a Learner's holding of a Plan, with a status and validity period.

A Learner who closed the tab holds nothing. The row records an *intention*, and calling it a
Subscription is what produced the lockout. The glossary was right and the code disagreed with it.

**This ticket carries ADR 0005** recording the decision, and sharpens `CONTEXT.md` so a Subscription
is stated to begin at verified payment — giving the code something to be wrong against next time.

## The guard has to split, because it was doing two jobs

The single check answered both "do you already have access?" and "have you already started paying?".
With no `pending` row, those become two questions against two tables:

- **Access** — a Subscription in good standing (`active`, `past_due`) → *"You already have access
  through this plan."*
- **In progress** — an unfinished payment for this Learner and plan, **created within the abandoned
  cutoff** → *"A payment for this plan is already in progress."*

**Use the same cutoff ticket 35 uses to declare a checkout dead — two hours — and define it in one
place.** If the guard and the sweep disagree about when an attempt is dead, a Learner can be locked
out by a row nothing will ever clear, which is the bug this ticket exists to remove. An attempt older
than the cutoff stops blocking whether or not anything has swept it, so a sleeping server cannot lock
anyone out.

## Acceptance criteria

- [ ] Starting a checkout writes **no** Subscription row. The payment record is still written.
- [ ] A Learner whose previous checkout was abandoned beyond the cutoff **can start a new checkout**
      for the same plan.
- [ ] A Learner with an unfinished payment **inside** the cutoff is refused, with the in-progress
      message.
- [ ] A Learner holding a Subscription in good standing is refused, with the already-have-access
      message. The two refusals are distinguishable.
- [ ] A successful payment still produces an `active` Subscription with the correct installment
      counts — the create-if-missing path now carries every first payment, so it is no longer the
      rare branch.
- [ ] The cutoff is defined once and read by both the guard and ticket 35.
- [ ] ADR 0005 is written, and `CONTEXT.md`'s **Subscription** entry says a Subscription begins at
      verified payment.

## Proving it

**Nothing needs migrating.** Production holds zero `pending` Subscriptions, measured 2026-09-28 —
the two historic ones were cancelled and the third is `active`. This lands on a clean slate.

**This edits the one function with production evidence behind it.** Switch stage 10 passed on
2026-09-27 and is the entire proof that checkout works end to end; `initializeCheckout` is the
function that ran. The tests are the net, but **a second test-mode checkout after this lands is
worth the ten minutes** — the cheapest possible confirmation that the guard split did not break the
path it guards.

Note that a test checkout writes a Subscription into production that no money paid for. ADR 0004
covers what that is and why the existing one was kept; do not let this become a habit.

## Not to be confused with

- **Ticket 33.** Independent: it makes the payment write conditional, and touches neither guard.
- **Ticket 35.** Depends on this one. Its abandoned branch has nothing to release once this lands,
  which is most of why the sweep is smaller than ticket 29 imagined.
