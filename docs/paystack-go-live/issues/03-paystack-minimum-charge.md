# 03: Paystack's minimum NGN charge

**Type:** research
**Status:** resolved (2026-11-12)
**Blocked by:** none

## Question

What is the smallest NGN amount Paystack accepts for a live card transaction initialised through `POST /transaction/initialize`? Is ₦100 (`amount: 10000` kobo) allowed? Is there anything about a very small live charge (fees, card or bank refusals, risk flags) that would make it a poor proof of the real ₦120,000 path?

Primary sources only (Paystack's own docs and support articles). [09](09-live-proof.md) sets its price from the answer.

## Answer

**₦50 is Paystack's minimum NGN transaction, so ₦100 works, but it's a weak proof.** Findings, with primary-source citations, are on branch `research/paystack-minimum-charge` (commit `d3e9a90`, not pushed) at `docs/paystack-go-live/research/03-paystack-minimum-charge.md`.

- **A different fee rule.** Paystack waives its ₦100 flat fee below ₦2,500, so ₦100 pays 1.5% only, while ₦120,000 pays 1.5% + ₦100.
- **It can't be paid out.** ₦100 nets ₦98.50, below the ₦100 minimum payout for NGN, so the money's arrival at the bank can't be observed.
- **Unknowns, not confirmed safe.** No Paystack source says small charges are declined or fraud-flagged, and none documents bank or card limits on large amounts. A small charge exercises neither.
- **Recommended proof amount: ₦2,500** (`250000` kobo). It's the smallest amount on the same fee rule as ₦120,000, and its ₦2,362.50 net is payable.
- **Code fact, independently confirmed:** the one-time plan sends `plans.amount_minor` as is, and verification compares against the amount recorded at checkout start, so restoring the price mid-flight is safe.

Decision 2 in [01](01-charting-decisions.md) named ₦100 *pending this ticket*. The amount goes back to the operator.
