# SpellCode by Aceify Production Architecture

## Authoritative data platform

**Supabase Postgres is the only production database.** Supabase Auth owns learner identities, while the `profiles` table uses the same UUID as `auth.users`. The application stores curriculum, enrollments, lesson progress, challenge attempts, daily tasks, activity events, achievements, project publications, certificates, plans, subscriptions, and Paystack transaction/webhook records in the Supabase schema.

The former Drizzle/MySQL implementation has been removed from the active codebase. No server route, tRPC procedure, or authentication flow reads or writes the legacy `users`, `learnerStats`, `trackEnrollments`, `lessonProgress`, `challengeAttempts`, `learnerAchievements`, or `learningActivity` tables.

| Concern | Authoritative component |
|---|---|
| Identity and sessions | Supabase Auth bearer tokens |
| Learner profile, XP, streak, progress, activity, achievements | Supabase Postgres |
| Billing, Paystack verification, entitlements | Supabase Postgres plus Paystack webhooks |
| Published projects and certificate artifacts | Managed storage plus Supabase metadata |
| Web frontend | Vite/React static output |
| API, tRPC, mobile routes, Paystack webhook | Express handler exported as a Vercel Function |

## Vercel deployment contract

Vercel builds the Vite client into `dist/public` with `pnpm vite build`. The root `vercel.json` declares that directory as the deployment output and preserves SPA navigation by rewriting non-API routes to `index.html`.

The API entrypoint is `api/[...path].ts`. It exports the shared Express application without calling `listen()`, allowing Vercel to execute the existing tRPC API, mobile API, storage proxy, and `/api/paystack/webhook` endpoint as a serverless function. The local Manus server uses the same shared application through `server/app.ts` before attaching Vite middleware or static serving.

## Required Vercel environment variables

Configure these in Vercel for **Production** and any preview environment that must exercise authenticated API behavior. Do not commit values to the repository.

| Variable | Purpose |
|---|---|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_ANON_KEY` | Browser and bearer-token validation key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only Supabase data access |
| `PAYSTACK_SECRET_KEY` | Checkout verification and webhook signature validation |
| `JWT_SECRET` | Cookie/signing compatibility for framework infrastructure |
| `BUILT_IN_FORGE_API_URL` and `BUILT_IN_FORGE_API_KEY` | Server-side managed storage and AI features, where enabled |

After importing this repository into Vercel, use the repository root as the project root. Do not set `server/_core/index.ts` as Vercel's entrypoint and do not use a command that serves TypeScript source directly. Vercel must use the committed `vercel.json`, `api/[...path].ts`, and Vite build output.
