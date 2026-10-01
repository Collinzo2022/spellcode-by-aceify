# 36: an abandoned checkout locks the Learner out for two hours, and says nothing

**Status:** closed 2026-10-01, in tests. Found the same day while running `operator-remainder.sh`
stage 7 — the live test checkout ticket 34 asked for and never got.

**What was built.** `initializeCheckout`'s in-progress branch now returns the Attempt a Learner
already has, so the client redirects to their own payment page instead of showing a toast.
`authorization_url` is persisted beside `access_code` at initialization, and `resumableCheckoutUrl`
reads only that field, only when it is under Paystack's own checkout host. An Attempt carrying no
such URL still refuses, now with `unresumableAttemptMessage`, which names the remaining wait.
**Checkout Attempt** is in `CONTEXT.md`.

**The access-code derivation this ticket proposed was not built.** Paystack's documentation states
the URL form only by example — `authorization_url: "https://checkout.paystack.com/nkdks46nymizns7"`
beside `access_code: "nkdks46nymizns7"` — and tickets 28, 30 and 32 are each a provider detail
inferred rather than read. The only rows that would have needed the inference are ones written
before the field was persisted, and the sole live one, the owner's from 2026-10-01T00:27Z, expired
at 02:27Z before this was built. So the ticket's conditional fallback became the whole mechanism,
and nothing rests on the example.

The host check is the one thing here the ticket did not ask for. It exists because
`findOrCreateRecurringPayment` writes a raw webhook body to the same column at the same status, and
the URL is assigned to `window.location.href` in `Access.tsx`. A `charge.success` body carries no
`authorization_url`, so such a row answers `null` and falls through to the message; the check means
that even one that did carry a URL could only send a Learner to Paystack.

Nothing in the three things this ticket said not to touch was touched: the cutoff, the guard's state
filter, and the sweep's death path are unchanged.

**Still not verified.** No live checkout has been resumed in a browser — the fix is covered in
`server/paystack.checkout.test.ts` and nowhere else, and the first real exercise of it will be
`operator-remainder.sh` stage 7. Whether an access code outlives the two-hour cutoff is unknown:
Paystack publishes no TTL, and the failure mode if it is shorter is a Learner resumed onto an
expired Paystack page rather than a wrong grant.

**Blocked by:** nothing, and nothing was. The sections below are the ticket as it was written, kept
unedited because the argument against the obvious fix is the valuable part of it.

Ticket 34 removed a **permanent** lockout: a `pending` Subscription written at checkout that nothing
ever cleared, so one abandoned checkout barred that Learner from that Plan forever. This ticket is
the same shape, two hours long instead of forever, and it is **not** a regression — it is the
remainder ticket 34 left behind, now observed in production.

## What happened

Clicking **Continue securely** on the ₦120,000 one-time Plan created a `payment_transactions` row at
status `initialized` and redirected to Paystack. The Paystack page was closed without completing.
Every retry since answers, as a red toast and an HTTP 500:

> A payment for this plan is already in progress.

That is `initializeCheckout`'s in-progress guard. It matches a row that is `status = initialized` and
younger than `ABANDONED_CHECKOUT_CUTOFF_MS`, which is two hours.

## Why the guard is right and should not be loosened

The obvious fix is wrong, and the reason is worth writing down before someone tries it.

**Paystack marks a transaction `abandoned` the moment it is initialized**, before the Learner has
typed a digit. So "ask Paystack, and clear the row if it says abandoned" would clear the row of every
Learner currently looking at the payment page, and hand them a second checkout while the first is
live. The sweep already refuses to do this: `reconcileUnfinishedPayments` marks a dead payment dead
only once it is **older** than the same cutoff, while sweeping a *success* at any age. The comment on
`ABANDONED_CHECKOUT_CUTOFF_MS` says it directly — one number, read by the guard and the sweep, and
they must agree or a Learner is barred by a row nothing is going to clear.

**Do not change the cutoff, the guard's state filter, or the sweep's death path.** Every one of those
has a ticket behind it. The defect here is entirely in what the Learner is told and what they are
offered.

## What to build

**1. Say when it ends.** The message states a fact the Learner cannot act on and gives no horizon.
It should name one: *"You started paying for this plan a few minutes ago and didn't finish. You can
start again in about two hours, or finish the attempt you already have."* The server knows
`created_at`, so the remaining time is computable, not a guess.

**2. Offer to resume, which is the real fix.** The first attempt is still payable — the Paystack
checkout stays open — and resuming is strictly better than waiting two hours or starting over.

`initializeCheckout` already persists what this needs. The row written at checkout carries:

```
provider_payload: { access_code: result.access_code, plan_code: plan.code }
```

The `authorization_url` itself is not stored, but the `access_code` is, and Paystack's checkout URL
is derived from it. **Confirm the URL form against Paystack's own documentation before building on
it** — it is not verified here, and this effort has been bitten three times by a provider detail
assumed rather than read (tickets 28, 30, 32). If it holds, the in-progress branch can return the
existing checkout instead of throwing, and no schema change is needed.

If it does not hold, the fallback is to persist `authorization_url` alongside `access_code` at
initialization. That is a one-field change to a JSON column, not a migration.

**3. Decide what the guard returns.** Today it `throw`s, which the client turns into a toast via
`onError` in `Access.tsx`, and tRPC into a 500. A resumable checkout is not a server error. Returning
the existing `authorizationUrl` on the success path would let the page redirect exactly as it does
for a new checkout, and the Learner would never see an error at all.

## Why this is the domain being wrong, not just copy

`CONTEXT.md` has **Payment** — *"a single verified movement of real money"* — and **Subscription**,
and no word at all for **the attempt in between**. That nameless thing is what the row at
`initialized` is, what the guard counts, what the sweep resolves, and what the Learner is now stuck
behind. Three mechanisms act on a concept the glossary does not define.

Ticket 34 established that a Learner mid-payment **holds nothing** (ADR 0005), which correctly
removed the Subscription from this moment. It did not give the moment a name. Naming it is probably
the first move here, and `/domain-modeling` is the skill for it. A candidate: **Checkout Attempt** —
a Learner's in-flight try at paying for a Plan, which expires, can be resumed, and grants nothing.

## Proving it

The bug reproduces by hand in under a minute, and the fix is testable without a browser.

- **Red first.** `initializeCheckout` with an `initialized` row younger than the cutoff currently
  throws. Assert the new behaviour instead: it returns the existing checkout, and does not call
  Paystack's `/transaction/initialize` a second time. The Supabase seam
  (`server/testing/supabaseStub.ts`) stages the row; stage it behind the same filter the real query
  uses, or the stub will miss it.
- **The boundary is the interesting case.** A row *older* than the cutoff must still start a fresh
  checkout. Test both sides of `ABANDONED_CHECKOUT_CUTOFF_MS`, not just the blocked side.
- Tests live under `server/**` only.

## Not verified

- **Whether the stuck row from 2026-10-01 settled or was abandoned.** The Paystack page offered a
  success option and it is not known whether it was taken. If it settled, the sweep credits it at any
  age and the lockout never applied; that does not change this ticket, because the abandon case
  stands either way.
- **Paystack's checkout URL form**, as above. Read the documentation.
- Whether any real Learner has hit this. The one-time Plan is the only `is_active` Plan (ticket 32),
  so the exposure is real rather than theoretical, but no production occurrence has been looked for.
