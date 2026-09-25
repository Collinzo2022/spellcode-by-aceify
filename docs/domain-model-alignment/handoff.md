# Handoff — Domain Model Alignment (SpellCode by Aceify)

Rewritten **2026-09-25**, superseding the 2026-09-24 revision, which put `main` at `5753e04` and
described tickets 24 and 27 as outstanding. Both are done. Repo:
`C:\Users\aefue\Desktop\Projects\Spellcode\spellcode-by-aceify`.

**Moved 2026-09-25 from `.scratch/domain-model-alignment/` to `docs/domain-model-alignment/`, and
now tracked.** This file, `spec.md` and `issues/` beside it were gitignored and travelled only with
the working copy; they are version-controlled from here on, so **they are visible to everyone with
repo access, and edits to them belong in commits like any other file.** Two consequences worth
carrying: the backend engineer working on F2 can now read these directly, and a deleted ticket is
recoverable from history rather than gone.

**The effort is over as a build, and the last launch blocker is now fixed in code.** Every ticket
01–24 and 27 is closed. **Four remain: 25, 26, 28 and 29**, and only 29 is engineering — the other
three are operator work in a dashboard. What is left is finishing the switch off Manus, which is a
procedure, and `finish-switch-wizard.sh` walks it. (This sentence read "tickets 25 and 26 remain"
until 2026-09-26, having been written before 28 and 29 existed.)

**`703e1cf` is pushed**, confirmed by `git ls-remote` and by the `update by push` in
`git reflog show origin/main`. An earlier revision of this file said the commit was unpushed and that
nothing below was testable until it was — that is no longer true. (It is an ancestor of `main`, not
its tip; this file deliberately no longer says what the tip is — see "Verified state".)
**Both hosts have rebuilt from it**, verified by probe on 2026-09-25 (see "Deployment confirmed"),
so ticket 27's fix is live and stage 10 is unblocked. See "What is left".

## The production address changed — read this first

**Production is `https://spellcode-by-aceify-two.vercel.app`.** The `-two` is permanent and
deliberate. Anyone who "corrects" it will point the project back at a dead site.

**The old address is not dead — it is stale, which is worse.** `https://spellcode-by-aceify.vercel.app`
still returns 200 and serves the pre-fix 367,903-byte shell, and its API still runs pre-alignment
server code that **successfully authenticates to the current Supabase project** (it answers with a
42703 `plans.paid_features does not exist`, i.e. a 400 from a request that was authorized). It cost
a real stage 10 checkout attempt on 2026-09-24 before anyone noticed. **Ticket 26**: delete or
disable that Vercel project. Do not use its removal as an excuse to reclaim the unsuffixed name.

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
| 8 Paystack webhook → Render | **NOT done. The URL was never configured** — the dashboard's Test Webhook URL was found empty on 2026-09-25, which is the whole of ticket 28. The endpoint itself is verified; only the dashboard field is missing. See below |
| 9 Local checks against the new project | done 2026-09-24 — 190 passed, 0 skipped, 0 failed. Now 217, re-run after `703e1cf` was committed |
| 10 Acceptance in test mode | **ran 2026-09-25 03:43Z and failed — see ticket 28.** The card charge succeeded at Paystack; the application recorded nothing, because stage 8 was never actually completed. **Blocked on stage 8 being done for real**, then re-run. The 03:43Z payment stays orphaned either way and needs reconciling by hand |
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
checkout, proving a `charge.success` row actually arrived, reconciling the orphaned 03:43Z payment
through `/payment/complete?reference=…` rather than by editing rows, stage 11, ticket 26, and a look
at the live-mode webhook field. It asks for no secrets, and its checks read `.env` and send nothing
but GET. Stages 5, 7, 8 and 9 each confirm before they act, and it refuses to let you pause the live
Supabase project, delete the wrong Vercel project, reclaim the freed unsuffixed name, or run the
checkout on the account that cannot start one.

Two things it does not do: it is not a substitute for reading ticket 28 first, and it was checked
with `bash -n` but never run end to end, because it opens browsers and blocks on input. The first
person to run it is also testing it.

### Stage 8, stated once

