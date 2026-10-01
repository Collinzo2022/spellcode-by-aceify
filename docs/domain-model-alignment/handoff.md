# Handoff — Domain Model Alignment (SpellCode by Aceify)

Rewritten **2026-09-25**, superseding the 2026-09-24 revision, which put `main` at `5753e04` and
described tickets 24 and 27 as outstanding. Both are done. **Revised 2026-09-28** — see "The payment
path works", which is the first genuinely new thing since the rewrite, and "The production address
changed", where ticket 26 is now closed. **Revised 2026-10-01**: tickets 33, 34 and 35 are built and
deployed, so the reconciliation work is now **operator work, not engineering work** — see "The sweep
is deployed, switched on, and proved". The verification figures and the deployment table were both
re-measured the same day, having gone stale exactly as the "Verified state" self-test predicted.
**Later the same day** the sweep was switched on and run against production, and **ticket 36 was
opened** — so the claim that nothing waits on an engineer no longer holds. Repo:
`C:\Users\aefue\Desktop\Projects\Spellcode\spellcode-by-aceify`.

**Moved 2026-09-25 from `.scratch/domain-model-alignment/` to `docs/domain-model-alignment/`, and
now tracked.** This file, `spec.md` and `issues/` beside it were gitignored and travelled only with
the working copy; they are version-controlled from here on, so **they are visible to everyone with
repo access, and edits to them belong in commits like any other file.** Two consequences worth
carrying: the backend engineer working on F2 can now read these directly, and a deleted ticket is
recoverable from history rather than gone.

**The effort is over as a build.** Tickets 01–28, **30**, and **33, 34 and 35** are done; **ticket 29
was grilled and split on 2026-09-28** and is their parent, not work in itself.

**Amended 2026-10-01: ticket 36 is open engineering work**, and the sentence that stood here —
*"nothing on this effort is waiting on an engineer"* — was true for about nine hours. It was found by
*running* the operator wizard, which is the point of having written one: stage 7's live checkout was
abandoned at the Paystack page, and every retry since is refused for two hours with copy that names
no horizon and offers no way back. That is ticket 34's lockout at a shorter duration — the remainder
it left behind, not a regression. See `issues/36-…`.

**Open: 31 and 32, both operator work, plus the two operator steps ticket 35 left behind, plus 36.**
**31 the
owner cannot currently complete**, because the project it concerns is in an organization they do not
administer; **32 is a cutover hazard**, its design settled by ADR 0004 and its remainder operator
work; **35's sweep is deployed, switched on and proved against production on 2026-10-01** — the
migration is run, both secrets are set, and a GitHub Actions run completed `success`. **Ticket 35 is
closed in full.**

**Apart from ticket 36, everything outstanding on this effort is a dashboard, a secret or a SQL
file — read "What is left" as an operator's list with one engineering item on it.** It is also a
wizard, written 2026-10-01:

```bash
bash docs/domain-model-alignment/operator-remainder.sh
```

**Nine stages, and unlike the two wizards beside it, this one resumes.** It re-probes what it can
read — the `reconciliation_error` column, and whether the sweep endpoint answers 503 or 401 — and
keeps a state file for the three stages nothing can probe. **So it is safe to re-run**, which neither
`switch-wizard.sh` nor `finish-switch-wizard.sh` is. It performs tickets 35, 34 and 31, and
**deliberately refuses ticket 32's cutover**, reporting the three coupled changes instead.

**The operator walk of 2026-09-28 is finished.** Ticket 26 closed, one Supabase project paused, the
live-mode webhook set. `finish-switch-wizard.sh` documents the procedure, but **take it by hand** —
the wizard has no resume state, so re-running it walks back through its stage 7, which cannot succeed.
(This sentence read "tickets 25 and 26 remain" until 2026-09-26, having been written before 28 and 29
existed, then "25, 26, 28 and 29", then "26, 29 and 30" earlier on 2026-09-28; 26 closed that day, and
31 and 32 were both found the same afternoon.)

**`703e1cf` stopped being the interesting commit on 2026-09-28.** It is ticket 27's fix, pushed and
deployed, and until the reconciliation work landed it was also the last commit that changed code — a
role this document leaned on in three places. **It is not any more**: `e471f98` is, and both hosts
serve it, verified by probe on 2026-10-01 (see "Deployment confirmed"). Ticket 27's fix remains live.

**Twice now this file has said "commits after `703e1cf` are documentation only".** It was true when
written and false within days, both times. The lesson is the same one the "Verified state" section
draws about SHAs: **ask git what has changed since the figures were taken, rather than asserting that
nothing has.** The command is there and it is one line.

## The production address changed — read this first

**Production is `https://spellcode-by-aceify-two.vercel.app`.** The `-two` is permanent and
deliberate. Anyone who "corrects" it will point the project back at a dead site.

**The old address is removed. 2026-09-28: the stale Vercel project was deleted**, and
`https://spellcode-by-aceify.vercel.app` now 404s, as does its API path. **Ticket 26 is closed**, and
its file carries the before-and-after probes.

What it was, kept because it explains four days of confusion: the address was *not dead but stale,
which is worse*. It returned 200 with the pre-fix 367,903-byte shell, and its API ran pre-alignment
server code that **successfully authenticated to the current Supabase project** — it answered with a
42703 `plans.paid_features does not exist`, i.e. a 400 from a request that was authorized. It cost a
real stage 10 checkout attempt on 2026-09-24 before anyone noticed.

**The freed unsuffixed name was not reclaimed, and must not be.** Deleting that project made the
nicer name available; taking it would break sign-in. Production stays `-two`, permanently.

**The credential exposure is not undone by the delete.** Whether that project held
`SUPABASE_SERVICE_ROLE_KEY` or only the anon key was never recorded, and the project is now gone, so
it cannot be asked. Ticket 26 says to assume the service-role key was exposed; rotating it means
updating Render's environment in the same sitting. That decision is still open.

### What went wrong, and how it was found

On 2026-09-24 production was still proxying `/api/*` to the dead Manus host although `vercel.json`
had named Render since `700f0ef`, which was pushed. Three fingerprints located the fault without
any dashboard access:

| Host | `/api/mobile/config` | Frontend bundle |
|---|---|---|
| `spellcode-backend.onrender.com` | `application/json`, new Supabase project | `index-C3D4LG3z.js` |
| `spellcode-by-aceify.vercel.app` | `text/html`, **md5-identical to Manus** | `index-B_rCL-2W.js` |
| `spellcode-tnyv8stq.manus.space` | `text/html` | — |

Byte-identical responses from Vercel and Manus proved the rewrite was still pointing at Manus. The
second signal is what named the cause: Vercel's *own frontend* was a different build from Render's,
so Vercel was not building from this repository at all. It was connected to
`Bayospel/spellcode-by-aceify`; `git remote -v` is `Collinzo2022/spellcode-by-aceify`. Every push
since the move had landed in GitHub and reached nothing.

### Why the address has `-two`

Reconnecting created a **second** Vercel project, because the first still held the name. It builds
from `Collinzo2022` correctly — its bundle matches Render's exactly — but Vercel gave it the `-two`
suffix. **Renaming a Vercel project does not move its `.vercel.app` domain**, which is assigned at
creation; renaming both projects changed nothing, confirmed by `X-Vercel-Cache: MISS` on both.

