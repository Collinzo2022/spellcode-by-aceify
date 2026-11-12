# 01: charting decisions

**Type:** grilling
**Status:** resolved (2026-11-12, in the charting session)

## Question

What does "make test mode work, then go live" mean for SpellCode, and what is decided before any step is taken?

## Answer

Settled by the operator in two rounds, each answer the recommended one.

1. **The destination is live and proven, not a plan.** The map carries execution (see map Notes).
2. **The live proof is a price window.** Drop `full-access-one-time` to a small amount (₦100, pending [03](03-paystack-minimum-charge.md)) through Admin → `billing.updatePlan`, buy it once with a fresh account, then restore ₦120,000. This is safe in code: a checkout charges the price recorded when it starts (`server/paystack.ts`, `initializeCheckout` payload), and verification requires Paystack's amount to equal it, so restoring the price can't break a checkout in flight. During the window, anyone on the Access page sees the low price, so do it at a quiet hour.
3. **The ₦100 is not refunded.** Real money moved, so by `CONTEXT.md` it's a genuine Payment and needs no exclusion. A refund would leave Full Access paid for with refunded money, because the app does not handle `refund.processed`.
4. **Test-card Subscriptions are kept and excluded by `user_id`.** The stage-10 one (`5499b299…`, decided 2026-09-28) and the one [05](05-test-checkout-after-ticket-34.md) creates. Record both `user_id`s together in domain-model-alignment ticket 32 and on the launch map.
5. **"Hide inactive plans" ships before the test checkout**, so the test runs against the page learners will see ([02](02-ship-hide-inactive-plans.md)).
6. **The cutover wizard is amended, not replaced.** It still records the two live installment `PLN_` codes and writes them into the database, but leaves both plans **Inactive**. Ticket 32's "codes written down" closes, and switching installments on later is one Admin toggle ([06](06-amend-cutover-wizard.md)).
7. **The cutover is one key.** Only Render's `PAYSTACK_SECRET_KEY` changes. `PAYSTACK_PUBLIC_KEY` is loaded (`server/_core/env.ts`) but used nowhere. The secret key also verifies webhook signatures.
8. **Ticket 30's "when did the key change" is resolved by the cutover**, plus a rule: every change to `PAYSTACK_SECRET_KEY` is recorded in the handoff with its date, its business and its last four characters. Ticket 30's *other* half, identifying the business that holds `spellcode-963cdeab-…`, stays a precondition ([04](04-identify-the-paystack-business.md)).
9. **Rollback is allowed until the first real learner pays.** If the live proof fails, put `sk_test` back on Render, fix the problem and retry. After a real Payment, fix forward only. ADR 0004 gets one line saying so ([07](07-record-the-decisions-in-the-docs.md)).

Out of scope as a result: installments, the post-launch billing-test environment, and Render sleep/SMTP (see the map).

### Amended 2026-11-12, after [03](03-paystack-minimum-charge.md)

**Decision 2 holds at ₦100** (`amount_minor 10000`), chosen by the operator over the recommended ₦2,500, knowing what it leaves unproven. The live proof covers checkout → Paystack → webhook → Full Access. It does **not** cover the over-₦2,500 fee rule, or the payout reaching the bank (₦98.50 net is below the ₦100 payout minimum, so it stays in the Paystack balance). The first real ₦120,000 sale is the first observation of both.
