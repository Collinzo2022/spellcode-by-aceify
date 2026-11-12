# Map: Paystack go-live

Label: `wayfinder:map` · charted 2026-11-12

## Destination

Production's Paystack integration runs on **live** keys, and one real-money Payment of the **one-time** Full Access plan has granted Full Access **through the webhook**: read back from production as a payment at `success` and a subscription at `active`. Installment plans stay deliberately withheld.

## Notes

- **This map carries execution, overriding wayfinder's plan-only default.** The decisions and the operator steps are interleaved, and the operator holds all four dashboards (Paystack, Render, Supabase, Vercel). Tickets of type `task` *do* the work; resolving one means it was done and read back, not just planned.
- **Vocabulary is `CONTEXT.md`'s.** Payment, Test Charge, Subscription, Checkout Attempt and Full Access mean exactly what it says. "Mode" is not a domain concept (ADR 0004). Production is live-only after cutover, and a test card against production is allowed only *before* it.
- **Prior effort:** `docs/domain-model-alignment/`, which holds tickets 30, 32 and 34–36, `handoff.md`, and the wizards. `operator-remainder.sh` and `cutover-wizard.sh` resume; `switch-wizard.sh` and `finish-switch-wizard.sh` must not be re-run (`docs/agents/issue-tracker.md`).
- **Skills:** `paystack-webhooks` for anything about the webhook. **Override:** it advises "reply 200 first, then process", but SpellCode processes first and replies 500 on failure, so Paystack retries. Keep that. Use `grilling` + `domain-modeling` for HITL decisions.
- **No secrets in these files.** Identify a key only by its last four characters.
- The operator's terminal is PowerShell 5.1. The wizards are bash: run them with `bash <path>`.
- Prove deploys with `GET https://spellcode-backend.onrender.com/api/version`, never with the push's own result.

## Decisions so far

- [01: charting decisions](issues/01-charting-decisions.md): the map executes. Prove live with a ₦100 price window (kept after 03), no refund. Keep test-card subscriptions and exclude them by `user_id`. Ship "hide inactive plans" first. Amend the cutover wizard to record live plan codes but keep installments Inactive. The cutover is Render's secret key only. Ticket 30's key history is resolved by the cutover plus a recording rule. Rollback is allowed until the first real learner pays.

- [03: Paystack's minimum NGN charge](issues/03-paystack-minimum-charge.md): the minimum is ₦50, so ₦100 works, but it pays a different fee rule and can't be paid out. ₦2,500 is the smallest amount that mirrors ₦120,000. The operator kept ₦100, knowing the fee rule and payout go unproven until the first real sale.

## Not yet specified

- **Revenue reporting after cutover.** Is excluding the test-card subscriptions by hand enough, or does `adminLearnerBilling` need a filter? Sharpens once 05 adds the second test-card subscription and 09 shows what a real Payment looks like next to them.
- **Render sleeping during the live proof.** Live-mode webhook retries run for up to 72 hours, so a cold start may only delay the grant. Whether that's acceptable, or makes the non-sleeping plan a precondition, depends on what 09 observes.
- **Watching the first real learners' payments** in the days after cutover: what to watch (`paystack_webhook_events.processing_error`, the sweep's reasons), and for how long.

## Out of scope

- Switching installment plans on (ticket 32 in full). They're withheld for the first launch and decided in [01](issues/01-charting-decisions.md).
- The separate billing-test environment ADR 0004 says will be needed after cutover. It's for the first billing change *after* launch.
- Render's non-sleeping plan and custom SMTP, unless 09 shows sleep breaks payments. They're on the wider launch map (`learning/reference/launch-map.html`).
- `submitChallenge` / `completeProject` trusting the browser: XP and awards only, not money.