Freeing the shorter name would mean releasing the domain from the old project and adding it to the
new one, or deleting the old project outright. Decided instead to **adopt the `-two` address**, as
the cheaper and non-destructive option. The old project is left alone, still serving its stale build
at `spellcode-by-aceify.vercel.app` — treat that address as dead.

The application needed no code change: `client/src/lib/supabaseAuth.ts` builds the confirmation
redirect from `window.location.origin`.

### What must name the new address

- [x] `.env` → `VERCEL_ORIGIN`
- [x] `README.md`, and `docs/vercel_alias_verification.md` marked superseded
- [x] **Supabase Auth → URL Configuration**: Site URL and the redirect entry
      `https://spellcode-by-aceify-two.vercel.app/auth/confirmed`. Previously listed as outstanding,
      which contradicted the stage table. It is **done**, and stage 7 is the proof rather than a
      dashboard screenshot: a confirmation email sent on 2026-09-24 was followed 22 seconds later by
      a confirmed account, so the link in it resolved against the `-two` origin. A wrong Site URL
      could not have produced that.

## Where the switch stands

Ticket 20's wizard is `docs/domain-model-alignment/switch-wizard.sh`, 12 stages. It was run on
2026-09-23 and stopped part-way through stage 6.

| Stage | |
|---|---|
| 1 Pre-flight | done |
| 2 Paystack keys rolled | done (test mode; live keys are a launch item) |
| 3 New Supabase project + six replay files | done — project `jttycbhcziffiukpcwvd` |
| 4 Auth settings | done 2026-09-24, redone against the `-two` origin after the Vercel project changed |
| 5 Render service | done — `https://spellcode-backend.onrender.com`, healthy |
| 6 Point the web at Render | done 2026-09-24, on the `-two` address: `application/json`, bundle `index-C3D4LG3z.js`, matching Render's build exactly |
| 7 Seed and check through the site | done 2026-09-24 — signup, email confirmation, sign-in, seed data and the dashboard render all verified |
| 8 Paystack webhook → Render | **done 2026-09-27.** The Test Webhook URL was set, and delivery is proven rather than assumed: a `charge.success` row arrived at 19:01:36Z with `processing_error: null`. Ticket 28 closed for test mode. Live mode is a separate field and still unchecked |
| 9 Local checks against the new project | done 2026-09-24 — 190 passed, 0 skipped, 0 failed. Now **264**, re-measured 2026-10-01 at `e471f98`; see "Verified state" |
| 10 Acceptance in test mode | **passed 2026-09-27 19:01Z**, on the second test Learner. `spellcode-963cdeab-…`, ₦120,000, `success`, subscription `active` 1/1. The first attempt, 2026-09-25 03:43Z, failed and is ticket 30 — closed as a no-op, test money on another Paystack business |
| 11 Pause the old Supabase project | not done — operator only |
| 12 Done | — |

**Do not re-run `switch-wizard.sh`.** It has no resume state, so it walks from stage 1, and stages 2
and 3 would roll the Paystack keys again and rebuild the database.

**Use `finish-switch-wizard.sh` instead**, in this same directory and committed 2026-09-26. It is the
remainder as its own wizard — ten stages beginning at stage 8 — and it replaces the earlier
instruction here, which was to read `switch-wizard.sh:403-560` as a checklist and work the rest by
hand:

```bash
bash docs/domain-model-alignment/finish-switch-wizard.sh
```

It covers stage 8 (the webhook URL, ticket 28), waking Render, a second test Learner, stage 10's
checkout, proving a `charge.success` row actually arrived, an attempt at reconciling the orphaned
03:43Z payment through `/payment/complete?reference=…` **which cannot succeed** (ticket 30), stage
11, ticket 26, and a look at the live-mode webhook field. It asks for no secrets, and its checks read `.env` and send nothing
but GET. Stages 5, 7, 8 and 9 each confirm before they act, and it refuses to let you pause the live
Supabase project, delete the wrong Vercel project, reclaim the freed unsuffixed name, or run the
checkout on the account that cannot start one.

**It was run on 2026-09-28 and reached stage 7 of 10**, carrying stages 8 and 10 of the switch with
it. Stages 8, 9 and 10 of the wizard — pause the old Supabase project, delete the stale Vercel
project, the live webhook field — were still outstanding when this was written.

**Its stage 9 is now done: ticket 26 closed 2026-09-28, walked by hand rather than by the wizard.**
That is the right way to take the remaining three, because the wizard has no resume state either —
re-running it to reach stage 8 walks back through stage 7, which cannot succeed and does not notice.
~~**Stages 8 and 10 remain**: pause the old Supabase project, and the live-mode webhook field.~~
**Corrected 2026-10-01: only stage 8 remains.** Stage 10 is the wizard's *look* at the live-mode
webhook field (`finish-switch-wizard.sh:480`), and the launch checklist records that field set the
same afternoon this sentence was written — so the two halves of this document disagreed for three
days. **And stage 8 is ticket 31**, not separate work: "pause the old Supabase project" is the
project the owner has no admin rights over. One outstanding item, counted twice under two names.

Three faults found by running it, none fatal:

- **It cannot open a browser on this machine.** Every `open_url` prints "couldn't open a browser, so
  visit it manually" and the URL. Harmless, but expect to copy each one.
- **Stage 7 cannot succeed** and does not notice — see "Two Paystack businesses".
- **Its wrong-account hint is wrong.** Stage 7 says that signing in as the wrong Learner shows
  "the payment is still processing". `verifyCheckout` actually throws **"Payment transaction
  not found."** for a reference another account owns; "still processing" is a different throw in the
  same function, for a transaction Paystack has not settled. Two faults, two messages.

It is still not a substitute for reading ticket 28 and ticket 30 first.

## The payment path works — 2026-09-27

**This is the first time money has moved through SpellCode end to end.** Recorded here because
everything above and below was written while it had never happened.

| | |
|---|---|
| Checkout | `spellcode-963cdeab-a97c-40e4-8b2f-16a20889c376`, ₦120,000 NGN, `domain: test` |
| Paystack | `success`, `paid_at` 2026-09-27T19:01:35Z |
| Webhook | `charge.success` in `paystack_webhook_events`, received 19:01:36Z, `processing_error: null` |
| Application | `payment_transactions` → `success`; `subscriptions` → `active`, 1/1 installments |

One second from charge to delivery, processed cleanly. **Ticket 28 is closed for test mode and
ticket 25 with it.** Stage 8 and stage 10 are both genuinely done, on the second test Learner
(`5499b299-…`) as ticket 28 step 2 recommended.

**Live mode is untouched.** The live webhook field is separate and nothing suggests it is set; read
ticket 30 before going near it.

### Two Paystack businesses — ticket 30

**The project owner has two Paystack businesses, and `dashboard.paystack.com` URLs carry no business
identifier.** Everything after the `#` is a client-side route; Paystack shows whichever account the
session last selected, changed only through the switcher at the top-left. **No link can target a
business** — not the wizard's, not a bookmark, not one pasted into a ticket.

That is how the 2026-09-25 payment came to look orphaned: it was charged on the *other* business.
`GET /transaction/verify/spellcode-5a09dd9d-…` with `.env`'s key returns `transaction_not_found`,
"a transaction that exists on this integration", and the whole transaction history of the current
integration is the single successful row above. Key rotation does not explain it — rolling a key
stays inside a business and references survive it.

