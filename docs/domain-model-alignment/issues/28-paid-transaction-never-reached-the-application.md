# 28: a successful payment left the Learner with nothing

**Status:** **closed for test mode, 2026-09-28.** The Test Webhook URL was set, and a fresh
test-mode checkout proved delivery end to end: `paystack_webhook_events` holds a `charge.success`
received **2026-09-27T19:01:36Z** with `processing_error: null`, one second after the charge on
`spellcode-963cdeab-…`, and that Learner's subscription went `active`. **The live-mode field is
separate and still unchecked** — it stays on the launch checklist, and ticket 30 says what to
confirm before setting it.

**Step 3, reconciling the 03:43Z row, is withdrawn as impossible.** That transaction is not on the
integration this repo is configured against; see **ticket 30**, which also records that it was
`domain: test` money and closes it as a no-op.

Found 2026-09-25 10:33 UTC while preparing stage 10. **This was not a stage 10
rehearsal — stage 10 already ran, at 03:43 UTC the same morning, and this is its result.** Money
moved on Paystack and the application recorded none of it.

**The cause is established, 2026-09-25 ~11:00 UTC: Paystack's Test Webhook URL was never set.**
Settings → API Keys & Webhooks, in test mode, shows **Test Webhook URL empty** (placeholder text, no
value). No webhook was ever configured, so none was ever attempted, so none can ever be retried.
See "The cause".

**There is no code defect here, and nothing to `/implement`.** This is operator configuration plus
one orphaned billing row that needs reconciling. The wider finding at the bottom is a real ticket
and is still worth opening.

## What happened

A test-mode card payment succeeded. The Learner has no Full Access.

| Source | Value |
|---|---|
| Paystack reference | `spellcode-5a09dd9d-21fc-4268-bc50-a71fda2a734e` |
| Paystack status | `success`, `channel: card`, `domain: test` |
| Amount | 12000000 minor (₦120,000), NGN |
| Created / paid | 2026-09-25T03:43:55Z / **03:44:07Z** |
| Customer | the project owner's own account, `user_id 35302e6d-5f2c-47ad-8197-204b51a40277` |
| Referrer in metadata | `https://spellcode-by-aceify-two.vercel.app/` — the correct production origin |

Read from `GET https://api.paystack.co/transaction` with the test secret. The referrer confirms the
checkout began on the right host, so this is not the ticket 26 stale-address failure repeating.

## What the application recorded

Read straight out of PostgREST with the service-role key, 2026-09-25 ~10:30 UTC.

| Table | Actual | Expected after `charge.success` |
|---|---|---|
| `payment_transactions` | one row, `status: "initialized"`, `paid_at: null`, `paystack_transaction_id: null`, `paystack_authorization_code: null` | `status: "success"`, `paid_at` set |
| `subscriptions` | one row, `status: "pending"`, `installments_paid: 0`, `installments_due: 1`, `last_payment_at: null` | `status: "active"` |
| `paystack_webhook_events` | **one row only**, the synthetic `spellcode.connectivity_probe` from 2026-09-24T18:45Z | a `charge.success` row |

Both rows were written at **03:43:54Z**, thirteen seconds *before* the payment succeeded — i.e. at
checkout initialization. **Nothing has written to them since.** The state is not "half-processed";
it is "never processed". `provider_payload` holds only `plan_code` and `access_code`, which is what
initialization stores.

`payment_transactions` is the correct table name. `payments` does not exist and never did — noted
because a first query for it returned PostgREST `PGRST205`, which is the query's fault, not the
schema's.

## What is known to be fine

These were checked while diagnosing and are **not** the cause. Do not re-check them.

- **The plan is active.** `billing.accessOptions` on both Render and the `-two` Vercel host returns
  `full-access-one-time` with `is_active: true`, ₦120,000, `interval: one_time`. Ticket 25's
  activation is live. The checkout *did* start, which is what 25 unblocked.
