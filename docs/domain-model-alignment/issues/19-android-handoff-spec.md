# 19: A spec for the Android release nobody can ship yet

**What to build:** `docs/android_handoff.md`, a spec in the repo that lets anyone who regains access
to the Android companion ship its next release without working the changes out again.

Android is **closed, not blocked**. The companion is an Expo/React Native app. Its source is at
`github.com/Bayospel/spellcode-android` (package `com.bayospel.spelcode`), and its APKs were signed
through an Expo account. The owner of both cannot be reached, and nobody on this project has access
to either. The spec has no recipient: it waits in the repo.

What the next release has to do:

- **Build in only the API address,** and read it from build configuration. The spec must not name
  the host: it points to `docs/production_architecture.md`, which records the current one, so the
  spec cannot go stale on the next move.
- **Fetch the Supabase URL and anon key at startup** from `GET /api/mobile/config` (ticket 16),
  instead of building the key in. The key built into today's APK belongs to the old Supabase
  project and stops working with the switch.
- **Send `x-utc-offset-minutes` on every request.** The contract is in
  `production_architecture.md`, "Learner local time". Until this ships, Android Learners' Streaks
  roll over at UTC midnight. This is ticket 10's one unticked box and the Android half of ticket 11.
- **Add the app's deep-link return URL to Supabase Auth's redirect list** in the new project, so a
  sign-up confirmation returns to the app. `todo.md:54` records the same fix for the old project.
- **Expect three features to report "unavailable"** (ticket 15) until the two Forge follow-up
  tickets land.
- **Signing:** a release signed with a new key will not install over the current APK. Existing
  installs must be uninstalled first.

Link each contract to where it is defined rather than restating it, so the spec cannot drift from
the API it describes.

**Blocked by:** 15 (the spec describes the "unavailable" outcome), 16 (it describes the config route
as live).

**Status:** done (ad61c84), pushed to `origin/main`.

- [x] `docs/android_handoff.md` covers every point above.
- [x] It names no host and contains no key or secret. (The one URL is the GitHub source repo.)
- [x] Every contract it relies on links to its source of truth and is not restated.
- [x] `README.md` says the Android app is unsupported until a release ships, and links the spec.
- [x] Ticket 10's note on its unticked box points to the spec. (Already true: its 2026-09-22
      update names `docs/android_handoff.md`. Unchanged.)

**Where it departs from the ticket.**
- *"`todo.md:54` records the same fix for the old project."* Half true. That fix (`1ca1685`,
  `4939cbf`) sent confirmations to the web's email-confirmed page, and `1ca1685` touched only the
  web client. So v2 probably never returned to the app. The spec keeps the requirement, marks the
  history as inferred, and warns that the deep link may be new app work.
- *"Until this ships, Android Learners' Streaks roll over at UTC midnight."* True, but so do
  everyone's until ticket 11 consumes the offset. The spec says only what absence means.
- Added: a recommendation to build in the web origin, and a history section of the mobile API
  changes between `4939cbf` (v2) and `e81f107`. The history includes the removed
  `features`/`entitlements` fields, which the ticket's list missed.

Out of scope, raised separately: the web's sign-up sends `options.emailRedirectTo` in the JSON body
of a raw `/auth/v1/signup` call, where GoTrue may ignore it. Offered as a background task.