**Tell the businesses apart by data, not by name** — the two are similarly named, which is how this
went unnoticed:

> The correct business is the one whose transaction list contains
> `spellcode-963cdeab-a97c-40e4-8b2f-16a20889c376`.

Confirm that before touching any Paystack setting, especially the live webhook.

**The ₦120,000 was test money and is closed as a no-op** (decided 2026-09-28). It was `domain: test`
on a test card, so nobody is out of pocket and there was nothing to refund.

**The sharper finding is that `.env`'s `PAYSTACK_SECRET_KEY` is not the key that was there on
2026-09-25**, and nothing records the change. Ticket 28's author read the 03:43Z transaction with
"the test secret"; today's key cannot see it. `.env` is untracked, so git cannot answer this. If a
key can move between businesses unrecorded, so can the webhook URL and the live keys. Ticket 30
carries it.

**Wizard stage 7 cannot do its job.** It will print `after: [{"status":"abandoned","paid_at":null}]`
every time, and because its `y` branch does not verify its own result, it will not appear in the
wizard's closing "skipped" summary either — the run reads clean while this stays open.

### Stage 8, stated once

**Corrected 2026-09-25: the webhook URL was never set.** This section previously opened "The webhook
URL is set", which was an assumption nobody had checked — the dashboard's **Test Webhook URL** field
was found empty, and that is why the stage 10 payment vanished (ticket 28). **It was set on
2026-09-27 and is now proven** — see "The payment path works". Everything below about the *endpoint*
still stands and was worth proving; what was missing was Paystack's side of it.

The endpoint is verified as far as a terminal can reach:

- An unsigned POST to `/api/paystack/webhook` returns `401 {"error":"Invalid Paystack signature"}` on
  **both** `spellcode-backend.onrender.com` and through the Vercel proxy. Only the real handler
  produces that. Malformed and wrong-length signatures also 401.
- A browser GET returns the SPA shell with **status 200**, not an error — `server/paystack.ts` is
  POST-only. Do not read that 200 as a working webhook.
- **The signed path is verified in production.** A request signed with the test secret, sent to
  Render directly, returned `200 {"ok":true}` in 2.66s. Its body was indented and carried a `\n`
  escape, so `JSON.stringify(req.body)` could not have reproduced its bytes: it verified only because
  the raw body reached the handler. This proves Render's `PAYSTACK_SECRET_KEY` matches the test key,
  that the raw-body capture works on the deployed app and not only in tests, and that Render's writes
  reach the new Supabase project. It was **synthetic**, not from Paystack — one row in
  `paystack_webhook_events` with `event_type: "spellcode.connectivity_probe"`, matching no branch and
  touching no payment. Left in place deliberately as the record of this check.

**What cannot be established from here:** that Paystack is actually delivering.
`GET https://api.paystack.co/integration/webhooks/events` with the test secret returns
`200 {"data":[]}` — no delivery has ever been attempted to this integration. That is expected for a
fresh integration with no transactions, and it **cannot** distinguish "URL set, nothing fired yet"
from "URL never set": no endpoint reads back the configured URL.

**In the event it was "URL never set", and the empty array was the only hint available.** The lesson
is not that the empty array should have been read harder — it genuinely does not distinguish the two
— but that **a dashboard field nobody has laid eyes on is not a configured field.** The stage was
marked done on the strength of the endpoint answering correctly, which was never the same claim.

**Paystack has no "Send test webhook" button.** Checked against
https://paystack.com/docs/payments/webhooks/ on 2026-09-24, after earlier revisions of this document
had twice implied otherwise. The Webhook Events API can *resend* an event but cannot originate one.
**The only way to produce a first webhook is a real test-mode transaction**, which is stage 10. Do
not plan around a button that does not exist, and do not send a forged signed request to close the
gap — that needs the secret and would write production rows from a fabricated event.

**Test-mode retries are hourly for 10 hours with a 30-second timeout per attempt.** Measured Render
cold start is over 45 seconds, so a webhook arriving at a sleeping instance **exceeds the timeout**,
and the retry an hour later finds it asleep again. "A Render instance that does not sleep" is a
**stage 10 blocker**, not a nice-to-have: wake Render before the test checkout.

## The sweep is deployed, switched on, and proved against production — 2026-10-01

**Superseding this section's own earlier title, "deployed and switched off".** Both operator steps
below were completed on 2026-10-01 and the sweep was then **run against production and its effects
read back**. The safety net is live and catching things.

**Tickets 33, 34 and 35 are built, reviewed, committed and live on both hosts.** They are the
reconciliation work, and they are the last engineering on this effort.

### Proved, by running it — 2026-10-01T00:49Z

An authenticated `POST` to `/api/scheduled/reconcile-payments`, carrying the secret from `.env`,
returned:

```json
{"examined":3,"recorded":0,"mismatched":0,"died":0,"leftAlone":1,"unrecognised":2,"failed":0}
```

Three facts in one request, none of them inferred:

- **The secret matches.** The endpoint authenticated rather than answering 401, so Render's value and
  `.env` agree — which is the one thing a 401 probe could never establish.
- **The migration has been run.** `reconciliation_error` selects, and more than that, it was
  **written to** — see below. The `information_schema` query under step 1 is no longer the way to
  answer this; the column's contents answer it.
- **`unrecognised: 2` is ticket 30's orphans, handled exactly as ticket 30 specified.** Both rows now
  carry `reconciliation_error = "Transaction reference not found."` They are the payments on the
  other Paystack business, and they are neither paid nor abandoned — the third row state ticket 30
  said the sweep would have to handle. It flagged them for a human, did **not** rewrite their status,
  and did not guess. Two rows silent since 2026-09-25 now say what is wrong with them.

**`leftAlone: 1` is correct and is the interesting one.** It is a checkout abandoned at 00:27:01Z,
younger than `ABANDONED_CHECKOUT_CUTOFF_MS`. The sweep asked Paystack, was not told "settled", and
refused to write it off — because killing a young row kills live checkouts. That restraint is the
behaviour, not a gap. It is also **ticket 36**: the Learner who abandoned it is refused for two hours
with copy that names no horizon.

### The workflow runs too — 2026-10-01T01:16Z, run `36800221172`

**A forced `workflow_dispatch` run completed `success`**, printing the same summary the direct call
did. That is the larger claim the paragraph here previously withheld: `secrets.APP_URL` and
`secrets.SCHEDULED_TASKS_SECRET` both resolve, and the sweep reaches production *through Actions*
rather than only from a laptop. **Ticket 35 is closed in full.** Stage 6 of `operator-remainder.sh`
is marked done, and was deliberately left unmarked until this run existed.

**Every scheduled run before it had failed, and every one failed correctly.** The log of the last,
`36793630315` at 2026-09-30T23:56:17Z, shows `APP_URL:` and `SCHEDULED_TASKS_SECRET:` both empty and
the workflow's own guard exiting 1. The secrets were created at 23:59:37Z and 00:11:27Z — **three
minutes and fifteen minutes after that run**. So the failures were the workflow announcing a missing
configuration for as long as it was missing, which is what it was built to do. **Do not read that run
history as a defect.**

### The cron does not fire every ten minutes

**`cron: "*/10 * * * *"` describes the request, not the behaviour.** Observed starts, read from
`gh run list` on 2026-10-01: `23:56`, `20:16`, `15:32`, `08:52`, `02:26` — **hours apart, not
minutes.** GitHub throttles scheduled workflows on low-activity private repositories, and this repo
is both.