- **The deployed build carries ticket 27.** Both hosts serve `index-DKKVNU9H.js`, 1,503,882 bytes,
  identical to each other, containing `"spellcode-supabase-config"` (handoff.md, "Deployment
  confirmed").
- **The webhook route answers correctly on every host**, including the stale one:
  `POST /api/paystack/webhook` unsigned returns `401 {"error":"Invalid Paystack signature"}` with
  `application/json` on `spellcode-backend.onrender.com`, `spellcode-by-aceify-two.vercel.app` **and**
  `spellcode-by-aceify.vercel.app`. **A misrouted delivery was therefore not swallowed by an HTML
  200** — that hypothesis is dead.
- **Render is reachable and warm**, 1.0s then 0.7s on `/api/mobile/config`.

Incidentally, the stale Vercel project returns `401 application/json` on the webhook path but
`200 text/html` on `/api/mobile/config`. That is consistent with it running **pre-ticket-16 server
code of its own** rather than proxying to Render, which is exactly what ticket 26 describes.

## The cause

**Paystack's Test Webhook URL was never configured.** Observed in the dashboard, test mode,
Settings → API Keys & Webhooks, 2026-09-25 ~11:00 UTC: the **Test Webhook URL** field is empty,
showing only its `https://example.com` placeholder. It should hold
`https://spellcode-backend.onrender.com/api/paystack/webhook`.

Corroborated by the transaction page for `spellcode-5a09dd9d-…`, which shows **1 attempt, 0 errors**
and a two-line timeline — "Attempted to pay with card" at 00:09, "Successfully paid with card" at
00:10 — and **no delivery log section at all**. Paystack had nowhere to send a `charge.success`, so
it recorded no attempt, failed or otherwise.

Everything else follows. The application was never told, so `payment_transactions` and
`subscriptions` sat at their initialization values, and `paystack_webhook_events` holds only the
2026-09-24 synthetic probe — which was a hand-made `curl`, never a Paystack delivery.

**The Render-redeploy hypothesis this ticket previously carried is disproven**, and is recorded here
only so it is not re-derived: Render's availability at 03:44Z is irrelevant when nothing was ever
dispatched to it.

**The empty Test Callback URL field beside it is not a fault — leave it alone.** The application
supplies `callback_url` per transaction at initialization (`server/paystack.ts:36`), which overrides
the dashboard default. Filling that field in would be a second, unrelated change.

## The retry window does not exist

Test-mode retries are hourly for 10 hours **from a first delivery attempt**. There was no first
attempt, so there is no retry queue and nothing will ever arrive for this transaction. A warm-Render
watch loop ran from 10:41Z on the earlier hypothesis and was stopped once the empty field was seen;
`webhook_rows` never moved off 1, which is consistent.

**Setting the URL now does not replay this payment.** Paystack does not back-fill deliveries for
transactions that completed while no endpoint was configured. This row must be reconciled by hand
whatever else is done.

## What to do

In order.

1. **Set the Test Webhook URL** to `https://spellcode-backend.onrender.com/api/paystack/webhook`
   and save. Operator work; nobody else can do it.
2. **Prove it with a fresh test-mode checkout** rather than trusting the field. A new
   `paystack_webhook_events` row with `event_type: "charge.success"` is the proof. Render should be
   awake first — cold start is measured above 45 seconds against Paystack's 30-second timeout, which
   handoff.md already records as a stage 10 blocker. That second checkout **is** stage 10, properly
   run.

   **⚠ This will fail as things stand, and step 3 has to come first.** `initializeCheckout` refuses
   to start when the Learner already has a subscription in `pending`, `active` or `past_due` for that
   plan (`server/paystack.ts:48-49`), throwing *"A payment for this plan is already in progress."*
   The orphaned 03:43Z checkout left exactly such a `pending` row on the owner's own account, so that
   account **cannot** begin another `full-access-one-time` checkout until it is resolved. Either
   reconcile first, or run stage 10 from a second test account — but note that reconciling the row to
   `active` blocks a re-checkout too, correctly, since that account would then hold Full Access. A
   second account is the cleaner way to prove the webhook.
3. **Then reconcile the orphaned row** from 03:44Z. The Learner paid ₦120,000 and has no Full
   Access. **That is a write to production billing state and needs an explicit decision** — replaying
   through the server's own verify path is preferable to editing rows directly, because it exercises
   the code that will run for every future Learner. Do not do it silently.
4. **Check the live-mode webhook URL too, before launch.** Test and live are separate fields. If the
   test one was never set, there is no reason to assume the live one was. This belongs on the launch
   checklist beside the live-money Paystack test.

## The wider finding, which outlives this row

**A payment can succeed at Paystack and leave no trace in SpellCode, and nothing notices.** No
alert, no reconciliation pass, no report. It was found only because someone happened to query the
transaction list while preparing an unrelated test.

`payment_transactions` rows stuck at `initialized` past a few minutes are, by definition, either
abandoned checkouts or lost payments, and the two are distinguishable with one Paystack call. That
is a real gap, it is not this ticket, and it should not be folded in — this ticket is one stuck
transaction. **This is now ticket 29**, which also carries a second defect found while writing it:
an unreconciled checkout leaves a `pending` subscription that locks the Learner out of that plan
permanently, which is the blocker noted under step 2 above.

The cause strengthens the case rather than weakening it. A misconfigured dashboard field is exactly
the kind of fault a reconciliation pass exists to catch, because no amount of correct code in this
repository prevents it: the application cannot tell the difference between "nobody has paid" and
"Paystack was never told where to tell us". A sweep of `initialized` rows against
`GET /transaction/verify/{reference}` would have surfaced this within minutes instead of seven hours,
and would have surfaced it without anyone needing to be looking.

## Not to be confused with

- **Ticket 26** (the stale Vercel project). Ruled out here: the referrer is the `-two` origin and
  the stale host returns a correct 401 on the webhook path. Still open on its own merits.
- **Ticket 27** (sessions expiring). Deployed and verified in the bundle. It may have contributed to
  the return leg failing, but it does not explain a missing webhook — a webhook is server-to-server
  and carries no session.
- **Ticket 25** (no plan was active). Fixed; the checkout started, which proves it.
