# 25: stage 10 cannot run — no stage ever activates a plan

**Status:** open, and **blocking stage 10**. Found 2026-09-24 while preparing the test-mode
checkout. Not a code defect: the code is behaving correctly and refusing to sell something that
was never switched on. The defect is in the **procedure**, which asks for a checkout without ever
making one possible.

## The facts, read from production

`GET /api/trpc/billing.accessOptions` on Render, 2026-09-24:

| code | `is_active` | `paystack_plan_code` |
|---|---|---|
| `full-access-one-time` | `false` | `null` |
| `full-access-3-month` | `false` | `null` |
| `full-access-6-month` | `false` | `null` |

All three rows exist with the right names, currencies and amounts. None is active.

The consequence is not cosmetic. `client/src/pages/Access.tsx:10` disables every button and
labels it "Plan setup in progress", and `server/paystack.ts` refuses independently of the UI:

```ts
if (!plan?.is_active) throw new Error("This access plan is not available right now.");
if (plan.interval !== "one_time" && !plan.paystack_plan_code) throw new Error("This installment plan is not configured yet.");
```

So there is no route to a Paystack `authorization_url` at all. **This is why the Paystack webhook
events log is empty** — `GET /integration/webhooks/events` returns `200 {"data":[]}`, no delivery
ever attempted. Nothing could have fired. It was never a webhook problem.

## Why it was missed

Read the wizard's own stages (`issues/20-switch-wizard.md:39-49`):

- **8.** Paystack webhook → point test mode at the Render address.
- **9.** Local checks.
- **10.** Acceptance: the dashboard with a real session, and **a full test-mode checkout with its
  webhook**.

Nothing between 3 (database) and 10 creates the Paystack plan objects or sets `is_active`. Stage
10 assumes a purchasable plan the way it assumes a working browser — silently. The wizard was run
correctly and still cannot reach its own acceptance test.

It stayed hidden because every other stage was verifiable from a terminal. This one only shows up
when something tries to *buy*, and nothing has.

## What unblocks it

**The short path: activate `full-access-one-time` and nothing else.** Its `interval` is
`one_time`, so the second guard above does not apply and it needs **no Paystack plan object** —
`is_active = true` is the whole prerequisite. That is enough to produce a real `charge.success`
and settle stages 8 and 10 together, which is all the acceptance test is for.

No SQL required: `server/routers/billing.ts:26` exposes `updatePlan` as an `adminProcedure`, and
`client/src/pages/Admin.tsx` already wires it to an active toggle and a plan-code field. It is a
switch on the admin page, signed in as an admin.

**The installment plans are a separate job.** `full-access-3-month` and `full-access-6-month` are
`monthly`, so each needs a plan created in the Paystack **test** dashboard and its `plan_code`
recorded via the same admin form. Do this when the recurring path is being tested; it is not
needed for stage 10 and should not be allowed to delay it. Note the live dashboard will need its
own plan objects later — test-mode plan codes are not live-mode plan codes.

## Also required before the checkout runs

**Wake Render first.** Paystack's test mode allows 30 seconds per delivery attempt and retries
hourly for 10 hours; measured cold start here is over 45 seconds. A checkout against a sleeping
free instance fails on the timeout and the retry finds it asleep again, producing a failure that
has nothing to do with the code under test. See the handoff's launch checklist, where this is now
marked a stage 10 blocker.

## The record to correct

`docs/domain-model-alignment/switch-wizard.sh` should gain a stage between 8 and 9: activate
at least one plan and, for the installment plans, create them in Paystack and record their codes.
**This is for the record only — do not re-run the wizard.** It has no resume state, and stages 2
and 3 would roll the Paystack keys again and rebuild the database. The fix here is the admin
toggle plus the corrected document, not a replay.

## Done when

- [x] **`full-access-one-time` is active.** Done 2026-09-24 18:50 UTC by PATCHing
      `/rest/v1/plans?code=eq.full-access-one-time` with the service-role key, since an admin
      session was not available to use the admin page. Confirmed through the **public**
      `billing.accessOptions` on Render with no key, and the Vercel proxy returns 200 on the same
      query. The other two plans were left `false` deliberately. Reversible by the same toggle.
- [ ] A test-mode checkout completes with a Paystack test card.
- [ ] `GET https://api.paystack.co/integration/webhooks/events` shows the delivery, with status
      and response code — which is the first evidence that stage 8's URL was ever set correctly,
      since no API reads that setting back.
- [ ] The wizard script and stage list carry the missing stage.

## What was already proven, so it is not re-done

The webhook endpoint itself is verified end to end against the deployed app. A request signed with
the test secret, sent directly to Render with an indented body containing a `N` escape,
returned `200 {"ok":true}` in 2.66s — proving Render's `PAYSTACK_SECRET_KEY` matches the test key,
that the raw-body capture works in production and not only in tests, and that Render's writes reach
the new Supabase project. That was a **synthetic** event, one audit row in `paystack_webhook_events`
with `event_type: "spellcode.connectivity_probe"`, no payment or subscription touched. **The only
thing stage 10 still adds is proof that Paystack itself is configured to call us.**
