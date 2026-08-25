# SpellCode by Aceify Production Architecture

## Authoritative data platform

**Supabase Postgres is the only production database.** Supabase Auth owns learner identities, while the `profiles` table uses the same UUID as `auth.users`. The application stores curriculum, enrollments, lesson progress, challenge attempts, daily tasks, activity events, awards, project publications, certificates, plans, subscriptions, and Paystack transaction/webhook records in the Supabase schema.

The former Drizzle/MySQL implementation has been removed from the active codebase. No server route, tRPC procedure, or authentication flow reads or writes the legacy `users`, `learnerStats`, `trackEnrollments`, `lessonProgress`, `challengeAttempts`, `learnerAchievements`, or `learningActivity` tables.

## Supabase schema replay order

Run the committed SQL files in the Supabase SQL Editor in this order when initializing a new environment: `supabase_schema_draft.sql`, `supabase_auth_profile_bridge_migration.sql`, `supabase_daily_admin_payments_migration.sql`, `supabase_project_publishing_migration.sql`, `supabase_certificate_issuance_migration.sql`, and `supabase_admin_reporting_views.sql`. The auth-profile bridge creates one `public.profiles` row for every new `auth.users` identity, which provides the durable row used for learner XP, streak, completed lessons, activity, and role.

The backend also provisions a missing profile idempotently on an authenticated request, protecting existing users created before the trigger was installed. This fallback does not replace the database trigger; the trigger is the normal sign-up path.

A **new environment initialized from the replay order above already matches the current application and must run none of `supabase_award_rename_migration.sql`, `supabase_full_access_single_gate_migration.sql`, `supabase_mission_completion_migration.sql`, `supabase_xp_entry_ledger_migration.sql`, or `supabase_xp_opening_balance_migration.sql`.** Each exists only to bring an environment created before those changes into line; `supabase_schema_draft.sql` already carries `public.missions`, `public.mission_completions`, `public.xp_entries` and the `public.learner_xp_totals` view. A new environment has no pre-ledger XP to give an opening balance to.

### Migrations whose order against the deploy matters

The committed migrations below run on opposite sides of the deploy. Read which before running either.

`supabase_award_rename_migration.sql` renames the recognition tables to `awards` and `user_awards`. The application queries the new names, so the order is: **run the migration first, then deploy.**

Getting it backwards fails loudly rather than silently. The server-side Supabase helper throws on any non-2xx response and PostgREST answers an unknown table with 404, so a build pointed at the wrong schema errors on its award reads instead of quietly reporting zero Earned Awards. No Learner loses recognition in either direction — the mismatch window is an outage, not data loss, and should be kept short. `supabase_award_rename_rollback.sql` reverses the migration and must be paired with rolling the application back.

`supabase_project_completion_backfill_migration.sql` copies past Project completions out of the Activity Feed into `project_progress`, which the Builder award now reads. **Deploy first, then run it** — it needs the application to have seeded `public.projects`, and aborts loudly if that table is empty. It is insert-only and idempotent, so running it twice changes nothing and nothing can be lost. Order is not dangerous either way: it decides only how long a Learner who built a Project before the change sees Builder progress of 0. Their Earned Award is unaffected, because reconciliation only ever adds. `supabase_project_completion_backfill_rollback.sql` documents why no reverse is required.

