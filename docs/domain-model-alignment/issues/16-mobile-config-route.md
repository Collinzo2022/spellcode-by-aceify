# 16: Mobile clients fetch the public Supabase config at runtime

**What to build:** `GET /api/mobile/config` returns the Supabase project URL and anon key, with no
sign-in required. A mobile client then builds in only the API address and fetches the rest when it
starts.

The web client already works this way: `client/src/pages/Auth.tsx` reads
`trpc.auth.supabaseConfig`, which serves `getSupabasePublicConfig()` (`server/supabase.ts:28`). The
Android companion never did. Its APK has the anon key built in (`docs/supabase_database_blueprint.md`:
the anon key "may be used by web and Android clients"), so any change of Supabase project or key
needs a new release. `server/mobile.ts` has no equivalent route.

Android is closed: nobody who can reach its source or signing account is available (handoff.md).
The route is built now anyway, so that `docs/android_handoff.md` (ticket 19) describes an endpoint
that already works rather than one that might.

The anon key is public by design. The service-role key and the Paystack secret must never appear
here.

**Blocked by:** nothing.

**Status:** done (57c497d), pushed to `origin/main`. Not requested on any deployed host: `vercel.json`
still sends `/api/*` to the Manus build, which lacks the route, so it goes live with Render (ticket
20). "Cannot drift" holds by construction (both routes call the one function); the tests catch a
route that transforms the values or reads `process.env`, not one that reads `ENV` directly.

- [x] `GET /api/mobile/config` answers without a bearer token.
- [x] The body is `{ supabaseUrl, supabaseAnonKey }` and nothing else.
- [x] It is served from `getSupabasePublicConfig()`, the same source as the web's
      `auth.supabaseConfig`, so the two cannot drift.
- [x] Missing configuration answers 503 with a plain error, not a 500 with a stack.
- [x] A test fails if the response ever carries the service-role key or the Paystack secret;
      mutation-tested by making the route return the service-role key.
- [x] Tests live under `server/**`.
- [x] `npx tsc --noEmit`, `npx vitest run` and `npx vite build` pass.
