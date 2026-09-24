# SpellCode by Aceify

**SpellCode by Aceify** is an interactive coding-learning platform for learners progressing through **HTML**, **CSS**, and **JavaScript**. It combines guided browser coding, live previews, daily practice, verifiable XP and awards, paid learning access, projects, certificates, and an Android companion application.

> The first learning experience is deliberately practical: learners can open the **Beginner Build Lab**, edit a real mini webpage, see a live preview, run an instant requirements check, and save completed missions for server-verified XP.

| Resource | Address |
|---|---|
| Production web application | [spellcode-by-aceify-two.vercel.app](https://spellcode-by-aceify-two.vercel.app) |
| Backend/API host | `https://spellcode-backend.onrender.com` |
| Android companion package | `com.bayospel.spelcode` |

> The former Manus host, `spellcode-tnyv8stq.manus.space`, is **dead to this project**. Nobody can sign into it, it still answers with a build older than `main`, and its keys could not be recovered. It is recorded here only so that an address found in an old document is recognised as abandoned rather than tried.

> **The `-two` in the production address is deliberate — do not "correct" it.** `spellcode-by-aceify.vercel.app` is held by an older Vercel project wired to `Bayospel/spellcode-by-aceify`, which this codebase no longer pushes to; it serves a pre-move build and still proxies `/api/*` to Manus. The live project is a second one connected to `Collinzo2022/spellcode-by-aceify`, and Vercel gave it the `-two` suffix because the name was taken. Renaming a Vercel project does not move its `.vercel.app` domain, so the shorter address stays where it is. **Supabase Auth's Site URL and its `/auth/confirmed` redirect must name the `-two` address**, or confirmation emails will send new learners to the dead site.

## Learning experience

SpellCode is designed around short, purposeful practice rather than passive watching. The learner starts with a beginner quest, builds a small piece of HTML in the browser, receives immediate structural feedback, and progresses through the full curriculum as each verified activity is saved.

| Area | Included capabilities |
|---|---|
| **Beginner Build Lab** | Three sequential HTML build missions, editable code, live sandboxed preview, instant checks, server-saved completion, and XP rewards. |
| **Curriculum** | Exactly three tracks: **HTML**, **CSS**, and **JavaScript**, with **Beginner**, **Intermediate**, and **Advanced** lessons. |
| **Code workspace** | Theory, examples, challenge requirements, progressive hints, HTML/CSS/JavaScript editing, and live preview. |
| **Daily loop** | Daily coding task, streak tracking, XP, completion recovery states, and activity history. |
| **Verified awards** | Awards unlock only from persisted evidence: completed lessons, passed coding challenges, streaks, XP, guided projects, and Beginner Build Lab missions. |
| **Learner records** | Dashboard and profile show real XP, streak, lesson progress, activity, earned awards, award criteria, and measured next goals. |
| **Full Access** | Paid access gates later lessons, guided-project publishing, certificates, and unlimited AI tutor use. Publishing, certificates and the tutor currently report **unavailable** — see below. |

> **Three features are switched off.** The AI tutor, guided-project publishing and certificate issuance all ran through Manus-managed integrations whose key belonged to Manus and cannot be regenerated. Since the move off Manus they answer "unavailable" rather than failing. They come back when publishing and certificates move to Supabase Storage, and the tutor to a direct LLM provider.

### Verified award rules

Awards are not seeded as earned or shown as already unlocked. The backend recalculates eligibility from Supabase records, writes an Earned Award only when its criterion is satisfied, and records the unlock in learner activity.

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
| Web deployment | Vercel serves the static Vite frontend and proxies `/api/*` to the Render-hosted Express backend. |
| Mobile | Separate Expo/React Native Android companion app using the same production API. **Unsupported until a new release ships:** nobody on the project can currently build or sign one. What that release must do is in [docs/android_handoff.md](docs/android_handoff.md). |

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

Secrets belong in the Render service's environment, never in the repository or Vercel static build. The Vercel deployment does not require server-side Supabase, Paystack, storage, or AI keys because its `/api/*` calls proxy to Render.

| Variable | Required by | Purpose |
|---|---|---|
| `SUPABASE_URL` | Backend | Supabase project URL. Served to clients at runtime with the anon key. |
| `SUPABASE_ANON_KEY` | Backend | Validates authenticated learner bearer sessions. Public by design: the web fetches it from `auth.supabaseConfig`, so changing project or key needs no web rebuild. `GET /api/mobile/config` serves the same to Android, but the released APK predates that route and has the key built in. |
| `SUPABASE_SERVICE_ROLE_KEY` | Backend | Performs server-authorized learning, billing, and award operations. |
| `PAYSTACK_PUBLIC_KEY` | Frontend configuration | Initializes the payment experience. |
| `PAYSTACK_SECRET_KEY` | Backend | Creates/verifies payments and validates webhooks. |
| `NODE_ENV` | Backend | `production` on Render. |

`BUILT_IN_FORGE_API_URL` and `BUILT_IN_FORGE_API_KEY` are **no longer set anywhere**. They addressed Manus-managed integrations, the key was Manus's rather than this project's, and the three features that used them are off. Do not reintroduce them.

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
https://spellcode-backend.onrender.com/api/paystack/webhook
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

The repository’s `vercel.json` builds the Vite client and preserves single-page application navigation. It rewrites `/api/*` to the Render-hosted backend instead of running the Express server as a Vercel function.

```text
Vercel static frontend → /api/* proxy → Render Express backend → Supabase / Paystack
```

Render deploys from the repository root: build `pnpm install && pnpm build`, start `pnpm start`, on a free instance. A free instance **sleeps when idle**, and the first request after it sleeps can take longer than a client is willing to wait — including a Paystack webhook, which is why a non-sleeping instance is on the launch checklist.

`git remote -v` is the authority on where this code is pushed: `Collinzo2022/spellcode-by-aceify`. Vercel and Render must both be connected to **that** repository, or a push lands in GitHub and never reaches either.

To confirm a deployment actually took effect, ask the deployed site for something only the new backend serves:

```bash
curl -s -D - -o /dev/null https://spellcode-by-aceify-two.vercel.app/api/mobile/config
```

`content-type: application/json` means the rewrite is live. `text/html` means Vercel answered with the SPA shell or proxied somewhere stale, and the deployment is not what the repository says it is.

## Testing and quality checks

The test suite covers core curriculum contracts, progress and challenge validation, entitlement rules, Paystack webhook idempotency, Supabase auth behavior, sign-up recovery, verified award criteria, and Beginner Build Lab checks.

```bash
pnpm check && pnpm test && pnpm build
```

The current release passes **188 tests across 31 files**, with 2 skipped and a production build. Visual checks also cover the interactive Beginner Build Lab in light and dark mode; see [docs/theme_visual_validation.md](docs/theme_visual_validation.md).

The two skips are deliberate: `server/external-config.test.ts` holds the tests that need real Supabase and Paystack credentials, and each prints why it skipped. **Vitest does not load `.env`** — only the server's entry point does — so those tests skip on a plain `pnpm test` and the suite reads green having reached no external service. To make them run, and to make a missing key fail instead of skip:

```bash
set -a; . ./.env; set +a; REQUIRE_CREDENTIALS=1 npx vitest run
```

That is **bash**. In PowerShell, which is what this project's terminal runs, it is:

```powershell
Get-Content .env | ForEach-Object { if ($_ -match '^\s*([A-Z_]+)=(.*)$') { Set-Item "env:$($matches[1])" $matches[2] } }
$env:REQUIRE_CREDENTIALS = '1'
npx vitest run
```

Pass there means 0 failed **and** 0 skipped, which is **190 of 190**. Any other skip, or any
failure, is new. A gated test that takes a second or so is doing its job — that is the real network
round trip; one that returns instantly has not left the machine.

## Production acceptance checklist

Before treating a production rollout as fully accepted, complete these external checks with real accounts and payment settings:

- Sign in through the deployed Vercel application and confirm Dashboard returns current XP, streak, completed lessons, and activity.
- Complete a real Paystack transaction and confirm the webhook is delivered and access is activated once.
- Test a newly registered Supabase user after SMTP configuration and verify email confirmation routes back to the deployed SpellCode page.
- Log in as an administrator and confirm the billing/reporting dashboard reflects live data.

## Related repositories

| Repository | Purpose |
|---|---|
| [Collinzo2022/spellcode-by-aceify](https://github.com/Collinzo2022/spellcode-by-aceify) | **The repository this working copy pushes to**, private. Vercel and Render deploy from it. |
| [Bayospel/spellcode-by-aceify](https://github.com/Bayospel/spellcode-by-aceify) | Earlier home of the web repository. |
| [kolinzoo/spellcode-by-aceify](https://github.com/kolinzoo/spellcode-by-aceify) | Private mirror. |
| [Bayospel/spellcode-android](https://github.com/Bayospel/spellcode-android) | Expo/React Native Android companion source. **Unreachable:** nobody on the project has access to it or to the Expo account that signed the APK, and its owner cannot be contacted. |

## License

This project is released under the [MIT License](LICENSE).

## References

[1]: https://supabase.com/docs/guides/auth/rate-limits "Supabase Auth Rate Limits"
[2]: https://paystack.com/docs/payments/webhooks/ "Paystack Webhooks"