The workflow's own comment anticipates drift "by tens of minutes at worst". **That estimate is wrong
by an order of magnitude**, and the sentence should be read as an intention rather than a measurement.

**The design survives it, which is why this is a documentation fix and not a ticket.** The sweep's
success path has no age filter, so a late run still resolves a paid Learner; its death path waits two
hours, so a late run cannot kill a live checkout. Nothing about correctness depends on the cadence —
that was written down before the cadence was known, and it held.

**What does not survive it is any claim about *latency*.** A Learner whose payment the webhook missed
waits for the next run, and "the next run" can be four hours away, not ten minutes. Anyone sizing the
safety net, promising a recovery time, or forcing a run by hand should use the observed figure. To
resolve one payment now, dispatch a run rather than waiting:

```bash
gh workflow run reconcile-payments.yml
```

| | |
|---|---|
| **33** | A payment transition is conditional at the database — four guards proved by mutation |
| **34** | A Subscription begins at verified payment, not at checkout — the `pending` write is gone |
| **35** | An unfinished payment is resolved without anyone watching — the sweep, plus its schedule |

**Read the three tickets' `## Comments` before touching any of this.** They carry findings that are
not in the ticket bodies, and one of them is load-bearing: ticket 33's review left the browser return
leg reporting `verified: true` for a payment deliberately **not** granted, and ticket 35's review
found a flag that could be stranded on a settled payment for good. Both are fixed; the reasoning is
only in the Comments.

### The two operator steps — both done 2026-10-01

1. ~~**Run `docs/supabase_payment_reconciliation_migration.sql`** against the live project
   (`jttycbhcziffiukpcwvd`).~~ **Done.** It adds `payment_transactions.reconciliation_error`, which is
   how a payment the sweep could not resolve becomes visible to a human. The earlier text here said
   *"whether it has been run is not established"* and offered an `information_schema` query; that is
   settled — the column reads back **and carries values the sweep wrote**, which is the stronger
   proof, since a column can exist and still never be reachable by the code.

   **An unrun migration was survivable here, and that was deliberate.** Ticket 35's review moved the
   flag-clearing write out of the shared settlement path precisely because naming this column there
   meant a deploy ahead of the migration would have failed the webhook and the browser return leg as
   well as the sweep — **one unrun migration stopping every payment in the system from granting
   anything.** As it stands, an unrun migration costs only the sweep.

2. **Create `SCHEDULED_TASKS_SECRET`, in two places that are easy to confuse.** **Render's half is
   done** — proved by the endpoint authenticating a real request, not by a dashboard. **The GitHub
   half is done too**, confirmed by a green workflow run rather than by the secret appearing in a
   list. Both values match:

   | Where | Why |
   |---|---|
   | **Render's environment** | the endpoint reads it as `ENV.scheduledTasksSecret` to authenticate the caller |
   | **This repo's GitHub Actions secrets** | `.github/workflows/reconcile-payments.yml` sends it as `x-spellcode-scheduled-secret` |

   The workflow also needs **`APP_URL`**. Setting the secret in only one place leaves the schedule
   running on its schedule and being refused every time — which is exactly what the run history
   before 2026-10-01 shows. (Not "every ten minutes": see "The cron does not fire every ten minutes".)

**~~Render does not have it, established by probe on 2026-10-01.~~ It has it, established the same
day by a request it authenticated.** The probe that said otherwise was right when taken and was
overtaken within hours; both readings are kept because the *technique* is the point. `POST` to
`/api/scheduled/reconcile-payments` with no secret returns `503 Scheduled tasks are not configured`,
and `registerReconciliationEndpoint` returns that **only** when the variable is unset — an endpoint
with a secret configured answers `401 Invalid scheduled task secret` instead. So neither answer is
ambiguous the way `switch-wizard.sh` stage 8's empty webhook-events array was: **it reads the setting
rather than inferring it.** That is the difference tickets 28, 30, 31 and 32 each cost hours to learn,
applied deliberately this time.

**An unset secret closes the door rather than opening it** (the 503 in
`registerReconciliationEndpoint`, which precedes the secret check), so nothing was exposed while that
stood. What was lost was only the net: a payment left unsettled waited for someone to notice, which is
ticket 29's original complaint. **That is now closed** — the sweep runs, and a payment it cannot
resolve carries a sentence saying why.

## Ticket 27, and what it means for stage 10

Fixed 2026-09-25 as `703e1cf`. Every signed-in Learner was logged out about an hour after signing in,
still shown as signed in, told nothing, and stuck until they cleared `localStorage`. It is why the
stage 10 checkout produced no transaction three times running. The ticket file holds the diagnosis
and the implementation notes; what matters here:

- **It is pushed and deployed.** `703e1cf` is an ancestor of `origin/main`, and both hosts serve a
  bundle still containing the fix — re-confirmed 2026-10-01, see "Deployment confirmed". Production
  no longer carries the defect, so a stage 10 failure now means something new rather than the
  2026-09-24 cause.
- **No browser has run it.** The logic is covered by 27 tests and six mutation tests, but the hour
  boundary is proven against a stubbed clock and a stubbed `fetch`. The round trip against the real
  Supabase project is untested. Treat the first stage 10 attempt as the verification.
- **It costs one forced sign-in.** The refresh needs the public Supabase URL and anon key outside
  React, so sign-in now writes them to `localStorage["spellcode-supabase-config"]` beside the
  session. The session stored before this commit has no config, cannot be refreshed, and is cleared
  once — presenting a real sign-in. That affects exactly one account and is strictly better than the
  zombie it replaces. **Do not read that first sign-in prompt as a regression.**
- **The workaround is no longer needed** but still works:
  `localStorage.removeItem('spellcode-supabase-session')`.

## The local dev server does not start on this machine

Recorded so nobody spends an evening on it twice. `npm run dev` (`tsx watch server/_core/index.ts`)
prints **nothing** beyond npm's own two notices, never binds port 3000, and `curl` gets connection
refused for at least three minutes. Reproduced 2026-09-25 both through the preview harness and by
running the entry directly. It behaves identically before and after `703e1cf`, so it is not that
commit's doing and it is **not** a code fault anyone has localised yet.

Consequence for every client-side ticket from here: **you cannot verify in a browser locally.** The
options are the deployed hosts after a push, or tests. This is unticketed and worth one, because it
is now the main obstacle to verifying UI work.

`npx vite build` works fine, so the build path is unaffected.

## Deployment confirmed, 2026-10-01

Probed directly, not read from a dashboard. **The frontend bundle is now `index-cFtl7yUd.js`**,
superseding `index-DKKVNU9H.js` (2026-09-25) and `index-C3D4LG3z.js` (2026-09-24).

| Host | `/` bundle | `/api/mobile/config` | `POST /api/scheduled/reconcile-payments` |
|---|---|---|---|
| `spellcode-backend.onrender.com` | `index-cFtl7yUd.js` | 200 `application/json` | 503 `Scheduled tasks are not configured` |
| `spellcode-by-aceify-two.vercel.app` | `index-cFtl7yUd.js` | 200 `application/json` | 503 `Scheduled tasks are not configured` |
| `spellcode-by-aceify.vercel.app` | **deleted 2026-09-28** — 404, ticket 26 | 404 | — |

