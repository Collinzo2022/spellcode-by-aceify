# SpellCode by Aceify Production Architecture

## Authoritative data platform

**Supabase Postgres is the only production database.** Supabase Auth owns learner identities, while the `profiles` table uses the same UUID as `auth.users`. The application stores curriculum, enrollments, lesson progress, challenge attempts, daily tasks, activity events, awards, project publications, certificates, plans, subscriptions, and Paystack transaction/webhook records in the Supabase schema.

The former Drizzle/MySQL implementation has been removed from the active codebase. No server route, tRPC procedure, or authentication flow reads or writes the legacy `users`, `learnerStats`, `trackEnrollments`, `lessonProgress`, `challengeAttempts`, `learnerAchievements`, or `learningActivity` tables.

## Supabase schema replay order

Run the committed SQL files in the Supabase SQL Editor in this order when initializing a new environment: `supabase_schema_draft.sql`, `supabase_auth_profile_bridge_migration.sql`, `supabase_daily_admin_payments_migration.sql`, `supabase_project_publishing_migration.sql`, `supabase_certificate_issuance_migration.sql`, and `supabase_admin_reporting_views.sql`. The auth-profile bridge creates one `public.profiles` row for every new `auth.users` identity, which provides the durable row used for learner XP, streak, completed lessons, activity, and role.

The backend also provisions a missing profile idempotently on an authenticated request, protecting existing users created before the trigger was installed. This fallback does not replace the database trigger; the trigger is the normal sign-up path.

A **new environment initialized from `supabase_schema_draft.sql` already has the current object names and must not run `supabase_award_rename_migration.sql`.** That migration exists only to bring an environment created before the rename into line.

### Migrations that must be run before the application is deployed

`supabase_award_rename_migration.sql` renames the recognition tables to `awards` and `user_awards`. The application queries the new names, so the order is: **run the migration first, then deploy.**

Getting it backwards fails loudly rather than silently. The server-side Supabase helper throws on any non-2xx response and PostgREST answers an unknown table with 404, so a build pointed at the wrong schema errors on its award reads instead of quietly reporting zero Earned Awards. No Learner loses recognition in either direction — the mismatch window is an outage, not data loss, and should be kept short. `supabase_award_rename_rollback.sql` reverses the migration and must be paired with rolling the application back.

| Concern | Authoritative component |
|---|---|
| Identity and sessions | Supabase Auth bearer tokens |
| Learner profile, XP, streak, progress, activity, awards | Supabase Postgres |
| Billing, Paystack verification, entitlements | Supabase Postgres plus Paystack webhooks |
| Published projects and certificate artifacts | Managed storage plus Supabase metadata |
| Web frontend | Vite/React static output |
| API, tRPC, mobile routes, Paystack webhook | Stable Manus-hosted Express backend |

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
