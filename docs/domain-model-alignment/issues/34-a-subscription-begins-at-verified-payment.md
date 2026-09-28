# 34: a Subscription begins at verified payment, not at checkout

**Status:** done 2026-09-28, in code and tests. Two boxes unticked on purpose — the shared cutoff
needs ticket 35 to be read twice, and the live-checkout confirmation is operator work. See Comments.

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

- [x] Starting a checkout writes **no** Subscription row. The payment record is still written.
- [x] A Learner whose previous checkout was abandoned beyond the cutoff **can start a new checkout**
      for the same plan.
- [x] A Learner with an unfinished payment **inside** the cutoff is refused, with the in-progress
      message.
- [x] A Learner holding a Subscription in good standing is refused, with the already-have-access
      message. The two refusals are distinguishable.
- [x] A successful payment still produces an `active` Subscription with the correct installment
      counts — the create-if-missing path now carries every first payment, so it is no longer the
      rare branch.
- [ ] The cutoff is defined once and read by both the guard and ticket 35. **Half of this cannot land
      here:** the cutoff is defined once and the guard reads it, but ticket 35 does not exist yet.
      Unticked deliberately — ticket 35 closes it.
- [x] ADR 0005 is written, and `CONTEXT.md`'s **Subscription** entry says a Subscription begins at
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

## Comments

### What landed

`initializeCheckout` writes the payment record and stops. The guard is two queries against two
tables: `subscriptions` in `(active, past_due)` for access, `payment_transactions` in `initialized`
and newer than the cutoff for an attempt in flight. The `pending` Subscription write is gone.

`ABANDONED_CHECKOUT_CUTOFF_MS` and `abandonedCheckoutCutoff()` are exported from
`server/paystack.ts`, and ticket 35's body now says to import both rather than restate two hours.

**That half of the criterion is unticked, and the review is why.** The boundary tests build their
timestamps from the constant, so they catch a guard whose cutoff has a *different value*. They cannot
catch a guard that inlines the *same* value — `Date.now() - 7200000` behaves identically to reading
the constant, so no test can tell them apart. Duplication of an equal literal is invisible from the
outside by construction; only review catches it, and only ticket 35 actually reading the export
discharges the criterion. Claiming the boundary tests killed that mutation was wrong and is corrected
here rather than left standing.

### The in-progress state is `initialized` alone, and that is a decision

This ticket says "an unfinished payment", and ticket 35 says not to define "unfinished" twice. Those
pull in opposite directions here, so: the guard blocks on `initialized` only, **not** on ticket 33's
`UNSETTLED_PAYMENT_STATES`.

The two sets answer different questions. Ticket 33's answers "could this still become `success`?",
which `abandoned` and `failed` can — that is why the conditional write accepts them. The guard asks
"is this Learner paying right now?", which someone whose card was just declined is not. Reusing the
wider set would refuse a retry after a decline for two hours, with the in-progress message, which is
this ticket's own lockout rebuilt out of a different row. Ticket 35's instruction is about the
sweep's candidate query and still stands there untouched. A test walks `failed`, `abandoned`,
`success` and `refunded` and requires each to let a new checkout through.

### What the tests kill

`server/paystack.checkout.test.ts` is new; nothing imported `initializeCheckout` before. The double
models the two tables as a scenario rather than a call order, and **throws** if either guard query
carries no status filter or the payment query carries no `created_at` filter — an unbounded read is
the lockout, so it must not be able to pass quietly.

Five mutations, five kills, each run rather than reasoned about: keep the Subscription write (fails
the no-Subscription test), drop the age filter (5 tests), widen the guard to ticket 33's unsettled set
(resolved-attempt test), collapse the two refusals into one message (2 tests), give the guard its own
30-minute cutoff (just-inside-the-cutoff test), and delete the create-if-missing branch (2 tests) —
that last one caught by a new test in `server/paystack.webhook.test.ts`, since the branch every first
payment now takes had no coverage of its own.

### Two things the review caught

**The Plan code stopped being snapshotted.** The deleted checkout write carried
`plan_snapshot: { plan_code: plan.code }`; the create-if-missing branch it hands off to carried
`{ source: "paystack" }`. Since that branch is now every first Subscription, **no Subscription would
have recorded which Plan it was sold as.** Nothing reads the column today, which is precisely why the
loss would have gone unnoticed until someone needed it. The branch now snapshots the code — it fetches
it, since it starts from a payment row rather than from the Plan — and the create test asserts it.

**The mutation claim above was overstated**, corrected in the paragraph on the cutoff.

### One deliberate piece of scope this ticket did not ask for

`server/testing/paystackPlans.ts` holds `TEST_INSTALLMENT_PLAN`, imported by all three Paystack test
files. The Standards review found the literal triplicated, the third copy being this ticket's. Plans
are read by four paths with four different `select=` lists, so a copy that drifted would weaken one
file while the others kept passing; `server/testing/` already exists for exactly this. Behaviour is
untouched.

### The one thing left, which is operator work

"Proving it" asks for a second test-mode checkout after this lands. That cannot be done from here and
should not be done casually: per ADR 0004 production is in live mode, so exercising checkout there
means either live money or reconfiguring the environment back to test codes, and a test checkout
writes an unpaid `active` Subscription into production. The tests are the net; if that ten-minute
confirmation is wanted, it is a deliberate operator action with ADR 0004 read first.

### A window left open on purpose

Two checkouts started in the same instant can both reach `initialized`, because the guard reads
committed rows and takes no lock. The result is one Learner over-credited on their own plan, not a
lockout. Closing it would need a uniqueness constraint over live attempts — a row that has to be
cleaned up, which is the thing this ticket removed. Recorded in ADR 0005 rather than fixed.