Both live bundles are **1,503,905 bytes, md5 `d2c64ec8ff4941e2726e54a1a4ac8597`, identical to each
other**, which is the same Vercel↔Render agreement that diagnosed the wrong-org fault — both are
Linux CI builds, so they are comparable. **A local `npx vite build` the same day produced
`index-lfvD14Np.js`**, a different hash for the identical commit, which is the convention in Working
conventions demonstrated rather than asserted.

**A changed hash alone would not prove ticket 35 shipped**, so each bundle was searched for a string
only the new code can produce: **`message??"Your payment may still be processing`**. The literal
copy on its own is in both builds and proves nothing; what is new is its *adjacency* to `message`,
which comes from `verify.error?.message ?? "…"` in
`client/src/pages/PaymentComplete.tsx` at `e471f98`. Before it, that literal stood alone in the JSX.
Present in the bundle served by **both** hosts.

**The server half is proved by the 503, and it is the better of the two probes.** An unauthenticated
POST carrying no secret reaches `registerReconciliationEndpoint`, which answers
`503 {"error":"Scheduled tasks are not configured"}`. A host without `e471f98` could not produce that
string — it would serve the SPA shell or a 404 — so the endpoint is live on both. And because that
refusal is written **above** the secret check, so it fires before anything authenticates, **the same
probe also reported that Render held no `SCHEDULED_TASKS_SECRET`** — true when taken, and overtaken
later the same day when the secret was set and the endpoint began answering 401. Two facts, one
request, no credential. See "The sweep is deployed, switched on, and proved".

Ticket 27's own marker, `CONFIG_STORAGE_KEY = "spellcode-supabase-config"`
(`shared/supabaseSession.ts:27`), is still present in both bundles, so that fix has not been
regressed by anything since.

**Ticket 26 was unaffected by that deployment and stayed open**, the stale project still serving its
pre-fix shell and still answering the API path with HTML. **It is closed as of 2026-09-28** — see
"The production address changed".

## Verified state, 2026-10-01

**Re-measured 2026-10-01 at `e471f98`**, because the self-test below had gone red: the reconciliation
work added 1,112 lines across 11 files in `server/` and `client/`, so every figure in the previous
revision of this section described code that no longer existed. The section worked as designed — it
said to re-run rather than to trust — and this is that re-run.

- **Suite: 264 passed, 2 skipped, 0 failed, of 266, across 37 files.** Up from 217 of 219 across 34
  at `703e1cf`; the three new files and 47 new tests are tickets 33, 34 and 35. The two skips are
  unchanged — the credential-gated tests in `server/external-config.test.ts`, each printing its
  reason (`SUPABASE_URL, SUPABASE_ANON_KEY not set`, `PAYSTACK_SECRET_KEY not set`). Any other skip,
  or any failure, is new.
- `npx tsc --noEmit` clean. `npx vite build` clean, in 1m 48s.
- **The last commit that changed code is `e471f98`** (ticket 35), which is where the three figures
  above were measured, and it **is** the tip as this is written. Do not read that as licence to
  assume it still is.

  **Do not treat the line above as this section's answer to "what is HEAD?".** It records where the
  figures were measured, which is a fact about the past and cannot rot; whether that commit is still
  the tip is a different question, and this section deliberately does not answer it. Earlier drafts
  did, said `703e1cf`, then `840921e`, and went
  stale both times within a day — once inside the very commit that corrected it. A SHA in a file is a
  claim that rots; the same question answered from git cannot. Ask git:

  ```bash
  git log --oneline -1 && git status --short && git ls-remote origin main
  ```

  A clean `status` and an `ls-remote` matching `HEAD` mean nothing is unpushed. And to check whether
  the figures above have gone stale — i.e. whether code has landed since they were taken:

  ```bash
  git diff --stat e471f98..HEAD -- server client shared
  ```

  Empty output means the suite, `tsc` and `vite build` results above still hold. Any output means
  re-run them before trusting this section. **Update the SHA in that command whenever you re-measure**,
  or it silently starts comparing against the wrong baseline — it named `703e1cf` for three days after
  that stopped being where the figures were taken.
- **`e471f98` is pushed and deployed**, confirmed on both hosts by probe ("Deployment confirmed").
  `18b4bd4`, `285bdf1` and `703e1cf` are its ancestors and were each confirmed the same way in turn.
  Nothing is unpushed and nothing is awaiting a rebuild.
- The merged local branch `ticket/14-replay-path-runnable` still exists, as do
  `fix/domain-model-alignment` and `claude/clever-roentgen-440fc0` (a worktree under `.claude/`).

Run the credential-gated tests under **bash**, not PowerShell:

```bash
set -a; . ./.env; set +a; REQUIRE_CREDENTIALS=1 npx vitest run
```

The PowerShell equivalent, since that is what the terminal here runs:

```powershell
Get-Content .env | ForEach-Object { if ($_ -match '^\s*([A-Z_]+)=(.*)$') { Set-Item "env:$($matches[1])" $matches[2] } }
$env:REQUIRE_CREDENTIALS = '1'
npx vitest run
```

Pass means 0 failed **and** 0 skipped. Vitest does not load `.env`, so without the prefix those two
tests skip and the suite reads green having reached nothing.

## The new project, measured 2026-09-24

Read straight out of PostgREST with the service-role key, not from a dashboard:

| Table | Rows | |
|---|---|---|
| `missions` | 3 | the replay's own stage-3 verification target |
| `plans` | 3 | the three Full Access plans |
| `awards` | 7 | matches the seven verified award rules |
| `projects` | 2 | |
| `profiles` | 1 | created by the auth bridge trigger on signup |
| `user_awards`, `xp_entries` | 0 | nothing earned yet, as expected |

**Ticket 11 needs no migration, and this is observed rather than inferred.** The profile row carries
`current_streak: 0` and `last_learning_day: null`, so the column folded into
`docs/supabase_schema_draft.sql:28` reached the fresh project through the replay.
`docs/supabase_local_day_streak_migration.sql` is not needed here.

Incidentally: `profiles.total_xp` **does not exist**, and that is correct. XP totals come from the
`learner_xp_totals` view (ticket 09), not a column. A query naming `total_xp` gets PostgREST `42703`
and is the query's fault, not the schema's.

From here, **every schema change ships as a migration for the live project and is folded back into
the replay files.** Ticket 11 set the rule. The replay files only ever run against an empty schema,
so a change living only in a migration never reaches a new environment, and once real Learners exist
a reset is off the table.

## What is left, in order

1. ~~**Push `703e1cf` and confirm both hosts rebuilt.**~~ **Done 2026-09-25**, both halves —
   `origin/main` was at `703e1cf` that day and both hosts served a bundle carrying the fix. The same
   check has since been repeated at `e471f98` ("Deployment confirmed"). Nothing below is blocked on
   it any more.
   Kept in place rather than deleted so the list reads as a record. **Cite these items by title, not
   by number** — the 2026-09-25 rewrite renumbered them, which silently broke the references in
   tickets 21 and 23; both now name what they mean.
