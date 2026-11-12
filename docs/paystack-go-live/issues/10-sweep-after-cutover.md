# 10: what the reconciliation sweep does to test-mode rows after cutover

**Type:** task (AFK: read `server/reconcilePayments.ts`, its tests, and production's `payment_transactions`)
**Status:** open
**Blocked by:** none

## Question

Once Render holds the live key, any test-mode `payment_transactions` row still at `initialized` gets checked with `GET /transaction/verify/{reference}` against the live integration. That returns `transaction_not_found`: ticket 30's "third state". What does the sweep (tickets 33–35) do with such a row? Can it mislabel one, or alert falsely, or touch a Subscription?

Done when: the behaviour is stated with file and line references, production is checked for rows at `initialized`, and either it's safe as is, or the fix needed before [08](08-run-the-cutover.md) is written as a new ticket.