`supabase_mission_completion_migration.sql` creates `public.missions` and `public.mission_completions`, seeds the three Beginner Build Lab Missions, and copies past Mission completions out of the Activity Feed. **Run the migration first, then deploy.** The new build writes a Completion the moment a Learner clears a Mission and would error against a database without the table; the live build reads neither table, so running first is safe for it. Seeding the Missions in SQL rather than leaving them to the application is what makes that order possible — unlike the Project backfill, this one does not wait on a deploy to seed its catalog. **After deploying, re-run the backfill statement on its own** to recover any Mission cleared in the window between, when only a feed row was written; it is idempotent and does nothing on conflict, so a Completion already recorded is never overwritten. Read the read-only inspection queries at the top of the file, and have the unrecoverable count accepted, *before* running it: a feed row whose metadata carries no usable `mission_id` cannot be recovered, and the Learner's Beginner Build Lab progress reads lower than what they did while a cleared Mission reopens. Their Earned Award survives regardless, because reconciliation only ever adds. `supabase_mission_completion_rollback.sql` documents why an application rollback needs no reverse, and why the tables should not be dropped. **Nothing may prune `activity_events` until that post-deploy re-run has completed** — the re-run reads `beginner_module` rows out of the feed, and pruning them first destroys the only remaining record of a Mission cleared in the window. The same holds for `supabase_project_completion_backfill_migration.sql` and its `project` rows.

`supabase_xp_entry_ledger_migration.sql` creates `public.xp_entries`, the system of record for XP (ADR 0002). **Run the migration first, then deploy** — the new build appends an entry on every XP award and would error against a database without the table, while the live build neither reads nor writes it, so there is no window in which XP is lost. It creates a table and nothing else: **existing `profiles.xp` totals are not backfilled, and until ticket 09 ships they are still the Learner's visible total.** Divergence between the cached total and the sum of a Learner's entries is therefore expected and is not a fault. **Do not sum the ledger into `profiles.xp` before ticket 09 has run** — every Learner's pre-ledger XP would be erased, and it has no provenance to restore it from. `supabase_xp_entry_ledger_rollback.sql` explains why a rollback needs no reverse and why the table must not be dropped.

`supabase_xp_opening_balance_migration.sql` creates the `public.learner_xp_totals` view, gives every Learner an opening-balance XP Entry for the part of their total the ledger cannot already account for, and rewrites `profiles.xp` from the ledger. **Run the migration first, then deploy** — the new build reads the view for every XP total and every Steady Hand check. **This is the one irreversible step in the domain-model-alignment work, and it must be rehearsed against a copy of production data before it ships.** Pre-ledger XP has no provenance; the opening balances are the only account of it that will ever exist, so deleting them later destroys rather than restores. The opening balance is deliberately *not* a Learner's whole current total — that would double-count XP earned since the ticket-08 deploy, which is already in the ledger. The only Learners whose visible total moves are those whose cached total had fallen behind their entries through the ticket-08 race, and it moves up, to the XP they actually earned. **No Learner loses XP.** `supabase_xp_opening_balance_rollback.sql` explains why an application rollback is safe and needs nothing run, and why the opening-balance entries must never be deleted.

`supabase_full_access_single_gate_migration.sql` drops `plans.paid_features`, the per-feature column no gate ever consulted (ADR 0001). The order is the reverse: **deploy first, then run the migration.** The old build selects that column on every entitlement check, so dropping it first closes every gate for every Learner who paid, and breaks the plan list on the access page — PostgREST answers a select naming an unknown column with 400. Deploy first and there is no window at all, because the new build never names the column. `supabase_full_access_single_gate_rollback.sql` restores the column and the seeded values, and must run *before* rolling the application back.

| Concern | Authoritative component |
|---|---|
| Identity and sessions | Supabase Auth bearer tokens |
| Learner profile, XP, streak, progress, activity, awards | Supabase Postgres |
| Billing, Paystack verification, Full Access | Supabase Postgres plus Paystack webhooks |
| Published projects and certificate artifacts | Managed storage plus Supabase metadata |
| Web frontend | Vite/React static output |
| API, tRPC, mobile routes, Paystack webhook | Stable Manus-hosted Express backend |

## Pruning the Activity Feed

`activity_events` is presentational (ADR 0003) and, as of ticket 07, genuinely prunable: emptying a Learner's feed leaves every Earned Award, their XP total and their Streak untouched. Every Award counter is recomputed from Completion records; XP and the Streak are read from the profile row, which the feed never fed. The property is held by `server/activity-feed-prunable.test.ts`, which demonstrates it end to end and also checks the source directly, so a future count reading the feed fails a test rather than silently revoking awards.