**Corrected 2026-09-25: the webhook URL was never set.** This section previously opened "The webhook
URL is set", which was an assumption nobody had checked — the dashboard's **Test Webhook URL** field
was found empty, and that is why the stage 10 payment vanished (ticket 28). Everything below about
the *endpoint* still stands and was worth proving; what was missing was Paystack's side of it.

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

## Ticket 27, and what it means for stage 10

Fixed 2026-09-25 as `703e1cf`. Every signed-in Learner was logged out about an hour after signing in,
still shown as signed in, told nothing, and stuck until they cleared `localStorage`. It is why the
stage 10 checkout produced no transaction three times running. The ticket file holds the diagnosis
and the implementation notes; what matters here:

- **It is pushed and deployed.** `origin/main` is at `703e1cf`, and both hosts serve a bundle
  containing the fix — see "Deployment confirmed". Production no longer carries the defect, so a
  stage 10 failure now means something new rather than the 2026-09-24 cause.
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

## Deployment confirmed, 2026-09-25

Probed directly, not read from a dashboard. **The frontend bundle is now `index-DKKVNU9H.js`**,
superseding the `index-C3D4LG3z.js` recorded on 2026-09-24.

| Host | `/` bundle | `/api/mobile/config` |
|---|---|---|
| `spellcode-backend.onrender.com` | `index-DKKVNU9H.js` | 200 `application/json` |
| `spellcode-by-aceify-two.vercel.app` | `index-DKKVNU9H.js` | 200 `application/json` |
| `spellcode-by-aceify.vercel.app` (stale) | `index-B_rCL-2W.js` | 200 `text/html` |

Both live bundles are **1,503,882 bytes and identical to each other**, which is the same
Vercel↔Render agreement that diagnosed the wrong-org fault — both are Linux CI builds, so they are
comparable (a local build is not; see Working conventions).

**A changed hash alone would not prove ticket 27 shipped**, so the bundle was searched for a string
the fix introduced: `CONFIG_STORAGE_KEY = "spellcode-supabase-config"`
(`shared/supabaseSession.ts:27`), which exists only from `703e1cf`. It is present in the bundle
served by **both** hosts, alongside the pre-existing `spellcode-supabase-session`. That is direct
evidence of the fix in production rather than an inference from a filename.

**Ticket 26 is unaffected and still open.** The stale project is still serving its pre-fix shell and
still answering the API path with HTML.

## Verified state, 2026-09-25

- **Suite: 217 passed, 2 skipped, 0 failed, of 219, across 34 files.** Re-run after `703e1cf` was
  committed, so with CRLF normalisation applied — not quoted from a commit message. The two skips are
  the credential-gated tests in `server/external-config.test.ts` and each prints its reason
  (`SUPABASE_URL, SUPABASE_ANON_KEY not set`, `PAYSTACK_SECRET_KEY not set`). Any other skip, or any
  failure, is new.
- `npx tsc --noEmit` clean. `npx vite build` clean.
- **The last commit that changed code is `703e1cf`** (ticket 27), which is where the three figures
  above were measured. Everything committed after it is documentation and one shell script, so those
  figures still describe the code that runs — but nobody has re-run them to say so.

  **This section no longer states what HEAD is.** It said `703e1cf`, then `840921e`, and went stale
  both times within a day — once inside the very commit that corrected it. A SHA in a file is a claim
  that rots; the same question answered from git cannot. Ask git:

  ```bash
  git log --oneline -1 && git status --short && git ls-remote origin main
  ```

  A clean `status` and an `ls-remote` matching `HEAD` mean nothing is unpushed. And to check whether
  the figures above have gone stale — i.e. whether code has landed since they were taken:

  ```bash
  git diff --stat 703e1cf..HEAD -- server client shared
  ```

  Empty output means the suite, `tsc` and `vite build` results above still hold. Any output means
  re-run them before trusting this section.
