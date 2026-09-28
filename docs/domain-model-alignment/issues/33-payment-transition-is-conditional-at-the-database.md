# 33: a payment transition is conditional at the database, not check-then-act

**Status:** ready-for-agent

**Blocked by:** None (can start immediately).

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

- [ ] A payment already recorded as successful produces **no second subscription write**, even when
      the early return is bypassed. This must be enforced by the database condition, not only by the
      status check in application code.
- [ ] A writer whose conditional write affects zero rows **stops**, and does not go on to patch the
      subscription.
- [ ] A payment that is genuinely unfinished still records exactly as it does today: the existing
      webhook and return-leg paths are unchanged in behaviour.
- [ ] A test proves the guard by the mutation it kills: remove the condition, stage a write that
      reports zero rows affected, and the test fails.

## Notes

The existing behaviour is shared by both current callers — the webhook handler and the browser
return leg — so this is a change to the shared write path, not to either caller. A payment
reconciled by any route must land identically; that property is what ticket 35 depends on.

Tests live under `server/**` (`AGENTS.md`), and the Supabase stub from ticket 01 is the seam.
