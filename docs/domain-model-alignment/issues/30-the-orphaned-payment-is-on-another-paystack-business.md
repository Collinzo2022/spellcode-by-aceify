# 30: the orphaned ₦120,000 is on a different Paystack business

**Status:** open, `ready-for-human`. Found 2026-09-28 while running
`finish-switch-wizard.sh` stage 7, which exists to reconcile this payment and **cannot**.

**The ₦120,000 is test-mode money, and is resolved: closed as a no-op, decided 2026-09-28.** See
"The money is not real". What remains open is the operator hazard and an unrecorded key swap, which
are the parts that threaten launch.

**There is no code defect here.** The reconciliation ticket 28 step 3 describes is impossible as
written, because the transaction does not exist on the integration this repository is configured
against.

## The money is not real

`spellcode-5a09dd9d-…` is recorded in ticket 28 as `domain: test`, and the 2026-09-27 transaction
verified on the current integration returns `"domain":"test"` as well. Everything since
switch-wizard stage 2 has run on **test keys with Paystack's test card** (`4084 0840 8408 4081`,
handed out by `finish-switch-wizard.sh` stage 5).

So no Learner is out of pocket, there is nothing to refund, and the account in question is the
project owner's own. **Decided 2026-09-28: close it as a no-op.** The `cancelled` subscription is
left as it stands, and account `35302e6d` can start a fresh checkout whenever one is wanted —
`server/paystack.ts:48` does not match `cancelled`.

A refund was considered and rejected as hygiene theatre: it would prove the refund path in test
mode only, which is not the mode anyone needs it proved in.

**This does not diminish the ticket.** The reason the payment looked unreachable — two businesses,
and no way to tell from a URL which one you are in — is unchanged, and the next one will be live.

## The key in `.env` is not the key that was there on 2026-09-25

Ticket 28's author read `spellcode-5a09dd9d-…` out of `GET /transaction` on 2026-09-25 "with the
test secret". That same reference returns `transaction_not_found` for `.env`'s key today. Both
readings cannot be true of one key, so **`PAYSTACK_SECRET_KEY` was changed between 2026-09-25 and
2026-09-28** — or ticket 28's reading was taken against the other business's key.

Nothing records either. `.env` is untracked, so git cannot answer it, and no ticket or commit
mentions a key change. **This is the finding most likely to bite at launch:** if the key can move
between businesses without anyone noticing, so can the webhook URL, the plan objects and the live
keys — and each of those fails silently in a different way.

Worth establishing by whoever picks this up: when the key changed, who changed it, and whether any
other value in `.env` moved with it.

## The finding

The project owner has **two Paystack businesses**. The 2026-09-25 payment was charged on one of
them; `.env`'s `PAYSTACK_SECRET_KEY` belongs to the other.

Read 2026-09-28 with the key in `.env`:

```
GET /transaction/verify/spellcode-5a09dd9d-21fc-4268-bc50-a71fda2a734e
  → {"status":false,"code":"transaction_not_found",
     "message":"Transaction reference not found.",
     "meta":{"nextStep":"Ensure that you're passing the reference of a
              transaction that exists on this integration"}}
```

And the whole transaction history of that integration is one row:

| reference | status | amount | paid_at |
|---|---|---|---|
| `spellcode-963cdeab-a97c-40e4-8b2f-16a20889c376` | `success` | 12000000 NGN | 2026-09-27T19:01:35Z |

**Key rotation does not explain this.** Rolling a secret key stays within a business and references
survive it, so a reference absent from the integration was charged somewhere else. Switch-wizard
stage 2 rolled the keys on 2026-09-23, before either payment.

`GET /integration` returned `{"status":false,"type":"api_error"}` — a server-side error, not an auth
failure — so **this ticket does not name the two businesses.** Whoever picks this up should name
them here from the dashboard's account switcher.

## Why the wrong business keeps opening

`https://dashboard.paystack.com/#/settings/developers` carries **no business identifier**. Everything
after the `#` is a client-side route. Paystack resolves which business is shown from the session's
last-selected account, changed only through the switcher in the top-left.