2. ~~**Stage 8, then stage 10.**~~ **Both done 2026-09-27** — see "The payment path works". The
   webhook is proven by a `charge.success` row, and a test-mode checkout completed with the
   subscription going `active`. Tickets 28 and 25 closed with them. **This was also ticket 27's real
   verification**, which it passed: the checkout ran through a browser session end to end.

   Two claims this item used to make are now false and are corrected rather than deleted, because
   both were load-bearing:

   - **The lockout is gone.** This said the orphaned checkout left a `pending` subscription blocking
     the owner's account from another `full-access-one-time` purchase. Both old subscriptions now
     read `cancelled`, which `initializeCheckout`'s access guard does not match, so that account can
     check out today. (Since ticket 34 that guard reads `status=in.(active,past_due)` — `pending` was
     removed from it, so a `pending` row no longer blocks anyone regardless.) **Nothing records who cancelled them or when** — a write to production billing state
     that left no trail. Ticket 30 asks for it to be established.
   - **The 03:43Z row cannot be reconciled**, by hand or otherwise. It is on the other Paystack
     business. Closed as a no-op; it was test money. Ticket 30.
3. **Stage 11**, pausing the old Supabase project. Operator, dashboard only. **Half done
   2026-09-28, and the remaining half is ticket 31.**

   **There are three Supabase projects, not two.** Every document in this effort assumed two,
   including both wizards. Measured 2026-09-28 by unauthenticated `GET /rest/v1/`, which tells a
   running project (`401`) from a paused one (does not resolve):

   | ref | | |
   |---|---|---|
   | `jttycbhcziffiukpcwvd` | running | **live production**, created 2026-09-23 |
   | `geewhajddtzoisumbbek` | **paused 2026-09-28** | an intermediate attempt |
   | `mgsbipibzzwrvnseftar` | **running** | the Manus-era project — **the one stage 11 means**, and it **cannot be paused**: it is in an organization the owner is not an admin of |

   So the pause that happened was correct but was not the stage. **Ticket 31** carries the rest.

   **It holds no third-party data**, established 2026-09-28 by reading its Authentication → Users:
   ten accounts, all the owner's or the one collaborator who built the Manus version. So there is no
   retention deadline and nobody to notify, and **rotating its keys is the whole of the practical
   remedy** — nothing uses them, so it breaks nothing. Getting admin rights in order to pause or
   delete it is housekeeping after that.

   The live project was confirmed post-alignment by reading it, not by trusting the ref:
   `plans.paid_features` returns `42703`, its three plan rows match ticket 30's, and the owner
   confirmed in the dashboard that `.env`'s anon and service-role keys both belong to it.
   `finish-switch-wizard.sh:438` guards this stage with "do not pause `jttycbhcziffiukpcwvd`" — correct,
   and insufficient, because it names the project to avoid rather than the project to act on.

4. ~~**Ticket 26**, deleting or disabling the stale Vercel project.~~ **Done 2026-09-28.** The
   project was deleted after confirming its Settings → Git read `Bayospel/spellcode-by-aceify`, not
   `Collinzo2022`. The unsuffixed address 404s; production and its `/api/*` path to Render are
   unchanged and verified. **The rotation question it raised is still open** — see "The production
   address changed".
5. **The launch checklist**, before any real Learner:
   - [x] **Paystack's live-mode Webhook URL actually set.** **Done 2026-09-28.** It was found
         **empty** — only the test field carried the Render URL — and the operator set it to
         `https://spellcode-backend.onrender.com/api/paystack/webhook`. The business was confirmed
         first by the `963cdeab` test (ticket 30), in test mode; that is valid, because **test and
         live are two modes of one business**, not two businesses, so the identification carries.
         Setting it while Render holds test keys is harmless: a live event could not verify, and
         `285bdf1` refuses a webhook it cannot verify rather than half-processing it. Test and live
         are separate fields, and the test one was found empty on 2026-09-25 after being assumed set
         since the switch (ticket 28) — which is why this one was *looked at* rather than assumed.
   - [ ] **The two installment plans activated**, or deliberately withheld. **The plan objects were
         created in Paystack's live mode on 2026-09-28, and this did not reach the application** —
         `full-access-3-month` and `full-access-6-month` are still `is_active: false` with
         `paystack_plan_code: null`, so only the one-time plan is sellable. Creating a plan at
         Paystack does not write back. **See ticket 32**, which also carries the structural half: a
         Paystack plan code exists per *mode*, and `plans.paystack_plan_code` is one column with no
         mode dimension. Closing ticket 25 did not change any of this.
   - [ ] A live-money Paystack test, with Render on the live keys and the live webhook
         (`todo.md:48`).

     **The cutover is three coupled changes, not two** (ticket 32, settled by **ADR 0004**): Render's
     secret key and the client's public key to live; the live webhook set (done); **and
     `plans.paystack_plan_code` patched to the live plan codes**, via `billing.updatePlan`. Move the
     first two without the third and installment checkouts break in `initializeCheckout`, on **"This
     installment plan is not configured yet."** Move the
     third early and test-mode installment work breaks instead. The third is the invisible one, and it
     is why this item is listed as three things.

     **After cutover, exercising the payment path needs a separate database**, not a test mode against
     this one — ADR 0004 decided that mode is a property of the environment, so production is only ever
     live. Nothing needs that second environment today; the first billing change after launch will.

   - [ ] **Exclude the stage 10 test Subscription from any revenue figure.** Production holds an
         `active` Subscription for `5499b299…`, 1 of 1 installments, created 2026-09-27 — **Full Access
         granted by a test card**. `payment_transactions` has no mode column, so nothing distinguishes
         it from a real purchase and `adminLearnerBilling` will count it. Decided 2026-09-28: the row
         **stays**, because it is the owner's own stage 10 account and deleting it erases the evidence
         that stage 10 passed. The exclusion is by `user_id`, by hand. See ticket 32 and ADR 0004.
   - [ ] A Render instance that does not sleep. **A stage 10 blocker, not just a launch item.**
   - [ ] Custom SMTP for Auth email, in place of the rate-limited built-in sender.
   - [ ] Both Forge follow-ups done.
   - Ticket 11 is **off this list** — its server half deploys with the Render build.
   - Not gates: the Android release (closed), and an API domain (dropped when Android closed).
6. ~~**The reconciliation work — tickets 33, 34 and 35.**~~ **Built and deployed 2026-09-28,
   confirmed live 2026-10-01.** All three closed, `/implement` and `/code-review` each, one commit
   per ticket. **The two operator steps are done** — the migration is applied and Render holds
   `SCHEDULED_TASKS_SECRET` — **and the sweep was run against production on 2026-10-01 and its effects
   read back**, both directly and **through a green GitHub Actions run**. It is catching things: two
   long-silent orphans now carry a reason. **Ticket 35 is closed in full.** See "The sweep is
   deployed, switched on, and proved".

   **The insurance this item asked for was run on 2026-10-01, and it paid for itself.** It said a
   second test-mode checkout after 34 lands is cheap insurance, because 34 edits `initializeCheckout`,
   the only function with production evidence behind it.

   **Half proved, and a defect found.** `initializeCheckout` ran in a browser against production,
   built the payload and redirected to Paystack — the half that had never been exercised. The Paystack
   page was then closed without completing, and **every retry since is refused for two hours**: the
   in-progress guard matching a row left at `initialized`, with copy that names no horizon and offers
   no way back to the still-payable attempt. That is **ticket 36**, and it is ticket 34's lockout at a
   shorter duration rather than a regression. **The success path remains unproven**, so this box stays
   unticked; it needs a third test Learner, because the stage 10 account holds an `active`
   Subscription that 34's access guard correctly refuses.

   **ADR 0005** came out of 34, and `CONTEXT.md` changed with it.

   The original ticket 29 text, kept below for its evidence:
   Nothing server-side ever re-examines a `payment_transactions` row left at `initialized`, so a paid
   Learner can wait forever — which is what happened on 2026-09-25 — and an *abandoned* checkout
   leaves a `pending` subscription that locks that Learner out of the plan permanently. **Now
   unblocked in the way it wanted to be**: stage 10 has passed, so it can be written against a
   payment path known to work. **Ticket 30 adds a third row state it must handle** — a sweep calling
   `GET /transaction/verify/{reference}` gets `transaction_not_found` for a reference charged on an
   integration the application cannot see, which is neither "paid" nor "abandoned".
