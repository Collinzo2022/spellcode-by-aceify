# SpellCode by Aceify

**SpellCode by Aceify** is an interactive coding-learning platform for learners progressing through **HTML**, **CSS**, and **JavaScript**. It combines guided browser coding, live previews, daily practice, verifiable XP and awards, paid learning access, projects, certificates, and an Android companion application.

> The first learning experience is deliberately practical: learners can open the **Beginner Build Lab**, edit a real mini webpage, see a live preview, run an instant requirements check, and save completed missions for server-verified XP.

| Resource | Address |
|---|---|
| Production web application | [spellcode-tnyv8stq.manus.space](https://spellcode-tnyv8stq.manus.space) |
| Vercel static frontend | [spellcode-by-aceify.vercel.app](https://spellcode-by-aceify.vercel.app) |
| Backend/API host | `https://spellcode-tnyv8stq.manus.space` |
| Android companion package | `com.bayospel.spelcode` |

## Learning experience

SpellCode is designed around short, purposeful practice rather than passive watching. The learner starts with a beginner quest, builds a small piece of HTML in the browser, receives immediate structural feedback, and progresses through the full curriculum as each verified activity is saved.

| Area | Included capabilities |
|---|---|
| **Beginner Build Lab** | Three sequential HTML build missions, editable code, live sandboxed preview, instant checks, server-saved completion, and XP rewards. |
| **Curriculum** | Exactly three tracks: **HTML**, **CSS**, and **JavaScript**, with **Beginner**, **Intermediate**, and **Advanced** lessons. |
| **Code workspace** | Theory, examples, challenge requirements, progressive hints, HTML/CSS/JavaScript editing, and live preview. |
| **Daily loop** | Daily coding task, streak tracking, XP, completion recovery states, and activity history. |
| **Verified awards** | Badges unlock only from persisted evidence: completed lessons, passed coding challenges, streaks, XP, guided projects, and Beginner Build Lab missions. |
| **Learner records** | Dashboard and profile show real XP, streak, lesson progress, activity, earned awards, award criteria, and measured next goals. |
| **Full Access** | Paid access gates later lessons, guided-project publishing, certificates, and unlimited AI tutor use. |

### Verified award rules

Awards are not seeded as learner achievements or shown as already earned. The backend recalculates eligibility from Supabase records, writes an achievement only when its criterion is satisfied, and records the unlock in learner activity.

| Award | Verified condition |
|---|---|
| First Spark | Complete any lesson. |
| Launchpad | Clear all three Beginner Build Lab missions. |
| Code Checker | Pass a coding challenge. |
| Daily Rhythm | Reach a three-day learning streak. |
| Steady Hand | Earn 200 XP. |
| Pathfinder | Complete the first HTML and CSS mission sequence. |
| Builder | Complete a guided project. |

## Product architecture

The active production data path is **Supabase only**. Supabase Auth provides the learner identity and bearer session; Supabase Postgres stores profiles, curriculum, learning state, payments, awards, projects, and certificates. The former Drizzle/MySQL path is not used by the production application.

| Concern | Implementation |
|---|---|
| Frontend | React 19, Vite, Tailwind CSS 4, Wouter, TanStack Query, tRPC client. |
| Backend | Express 4, tRPC 11, Zod validation, server-side Supabase REST helper. |
| Identity | Supabase email/password authentication, with profile UUIDs bridged to `auth.users`. |
| Learning state | Supabase Postgres tables for progress, challenges, daily tasks, activities, and awards. |
| Payments | Paystack checkout, server-side verification, entitlement enforcement, and idempotent webhook processing. |
| Web deployment | Vercel serves the static Vite frontend and proxies `/api/*` to the Manus-hosted Express backend. |
| Mobile | Separate Expo/React Native Android companion app using the same production API. |

The detailed production model is available in [docs/production_architecture.md](docs/production_architecture.md).

## Repository layout

```text
client/                 React application and page experiences
  src/pages/            Public, learner, admin, and interactive lab screens
  src/components/       Reusable UI, app chrome, awards, and learning components
server/                 Express, tRPC, Supabase, billing, AI, and mobile routes
shared/                 Curriculum, award criteria, Beginner Build Lab rules, types
docs/                   Supabase SQL, deployment guidance, validation records
```

## Local development

Use **Node.js 22** and **pnpm**. Do not commit environment files or service keys.

```bash
pnpm install
pnpm dev
```

The development server runs the Express application with Vite integration. To run the type checker, tests, and production build:

```bash
pnpm check
pnpm test
pnpm build
pnpm start
```

> `pnpm db:push` is a legacy template script and is **not** the production database workflow. SpellCode uses the committed Supabase SQL files described below.

## Environment configuration

Secrets belong in the managed backend environment, never in the repository or Vercel static build. The Vercel deployment does not require server-side Supabase, Paystack, storage, or AI keys because its `/api/*` calls proxy to the managed backend.

| Variable | Required by | Purpose |
|---|---|---|
| `SUPABASE_URL` | Backend | Supabase project URL. |
| `SUPABASE_ANON_KEY` | Backend | Validates authenticated learner bearer sessions. |
| `SUPABASE_SERVICE_ROLE_KEY` | Backend | Performs server-authorized learning, billing, and award operations. |
| `PAYSTACK_PUBLIC_KEY` | Frontend configuration | Initializes the payment experience. |
| `PAYSTACK_SECRET_KEY` | Backend | Creates/verifies payments and validates webhooks. |
| `BUILT_IN_FORGE_API_URL` | Backend | Managed platform integrations. |
| `BUILT_IN_FORGE_API_KEY` | Backend | Authorizes managed platform integrations. |

For public sign-up volume, configure an SMTP provider in **Supabase Authentication → SMTP**. The in-app cooldown helps avoid repeated confirmation requests, but it cannot remove a project-wide mail-provider rate limit; Supabase documents the provider and rate-limit configuration separately.[1]

## Supabase setup and migrations

Create a Supabase project and run the committed SQL files in the SQL Editor, in this order:

1. `docs/supabase_schema_draft.sql`
2. `docs/supabase_auth_profile_bridge_migration.sql`
3. `docs/supabase_daily_admin_payments_migration.sql`
4. `docs/supabase_project_publishing_migration.sql`
5. `docs/supabase_certificate_issuance_migration.sql`
6. `docs/supabase_admin_reporting_views.sql`

The auth-profile bridge is important: it creates a matching `public.profiles` record when a new Supabase user is created. The backend also has an idempotent fallback for older users, but the database trigger is the standard sign-up path.

Additional reference material is available in [docs/supabase_database_blueprint.md](docs/supabase_database_blueprint.md) and [docs/production_architecture.md](docs/production_architecture.md).

## Payments and access

All billing uses **NGN** and is processed through Paystack.

| Plan | Price | Billing behavior |
|---|---:|---|
| Full Access — One-time | ₦120,000 | One payment. |
| Full Access — 3-month installment | ₦40,000/month | Maximum of three charges. |
| Full Access — 6-month installment | ₦20,000/month | Maximum of six charges. |

Set the Paystack plan codes in Supabase before activating the installment plans. Configure the Paystack webhook endpoint as:

```text
https://spellcode-tnyv8stq.manus.space/api/paystack/webhook
```

The webhook handler verifies the signature and processes transaction references idempotently. Complete a controlled production payment after configuration so checkout, webhook delivery, and entitlement activation can be accepted end to end. Paystack’s official webhook guidance is linked in the references.[2]

## Administrator access

An administrator is a normal Supabase user whose `profiles.role` is set to `admin`. Use the Supabase SQL Editor once to promote the initial administrator:

```sql
update profiles
set role = 'admin'
where id = '<supabase-user-uuid>';
```

The administrator dashboard provides plan management and learner subscription/payment reporting. Keep service-role credentials on the backend; administrative browser sessions must remain ordinary signed-in Supabase sessions.

## Deployment

The repository’s `vercel.json` builds the Vite client and preserves single-page application navigation. It rewrites `/api/*` to the Manus-hosted backend instead of running the Express server as a Vercel function.

```text
Vercel static frontend → /api/* proxy → Manus Express backend → Supabase / Paystack
```

Pushes to `main` on the `Bayospel/spellcode-by-aceify` repository trigger the connected Vercel deployment. This codebase is also synchronized to `kolinzoo/spellcode-by-aceify`.

## Testing and quality checks

The test suite covers core curriculum contracts, progress and challenge validation, entitlement rules, Paystack webhook idempotency, Supabase auth behavior, sign-up recovery, verified award criteria, and Beginner Build Lab checks.

```bash
pnpm check && pnpm test && pnpm build
```

The current release passes **16 test files** and a production build. Visual checks also cover the interactive Beginner Build Lab in light and dark mode; see [docs/theme_visual_validation.md](docs/theme_visual_validation.md).

## Production acceptance checklist

Before treating a production rollout as fully accepted, complete these external checks with real accounts and payment settings:

- Sign in through the deployed Vercel application and confirm Dashboard returns current XP, streak, completed lessons, and activity.
- Complete a real Paystack transaction and confirm the webhook is delivered and access is activated once.
- Test a newly registered Supabase user after SMTP configuration and verify email confirmation routes back to the deployed SpellCode page.
- Log in as an administrator and confirm the billing/reporting dashboard reflects live data.

## Related repositories

| Repository | Purpose |
|---|---|
| [Bayospel/spellcode-by-aceify](https://github.com/Bayospel/spellcode-by-aceify) | Primary web repository connected to Vercel. |
| [kolinzoo/spellcode-by-aceify](https://github.com/kolinzoo/spellcode-by-aceify) | Private mirror of the web repository. |
| [Bayospel/spellcode-android](https://github.com/Bayospel/spellcode-android) | Expo/React Native Android companion source. |

## License

This project is released under the [MIT License](LICENSE).

## References

[1]: https://supabase.com/docs/guides/auth/rate-limits "Supabase Auth Rate Limits"
[2]: https://paystack.com/docs/payments/webhooks/ "Paystack Webhooks"