So no link can target a business: not the wizard's `open_url`, not a bookmark, not one pasted into a
ticket. Every one of them opens whichever account was last selected.

**This is the same failure shape as ticket 28** — a dashboard field that was never what anyone
assumed — with a second axis: *which copy of the field*. Ticket 28's lesson was "a field nobody has
looked at is not a configured field." This adds: **looking at it is not enough if you have not
established which business you are looking at.**

### How to tell the businesses apart

Not by name — the two are similarly named, which is how this went unnoticed. Use the data:

> **The correct business is the one whose transaction list contains
> `spellcode-963cdeab-a97c-40e4-8b2f-16a20889c376`.**

That is the only transaction on the integration the application talks to. Confirm it is visible
before touching any Paystack setting, and treat any dashboard page reached without doing so as
being of unknown provenance.

## Current state, measured 2026-09-28

PostgREST with the service-role key. Plan `2b25ace3-…` is `full-access-one-time` throughout.

| `user_id` | reference | payment | subscription | note |
|---|---|---|---|---|
| `35302e6d-…` | `spellcode-5a09dd9d-…` | `abandoned`, `paid_at: null` | `cancelled` | **paid ₦120,000 on the other business** |
| `c78088d8-…` | `spellcode-d31d4174-…` | `abandoned`, `paid_at: null` | `cancelled` | attempt of 2026-09-27 15:04, no money moved |
| `5499b299-…` | `spellcode-963cdeab-…` | `success`, `paid_at` set | `active`, 1/1 | stage 10, passed |

`paystack_webhook_events` holds a `charge.success` received 2026-09-27T19:01:36Z with
`processing_error: null` — one second after the charge. **The webhook works end to end**, and
ticket 28 is closed for test mode.

### Two claims in ticket 28 and handoff.md are now stale

- **The lockout described in ticket 28 step 2 no longer applies.** It says the orphaned checkout left
  a `pending` subscription that blocks a re-checkout. Both old subscriptions now read `cancelled`,
  and `server/paystack.ts:48` matches only `pending`, `active`, `past_due`. Account `35302e6d` can
  start a fresh checkout today. **Who cancelled those rows, and when, is not recorded anywhere** —
  worth establishing, because it was a write to production billing state that left no trail.
- **The defect ticket 29 exists to fix is unchanged**, and this ticket strengthens it: a sweep of
  stuck rows against `GET /transaction/verify/{reference}` would return `transaction_not_found` here,
  which is a *third* state its design must handle — not "paid", not "abandoned", but "charged on an
  integration we cannot see."

## What to do

1. **Name the two businesses in this file**, from the switcher, using the `963cdeab` test above.
2. ~~Decide what happens to the ₦120,000.~~ **Done 2026-09-28 — closed as a no-op**, see "The money
   is not real". Kept rather than deleted so the decision is not re-litigated.
3. **Establish when `PAYSTACK_SECRET_KEY` changed**, and whether anything else in `.env` moved with
   it. See "The key in `.env` is not the key that was there on 2026-09-25".
4. **Do not re-run wizard stage 7.** It will print `after: [{"status":"abandoned","paid_at":null}]`
   every time. Because the stage's `y` branch does not verify its own result, it also will not appear
   in the wizard's closing "skipped" summary, so the run reads clean while this stays open.
5. **Before setting the live-mode webhook** (wizard stage 10, and a launch-checklist item), confirm
   the business with the `963cdeab` test **first**. A live webhook set on the wrong business fails
   exactly the way ticket 28 did, except with real money and no test card to prove it.

## Not to be confused with

- **Ticket 28.** Its cause — the empty Test Webhook URL — was real and is fixed; the `charge.success`
  row proves it. Only its step 3 is impossible. 28 assumed one business, which nothing had yet
  contradicted.
- **Ticket 29.** Still buildable, still blocked by nothing, and now with a third row state to handle.
- **Ticket 26.** Unrelated; the stale Vercel project is a hosting artefact, not a Paystack one.

No secrets appear in this file. The references and `user_id`s are opaque identifiers; no key was
read or recorded.
