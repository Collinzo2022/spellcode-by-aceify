# Android companion: what the next release must do

**The Android companion is unsupported until a new release ships.** It is closed, not blocked: nobody on this project can reach its source or the Expo account that signed its APKs, and their owner cannot be reached. This spec is addressed to nobody. It waits here so that whoever regains access can ship the next release without working these changes out again.

The companion is an Expo/React Native app, package `com.bayospel.spelcode`, with its source in [Bayospel/spellcode-android](https://github.com/Bayospel/spellcode-android). The last release is "Android release v2". It was built against this repository as it stood at `4939cbf` (2026-08-15), and it was accepted on a physical device at `95cb167`.

**Nothing here was checked against the app's source, which this repository does not hold.** Claims about what v2 does are inferred from this repository's history, and each one is marked **Inferred**.

## Why v2 stops working

**Inferred:** v2 has the Supabase project URL and anon key built in. No mobile route served them when it was built. The web's `auth.supabaseConfig` query did, but nothing records the app using it. If so, v2 signs Learners in to whichever project was current when it was built. When the backend moves to another Supabase project, v2 can no longer sign anyone in, and only a new release fixes that. The move off the Manus host puts the backend on a fresh project.

## What the next release must do

### 1. Build in only the API address

The release builds in exactly one value, the address of the API, and reads it from build configuration rather than from source. This spec does not name the address, so that it cannot go stale on the next move.

**Build in the web origin, not the backend's own address.** The web origin forwards every `/api/*` request to wherever the backend currently runs ([production_architecture.md, "Vercel deployment contract"](production_architecture.md#vercel-deployment-contract)). The backend can then move again with no Android release, and the app takes the same path the web client already takes. The web origin is in the [README](../README.md)'s resource table.

Building in the backend's own address also works. [production_architecture.md](production_architecture.md) records where the backend runs. But that ties each release to one host, so every move needs a release.

### 2. Fetch the Supabase URL and anon key at startup

Ask `GET /api/mobile/config` for them instead of building them in. It needs no sign-in and is defined in [server/mobile.ts](../server/mobile.ts). It is served from the same function as the web's `auth.supabaseConfig`, so the two clients always sign in to the same project.

- Fetch it on every start, not once per install, so the next project change reaches installed apps without a release.
- If the fetch fails, the app cannot sign anyone in. Show that, and offer a retry.
- A session stored by an earlier version belongs to the old project, and the API answers `401` to its token. Treat a `401` as signed out.

### 3. Send `x-utc-offset-minutes` on every request

The contract is in [production_architecture.md, "Learner local time"](production_architecture.md#learner-local-time). The API validates the header on every `/api/mobile/*` and `/api/trpc/*` request ([server/utcOffset.ts](../server/utcOffset.ts)). The web client sends it from [client/src/main.tsx](../client/src/main.tsx), using [shared/utcOffset.ts](../shared/utcOffset.ts).

Without the header, the server reads every Android request as UTC. An Android Learner's Local Day is then always the UTC day, however the server derives Streaks from it.

### 4. Return sign-up confirmations to the app

A sign-up confirmation email sends the Learner to a URL. Supabase honours the URL a sign-up asks for only if it is on the project's redirect list. Otherwise it sends the Learner to the project's Site URL, which is the web. A project set up for the web lists only the web's own confirmation route.

For a confirmation to return to the app, two things are needed:

- The release asks for the app's deep-link URL at sign-up. That URL is defined in the app's source.
- That URL is on the redirect list of the project the backend uses. In the Supabase dashboard, the list is under Authentication → URL Configuration → Redirect URLs.

**Inferred:** v2 probably never returned to the app. [todo.md](../todo.md) records the earlier fix as "Fix Supabase email confirmation so Android users are not redirected to localhost". The commits that made it, `1ca1685` and `4939cbf`, describe sending confirmations to the web's email-confirmed page, and `1ca1685` changed only the web client. So the deep link may be new work in the app, not just a setting.

### 5. Expect the AI tutor, Project publishing and certificates to report "unavailable"

All three ran on Forge, the Manus host's built-in service. They stay off until each moves to a provider of its own.

- [server/availability.ts](../server/availability.ts) decides whether each can run, and makes each refuse before its Full Access check.
- The public `availability.status` query, in [server/routers/availability.ts](../server/routers/availability.ts), reports which of them can run.
- [shared/availability.ts](../shared/availability.ts) holds their names, the wording, and the rule a screen follows while it waits for that answer.

None of the three has an `/api/mobile/*` route. **Inferred:** v2 never offered any of them; its screens, as `todo.md` lists them, are sign-in, curriculum, Lesson detail, dashboard, Daily Task and profile. If the release does offer one, it asks `availability.status` first. It never shows a Full Access upsell for one that is off.

### 6. Signing

v2 was signed with a key held by the Expo account.

- A release signed with that same key installs over v2.
- A release signed with a new key does not. Android refuses an update whose signature differs, so every Learner must uninstall v2 first.

Uninstalling removes only what the app kept on the phone, such as the session. Learner records are kept by the backend, not the app. Tell Learners this wherever the release is announced.

## How the mobile API changed after v2

The routes are defined in [server/mobile.ts](../server/mobile.ts), and that file, not this section, is the contract. This section is history: what changed between `4939cbf`, which v2 was built against, and `e81f107`, where this spec was written.

To see the code behind the routes as it changed over that span, run:

```bash
git diff 4939cbf e81f107 -- server/mobile.ts server/supabaseLearning.ts server/utcOffset.ts server/app.ts
```

To see anything since, replace `4939cbf e81f107` with `e81f107`.

| Route | Change between `4939cbf` and `e81f107` |
|---|---|
| `GET /api/mobile/config` | New (point 2). |
| `GET /api/mobile/access` | `features` removed ([ADR 0001](adr/0001-full-access-is-a-single-gate.md)). |
| `GET /api/mobile/profile` | `entitlements` removed ([ADR 0001](adr/0001-full-access-is-a-single-gate.md)). |
| `GET /api/mobile/daily` | `entitlements` removed ([ADR 0001](adr/0001-full-access-is-a-single-gate.md)). |
| `GET /api/mobile/profile`, `GET /api/mobile/daily` | XP is now the Learner's total of XP Entries ([ADR 0002](adr/0002-xp-is-a-ledger.md)), with the same field names. |
| `POST /api/mobile/lesson/complete` | `newAwards` added: the Earned Awards the Completion unlocked. |
| `POST /api/mobile/daily/complete` | `newAwards` added when the answer records a new Completion, and absent when the Daily Task was already completed. |
| Every `/api/mobile/*` route | The UTC offset header is validated (point 3). |

`GET /api/mobile/curriculum` changed only by that last row.

The removals are the changes that matter. If the app reads `features` or `entitlements`, those fields are now missing. The release reads `hasFullAccess` instead, because Full Access is a single gate, with no per-feature list behind it.
