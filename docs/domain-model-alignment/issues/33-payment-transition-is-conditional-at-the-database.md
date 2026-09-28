# 33: a payment transition is conditional at the database, not check-then-act

**Status:** done 2026-09-28, four guards proved by mutation.

**Blocked by:** None (can start immediately).

**Ticket 35 must read "The predicate is not `initialized` alone" before building on this.** The
condition here is deliberately wider than ticket 29 proposed, and narrowing it back would take a
Learner's money and withhold their access.

Written 2026-09-28 out of the ticket 29 grilling, which found this buried in that ticket's body
rather than stated as work. It is **correct with or without the sweep**, which is why it is its own
ticket and does not wait for ticket 35.

## What to build

Recording the same verified payment twice stops advancing an installment plan twice.

`recordVerifiedPayment` currently reads a payment's status, returns early if it is already
`success`, and otherwise issues an unconditional `PATCH`. That is a check-then-act with no
condition at the database, so two writers that both read `initialized` both proceed. Make the
transition itself conditional: the write only applies to a payment **still** unfinished, and a
writer that finds no row was affected stops there rather than continuing into the subscription
update.

Today only one writer exists in practice, so nothing has gone wrong yet. Ticket 35 adds a second
that runs on a timer.

## Why it matters more for installments than for one-time payments

For a `one_time` plan the damage is contained: installments paid is
`Math.min(installmentsDue, paid + 1)` with one due, so a second run still yields one. **For an
installment plan it double-counts**, advancing a Learner's paid count for a single payment. Nothing
detects or corrects that afterwards.

This is latent rather than live — both installment plans are inactive and have no Paystack plan code
(ticket 32) — but it becomes reachable the moment installments are switched on.

## Acceptance criteria

- [x] A payment already recorded as successful produces **no second subscription write**, even when
      the early return is bypassed. This must be enforced by the database condition, not only by the
      status check in application code.
- [x] A writer whose conditional write affects zero rows **stops**, and does not go on to patch the
      subscription.
- [x] A payment that is genuinely unfinished still records exactly as it does today: the existing
      webhook and return-leg paths are unchanged in behaviour.
- [x] A test proves the guard by the mutation it kills: remove the condition, stage a write that
      reports zero rows affected, and the test fails.

## The predicate is not `initialized` alone

**Ticket 29 proposed `status=eq.initialized`. That is wrong, and ticket 35 must not restore it.**

A Paystack transaction written off as `abandoned` can still be settled: the reference stays live, and
a Learner who returns to the same checkout link pays it. Restricting the write to `initialized` would
make that charge match nothing, so the money would be taken and the access withheld — the failure
this entire effort exists to remove, reintroduced by the fix for it.

The condition is therefore the states carrying **no recorded money**:

> `initialized`, `abandoned`, `failed`

`refunded` and `disputed` are deliberately excluded. Money was recorded there and then unwound, and a
late charge event must not quietly restore access.

Both halves are held by their own test, each killed by a different mutation: dropping the zero-rows
check fails the racing-writers test, and narrowing the predicate to `initialized` fails the
settled-after-write-off test.

## How it was proved

The seam is the existing webhook route test, which drives the real application end to end against a
Supabase double. Two changes made it able to fail:

- The double now **applies the request's own status filter to its update**, and echoes back only
  rows that matched. A double that always wrote would hide the very interleaving this guards.
- A read/write disagreement can be staged deliberately, modelling a second writer that won the race
  between this request's read and its write. That is the real shape of the bug: both writers read an
  unsettled payment, so the status check passes twice.

The pre-existing replay test still passes and still earns its place, but it only ever exercised the
application-level status check — it passes because its read happens to see the write before it. The
new test is the one that fails without a condition on the write.

Full suite after the change: **221 passed, 2 skipped, 0 failed**, typecheck clean. The two skips are
the credential tests from ticket 17, which skip without credentials by design.

### What the review caught, which the first attempt had wrong

The `/code-review` Spec axis found a defect worse than the one this ticket exists to fix, and it
existed only because of this ticket's own change.

**A missing header would have withheld access from every Learner, silently.** PostgREST answers a
`PATCH` with `204` unless asked for the affected rows, and the Supabase helper turns `204` into
`undefined`. The first implementation read that as "no rows matched", which is indistinguishable
from "another writer won" — so deleting one header would have made **every** payment look already
settled, granting nothing, with no error anywhere. A guard against double-granting had introduced a
total failure to grant.

The two are now distinct: an empty array means the filter matched nothing and the caller stops; an
absent answer means nobody asked for one, and **throws**. The webhook records the message and
returns 500, so the fault is loud and lands in the durable record rather than in a log the host
forgets.

**Three test weaknesses went with it**, each of which would have let a real regression through:

- The double always echoed a row, so it could not reproduce a `204` at all. It now honours the
  `Prefer` header, which is what makes the mutation above killable.
- The double waved through a `PATCH` carrying no status filter. It now throws, so a dropped filter
  cannot make the guard tests pass for no reason.
- An assertion compared a test-local copy of the state list against itself — a tautology that would
  have passed had the production list changed underneath it. Deleted; the behavioural assertions
  already carry the meaning.

**Four mutations, four kills**, each by a different test: drop the zero-rows check (racing writers),
narrow the predicate to `initialized` (settled after write-off), drop the `Prefer` header (six
tests), and remove the explicit throw (the unanswered-write test, which asserts the *message* rather
than only the status, because `undefined.length` also fails the request but records nothing useful).

## Notes

The existing behaviour is shared by both current callers — the webhook handler and the browser
return leg — so this is a change to the shared write path, not to either caller. A payment
reconciled by any route must land identically; that property is what ticket 35 depends on.

Tests live under `server/**` (`AGENTS.md`), and the Supabase stub from ticket 01 is the seam.