- `18b4bd4`, `285bdf1` and `703e1cf` are pushed **and deployed**, `703e1cf` confirmed on both hosts
  ("Deployment confirmed"). Commits after it have been docs-only and change nothing either host
  serves; the `git diff --stat` above is how you check that is still true.
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
   `origin/main` is at `703e1cf` and both hosts serve a bundle carrying the fix ("Deployment
   confirmed"). Nothing below is blocked on it any more.
   Kept in place rather than deleted so the list reads as a record. **Cite these items by title, not
   by number** — the 2026-09-25 rewrite renumbered them, which silently broke the references in
   tickets 21 and 23; both now name what they mean.
2. **Stage 8, then stage 10 — in that order. Read ticket 28 before touching either.**
   **`finish-switch-wizard.sh` walks all of this, and items 3, 4 and 5's first box too** — see "Where
   the switch stands". Read this item and ticket 28 first anyway; the wizard executes the procedure,
   it does not explain why. Stage 10 ran
   on 2026-09-25 at 03:43Z and failed: the charge succeeded at Paystack (`spellcode-5a09dd9d-…`,
   ₦120,000, `success`) and the application recorded none of it. **A Learner paid and has no Full
   Access.**

   **The cause is settled — Paystack's Test Webhook URL was never set.** The dashboard field is
   empty, so no delivery was ever attempted and none can be retried. Three things follow:

   - **Set it first:** `https://spellcode-backend.onrender.com/api/paystack/webhook`, in **test**
     mode, Settings → API Keys & Webhooks. That is stage 8, done properly this time.
   - **Setting it does not replay the 03:43Z payment.** That row needs reconciling by hand, which is
     a write to production billing state and wants an explicit decision on *how* — the server's own
     verify path in preference to editing rows.
   - **⚠ The re-run is blocked until that row is resolved.** The orphaned checkout left a `pending`
     subscription, and `initializeCheckout` refuses a second checkout while one exists for that plan
     (`server/paystack.ts:48-49`). The owner's account cannot start another `full-access-one-time`
     purchase. **Use a second test account for stage 10**, or reconcile first. See ticket 29, which
     owns this defect.
   - **Check the live-mode field too before launch.** It is separate, and nothing suggests it was
     set either.

   Everything below about this stage was written when it was still ahead of us; it is kept as the
   procedure for the *next* attempt.
   Sign in, buy with a Paystack test card. **Wake Render
   first** — the 30s-vs-45s timeout note above makes a sleeping instance a hard blocker, not a delay.
   Ticket 25 found the real cause of the earlier failures: all three plans were `is_active: false`,
   so no checkout could start and no webhook could ever fire, which is why Paystack's event log is
   empty. It was never a webhook problem. **`full-access-one-time` was activated 2026-09-24 18:50
   UTC** and is confirmed live through the public `accessOptions` on both hosts; being `one_time` it
   needs no Paystack plan object. The two installment plans stay inactive until they have test-mode
   plan codes and do not block stage 10.
   **This attempt is also ticket 27's only real verification.** Expect one forced sign-in.
3. **Stage 11**, pausing the old Supabase project. Operator, dashboard only.
4. **Ticket 26**, deleting or disabling the stale Vercel project. Operator, dashboard only.
5. **The launch checklist**, before any real Learner:
   - [ ] **Paystack's live-mode Webhook URL actually set**, and confirmed by eye in the dashboard.
         Test and live are separate fields; the test one was found empty on 2026-09-25 after being
         assumed set since the switch (ticket 28), so assume nothing about this one.
   - [ ] A live-money Paystack test, with Render on the live keys and the live webhook
         (`todo.md:48`).
   - [ ] A Render instance that does not sleep. **A stage 10 blocker, not just a launch item.**
   - [ ] Custom SMTP for Auth email, in place of the rate-limited built-in sender.
   - [ ] Both Forge follow-ups done.
   - Ticket 11 is **off this list** — its server half deploys with the Render build.
   - Not gates: the Android release (closed), and an API domain (dropped when Android closed).
6. **Ticket 29, the reconciliation sweep.** Written 2026-09-25, buildable, blocked by nothing.
   Nothing server-side ever re-examines a `payment_transactions` row left at `initialized`, so a paid
   Learner can wait forever — which is what happened on 2026-09-25 — and an *abandoned* checkout
   leaves a `pending` subscription that locks that Learner out of the plan permanently. Best
   sequenced after stage 10 passes, so it is written against a payment path known to work.
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
- `gh` is not installed. Tickets are local Markdown in `docs/domain-model-alignment/issues/`.
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

No secrets appear in this document. Credentials live in environment variables; the Supabase project
ref and the Render and Vercel addresses are public identifiers, and no key was read.