7. **A ticket for the dev server that never binds.** Not blocking launch, but it is now the reason no
   client-side change can be checked in a browser locally.
8. **The two Forge follow-ups**, still not written as tickets:
   - **F1**, the user's: move guided-project publishing and certificates to Supabase Storage.
   - **F2**, the user's **backend engineer's**: move the AI tutor to a direct LLM provider, and
     choose the provider. F2's standalone brief lives in the sprint doc's Phase 4:
     https://claude.ai/code/artifact/4392f37c-3d73-4d3f-8fd1-cf545dbd55b6 — written that way because
     these documents were unreadable to them while gitignored. **Since the 2026-09-25 move they can
     read this directory directly**, so the separate brief is now a convenience rather than a
     necessity; point them here for anything it does not cover.

**Forge is last, and it has jumped the queue once already.** A grilling session on F1 was opened and
then paused unanswered after one round because of it. Its reconnaissance is kept in ticket 23; the
four questions are unanswered and F1 remains undesigned.

## Read this before starting any ticket

**A ticket's description may not match the codebase.** It happened three times across this effort, in
both directions. Ticket 06 asserted Project progress records existed; they did not. Ticket 07 asked
for dead feed-reading paths to be deleted; 05 and 06 had already removed them. Ticket 09's stated
instruction — synthesise each opening balance "from their current total" — was **unsafe as written**
and would have double-counted post-ticket-08 XP; it was deliberately not followed literally.

**Verify each ticket's factual claims against the code before planning**, and if a premise is false,
deliver the ticket's *goal* and say so plainly in the commit.

**A ticket can forbid something and the fix can still do it.** Ticket 27's first attempt satisfied
every stated requirement and then reintroduced the outcome the ticket explicitly prohibited — a 401
redirecting a Learner to sign-in mid-lesson — by leaving an existing interceptor untouched and
feeding it an unauthenticated request. The tests passed. `/code-review` caught it. **Read a
prohibition as a property of the finished system, not a rule about which lines you may write.**

The same applies to a document. A previous revision of this file was two days stale and wrong about
five tickets, said stage 8 was both "not done" and "switched", and listed a Supabase Auth setting as
outstanding that stage 7 had already proven done. `README.md` named a dead host as production for two
days after the move. **Prefer the repository to the prose**, and prefer a probe to both.

## Working conventions

- One ticket per commit, subject ending `(ticket NN)`. Bodies explain *why*, name the evidence, and
  state plainly what was **not** verified. Co-authored trailer.
- **The user runs git.** Agents prepare changes and do not run `add`, `commit`, `merge` or `push`
  unless asked; read-only commands are fine. `/implement` asking for a commit counts as being asked —
  it does **not** extend to push.
- **The index may already hold everything: the user stages with `git add .`.** Before any commit,
  read `git diff --cached --name-only`; commit with `git commit --only -F <msgfile> -- <paths>`,
  which leaves everything else staged as found. To undo a bad local commit without touching the
  index or working tree, `git update-ref refs/heads/main <previous> <bad>`.
- **Tests live under `server/**` only** — `vitest.config.ts` includes nothing else, so a test in
  `shared/` or `client/` silently never runs. Two ways to test non-server code, both in use:
  - Pure logic goes in `shared/`, with a `server/*.test.ts` beside the others
    (`utcOffset`, `streak`, `passwordValidation`, `supabaseSession`).
  - **Browser code is imported into a `server/*.test.ts` directly**, stubbing `localStorage` and
    `fetch` with `vi.stubGlobal` — see `server/supabase-session-refresh.test.ts` pulling in
    `client/src/lib/supabaseAuth.ts`. It works only while the module imports nothing but `@shared`;
    the moment it imports React, this seam is gone. The config was deliberately **not** widened to
    collect `client/`, so anything needing a DOM is still untestable.
- **Wiring is where defects hide, so test the wiring.** Ticket 24 was opened because no test drove
  the real app, and ticket 27's whole bug lived in what `main.tsx` did with a function rather than in
  the function. `client/src/lib/trpcAuth.ts` exists so that line has a test on it. If a fix's
  load-bearing line is in a file no test can import, move the line.
- **Mutation-test every enforcement claim**: break the check, confirm a test fails, restore. Every
  ticket in this effort did it, and it caught real defects.
- **Run `/code-review` before committing.** It found genuine defects every single time, not nits. On
  ticket 11 it caught the bug the ticket was written to remove, shipped by the fix itself; on ticket
  27 it caught the fix violating the ticket's own prohibition.
- **Be honest about what a test proves.** Ticket 07's feed-prunable test has arms that cannot fail,
  and says so.
- **Never run `prettier --write` on tracked files.** The committed style is dense single-line code
  that Prettier disagrees with; it reflows whole files and buries the diff.
- **Do not write files containing regex escapes through a shell heredoc.** A `\\?` inside a template
  literal once arrived as a literal `?` quantifier, so a stub returned `[]` and two tests passed
  *vacuously*. Use Write/Edit, and always confirm a new test fails before making it pass.
- **Shell scripts must be LF.** `bash` on this machine resolves to WSL's bash, which reads CRLF as
  part of each command. Git Bash tolerates it, so a script can pass `bash -n` and still not run.
  `.gitattributes` covers tracked `*.sh` with `*.sh text eol=lf`, which **now includes the two
  wizards** — they moved into `docs/` on 2026-09-25 and are tracked, so git normalises them. Files
  under `.claude/` remain untracked and are not git's to normalise.
- `server/_core/**` is vendored scaffold a regeneration will clobber — keep changes out of it.
  `client/src/_core/**` is not covered by that rule; `useAuth.ts` was edited under ticket 27.
- ~~`gh` is not installed.~~ **Corrected 2026-10-01: it is**, version 2.102.0, authenticated as
  `Collinzo2022` with `repo` and `workflow` scopes, so `gh run list`, `gh run view --log`,
  `gh secret list` and `gh workflow run` all work. The stale claim was load-bearing twice: it is why
  `operator-remainder.sh` stage 6 was written to degrade to browser instructions, and why that
  wizard's stages 3 and 5 grew a manual GitHub-secret fallback. Both are still worth keeping — a
  fallback costs nothing and the next machine may differ — but neither was needed here.
  **Probe before believing this line**: `command -v gh && gh auth status`.
  Tickets remain local Markdown in `docs/domain-model-alignment/issues/`; that is a choice, not a
  consequence of tooling.