**No retention or pruning schedule exists, and this is deliberate** — choosing when to prune is a separate decision. Two preconditions bind whoever makes it:

- **The post-deploy re-runs of the two backfills must have completed first**, for the reason given against each migration above: both read rows out of the feed, and pruning first destroys the only record of a Completion made in the window between migration and deploy.
- **The feed is the only human-readable history a Learner has.** Pruning is safe for their standing, not for what they can see. That is a product decision, not an operational one.

## Learner local time

CONTEXT.md defines the **Local Day** and why the server is told it rather than guessing. This is the wire contract that carries it.

| | |
|---|---|
| Header | `x-utc-offset-minutes` |
| Value | Whole minutes **east** of UTC, so UTC+1 is `60` and UTC-5 is `-300`. In JavaScript that is `-new Date().getTimezoneOffset()`, whose sign is the opposite convention. |
| Range | `-720` (UTC-12:00) to `840` (UTC+14:00) inclusive. Offsets that are not whole hours, such as `345`, are valid. |
| Absent | Treated as UTC. A missing offset never fails a request, so an older client keeps working. |
| Malformed | Rejected with `400`. A present but unparseable value can only come from a broken client, and reading it as UTC would hand that Learner a Streak that rolls over at the wrong hour. |

Send it on every request rather than only those that record a completion or read a Streak; that way no future caller has to remember it. Read it per request, not once at startup, so a long session stays correct across a daylight saving change or a flight.

**Both clients must ship this.** The web application sends it from `client/src/main.tsx`. The Android companion is a separate codebase and is **not yet updated** — until it is, its Learners fall back to UTC and can see subtly different Streaks from identical behaviour.

Known and accepted: a numeric offset is client-supplied and therefore spoofable, and it does not survive a daylight saving transition that falls mid-day. The exit, should either matter, is to send a zone identifier and resolve the local day server-side — a change of contract, not a redesign.

## Vercel deployment contract

Vercel builds the Vite client into `dist/public` with `pnpm vite build`. The root `vercel.json` declares that directory as the deployment output and preserves SPA navigation by rewriting non-API routes to `index.html`.

Vercel serves the static Vite client and rewrites every `/api/*` request to the stable Manus-hosted Express backend at `https://spellcode-tnyv8stq.manus.space`. This keeps browser requests same-origin at the Vercel domain while preserving the backend’s managed storage, AI, Paystack, and Supabase integration environment. The local and Manus-hosted backend use the shared application in `server/app.ts` before attaching Vite middleware or static serving.

## Required Vercel environment variables

The Vercel static frontend requires no server-side Supabase, Paystack, storage, or AI secrets. Those values remain only in the Manus-hosted backend environment. Do not commit values to the repository.

| Variable | Purpose |
|---|---|
| `SUPABASE_URL` | Manus-hosted backend only: Supabase project URL |
| `SUPABASE_ANON_KEY` | Manus-hosted backend only: Supabase bearer-token validation |
| `SUPABASE_SERVICE_ROLE_KEY` | Manus-hosted backend only: server-side Supabase data access |
| `PAYSTACK_SECRET_KEY` | Manus-hosted backend only: checkout and webhook verification |
| `BUILT_IN_FORGE_API_URL` and `BUILT_IN_FORGE_API_KEY` | Manus-hosted backend only: managed storage and AI features |

After importing this repository into Vercel, use the repository root as the project root. Do not set `server/_core/index.ts` as Vercel's entrypoint and do not configure a Vercel server function. Vercel must use the committed `vercel.json` and Vite build output. Keep Paystack's webhook configured directly to `https://spellcode-tnyv8stq.manus.space/api/paystack/webhook`.