- Verify with `npx tsc --noEmit`, `npx vitest run`, `npx vite build`.
- **Bundle hashes do not compare across machines.** A local `npx vite build` produces a different
  hash from Vercel's and Render's for the same commit: `@builder.io/vite-plugin-jsx-loc` embeds
  source paths, which differ between this Windows checkout and a Linux CI one. The Vercel↔Render
  comparison in "What went wrong" is still sound — both are Linux CI builds — but never use a local
  build as the reference.

## Decisions made that the tickets did not settle

Each was surfaced to the user and none overruled. Do not silently reverse them.

1. **A malformed UTC offset is refused with 400** (ticket 10); a missing one is UTC and never fails.
2. **`getVerifiedEntitlements` → `verifyFullAccess`; `shared/entitlements.ts` →
   `shared/fullAccess.ts`** (ticket 12) — CONTEXT.md has no "entitlement" and ADR 0001 abolishes the
   concept. Extended later to `subscriptions.plan_snapshot`, the last column carrying the word.
3. **Ticket 06 was widened** from "switch the evidence" to "create the evidence, then switch".
4. **An XP Entry names its source as (kind, unit id)**, not the Completion row's own id (ticket 08).
5. **The XP total is recomputed by a `recompute_learner_xp` database function**, not patched by the
   application — the read and the write must be one statement holding one row lock, or the ticket-08
   race survives.
6. **The alignment migrations became history rather than being deleted** (ticket 14). Recorded in
   `production_architecture.md`; **nothing in that section is a live instruction.**
7. **The Streak's offset is threaded as an explicit parameter**, not read from an ambient value, so
   the typechecker names every path that needs it. It found all twelve (ticket 11).
8. **Android is closed, not blocked.** No release ships; `docs/android_handoff.md` is a spec kept in
   the repo and sent to nobody.
9. **A session between expiry and its next refresh still counts as signed in** (ticket 27).
   `hasSupabaseSession` says yes, `getFreshSupabaseAccessToken` renews. Reading "is there a live
   token" as "is the Learner signed in" is the symptom the ticket forbade curing that way.
10. **The Supabase refresh is single-flighted**, and the ticket did not ask for it. Supabase rotates
    the refresh token on use, so two concurrent refreshes mean the second presents a spent token and
    clears the session the first renewed. tRPC batches on page load, exactly when a session is stale.
11. **`getSupabaseAccessToken` was deleted rather than fixed** (ticket 27), although the ticket named
    it. Once `useAuth` moved to `hasSupabaseSession` and the header path to
    `getFreshSupabaseAccessToken` it had no production caller, and an export kept alive by its own
    tests is dead code. The "null past expiry" requirement lives in `decideSessionUse`.
12. **The public Supabase config is stored in `localStorage` beside the session** (ticket 27),
    because a refresh runs outside React and cannot wait on the `auth.supabaseConfig` query. Both
    values already ship to every visitor. The cost is one forced sign-in, once.
13. **The orphaned ₦120,000 is closed as a no-op rather than refunded** (ticket 30, 2026-09-28). A
    refund was the user's first instruction and was reconsidered once the transaction was shown to
    be `domain: test`: refunding test currency proves the refund path in the one mode where it does
    not matter. The `cancelled` subscription stands and the account can check out again whenever
    wanted.

### Do not reinstate these

- ~~Rehearse the reset against a scratch project first.~~ No reset runs: the replay went into a
  fresh, empty project.
- ~~Ticket 11 is not done until Android sends the header.~~ Android is closed.
- ~~Ticket 11 must choose between a backfill and ±12h-fuzzy pre-11 days.~~ No backfill is needed.
- ~~The four ticket-05/06/09 migration obligations.~~ All assumed the one environment would be
  *migrated*. It was replaced instead.
- ~~Ticket 27 needs `getSupabaseAccessToken` to return null past expiry.~~ The function is gone; the
  behaviour is `decideSessionUse`'s.
- ~~Stage 8 is closed by Paystack's "Send test webhook" button.~~ No such button exists.
- ~~The owner's account is locked out of a new checkout by a `pending` subscription.~~ Those rows
  are `cancelled` as of 2026-09-28, and since ticket 34 `initializeCheckout` no longer counts
  `pending` as access at all.
- ~~The 03:43Z ₦120,000 needs reconciling through `/payment/complete`.~~ It is on another Paystack
  business and was test money. Ticket 30, closed as a no-op.
- ~~Everything committed after `703e1cf` is documentation and changes nothing either host serves.~~
  **Said twice, true when written, false within days both times.** `e471f98` is the code tip now. Ask
  `git diff --stat` rather than repeating the claim a third time.
- ~~The reconciliation work is engineering work waiting on `/implement`.~~ Tickets 33, 34 and 35 are
  built and live. What is left is a migration and a secret.
- ~~`PaymentComplete.tsx` tells a Learner whose payment was reversed that it "may still be
  processing".~~ Closed in `e471f98` itself: the page now renders the server's own message and falls
  back to that copy only when there is none. Ticket 35's Comments called it an open loose end "worth
  a ticket" in one paragraph and corrected that two paragraphs later; **the stale half is struck as
  of 2026-10-01.** Read the whole of a ticket's Comments before acting on any one finding in them.
- ~~A `file.ts:NN` citation is a good way to point at a guard.~~ **Struck 2026-10-01, and this is the
  general form of the rot above.** Ticket 32 cited `server/paystack.ts:45` and `:46` for
  `initializeCheckout`'s two guards; ticket 34's own commit `a7383dc` then moved that function by
  ~34 lines, and every copy of those numbers — in ticket 32, in this file, and in
  `operator-remainder.sh`'s warnings about a cutover that moves money — was wrong from that moment.
  The re-verification commit `50b9e77` re-measured the test suite, the bundles and the deployment,
  and never thought to re-check a line number. **Cite a symbol and the thrown message instead**: a
  refactor carries those along, and a reader can `grep` for them. Line numbers are acceptable only
  for a file nothing edits any more, and even then they are a convenience, not the citation.

## Suggested skills

- **`tdd`** — the ticket-01 Supabase seam (`server/testing/supabaseStub.ts`) exists so data-model
  changes can be driven test-first. Stage rows behind the same filter production queries use, so a
  dropped filter misses the stub.
- **`code-review`** — before every commit. It looks for `docs/agents/issue-tracker.md`, which exists;
  pass it the ticket's path, and while other work sits in the tree, name the ticket's files so the
  reviewers ignore the rest. On uncommitted work, tell it the new files explicitly: `git diff HEAD`
  does not show untracked ones.
- **`domain-modeling`** — before editing `CONTEXT.md` or writing an ADR.
- **`grill-with-docs`** — for F1, which is an idea rather than a procedure.
- **`diagnosing-bugs`** — for the dev server that never binds, if that becomes a ticket. It is the
  shape that skill is for: no output, no error, and no obvious first glance.
- **`wizard`** — for everything now outstanding, which is all operator work: the ticket 35 migration
  and secret, ticket 32's plan codes, ticket 31's key rotation, and the remaining two stages of
  `finish-switch-wizard.sh`. That list has been re-explained to an agent in three separate sessions,
  which is the signal the skill exists for. **Whatever it generates must not re-walk a stage already
  taken** — both existing wizards lack resume state, and that is what made stage 7 unsurvivable.

No secrets appear in this document. Credentials live in environment variables; the Supabase project
ref and the Render and Vercel addresses are public identifiers, and no key was read.
