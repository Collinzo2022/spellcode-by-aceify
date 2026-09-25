# 15: The three Forge features say "unavailable" instead of failing

**What to build:** On a host with no Forge configuration, the AI tutor, Project publishing and
certificate issuance each tell the Learner the feature is unavailable. None of them answers with a
500.

Forge is the Manus platform's built-in service. Its key (`BUILT_IN_FORGE_API_URL`,
`BUILT_IN_FORGE_API_KEY`) lived only on the Manus host, which can no longer be reached, and Manus
owns it, so it cannot be regenerated. The backend is moving to Render without it (handoff.md, "The
move off Manus"). Exactly three features depend on it:

| Feature | Where | Forge call |
|---|---|---|
| AI tutor | `server/routers/tutor.ts` | `invokeLLM` (`server/_core/llm.ts`, `forge.manus.im`) |
| Project publishing | `server/routers/projects.ts`, `publish` | `storagePut` (`server/storage.ts`) |
| Certificate issuance | `server/routers/certificates.ts`, `issue` | `storagePut` |

Without the key, `storagePut` throws "Storage config missing" and `invokeLLM` throws, so each one
surfaces as a 500. Each is its own mutation: Project Completions, XP and Earned Awards depend on
none of them (checked 2026-09-22), so turning them off changes nothing else.

All three are Full Access features (`tutor.ts:12`, `projects.ts:17`, `certificates.ts:30`).
Report "unavailable" **before** the Full Access check, so no Learner is told to buy access to a
feature that cannot run.

This is temporary. It ends when two follow-up tickets, not yet written, move storage to Supabase
Storage and the tutor to a direct LLM provider. Real Learners wait for both (handoff.md, "Launch
checklist").

Keep the change out of `server/_core/**`: it is vendored scaffold that a regeneration will
clobber. Reading `ENV` from it is fine.

**Blocked by:** nothing.

**Status:** done (a2df492), pushed to `origin/main`.

- [x] Whether Forge is configured is decided in one place, from the presence of both variables.
      (`server/availability.ts`; a whitespace-only value counts as missing.)
- [x] Without Forge, each of the three calls returns an "unavailable" outcome the client can
      recognise, not a thrown error. **Delivered differently, see below.**
- [x] "Unavailable" is reported before the Full Access check.
- [x] Each feature's existing entry point stays visible and says the feature is unavailable;
      nothing is hidden. **One looser reading, see below.**
- [x] With Forge configured (stubbed), all three behave exactly as before, Full Access gate
      included.
- [x] Mutation-tested for each of the three: removing the availability check makes a test fail.
- [x] No file under `server/_core/` changes.
- [x] `npx tsc --noEmit`, `npx vitest run` and `npx vite build` pass, and the suite count has not
      dropped. (126/130 across 25 files → 146/150 across 26; the 4 failures are ticket 17's.)

**What was built.** `shared/availability.ts` holds the capability names, the "temporarily
unavailable" wording and `capabilityState`, the rule a page follows while it waits for an answer.
`server/availability.ts` reads the configuration, and `assertAvailable` refuses. The public
`availability.status` query tells the client, and `client/src/hooks/useCapability.ts` wraps it.
Tests: `server/availability.test.ts`, plus a "without Forge" block in
`server/access-procedures.test.ts`, with Forge switched through `server/testing/forge.ts`.

**Where it departs from the boxes, for review.**
- *"Not a thrown error."* Refusal is a tRPC `SERVICE_UNAVAILABLE` error (HTTP 503), not a returned
  value. That meets the box's goal: no 500, and the client can recognise it by its code. It also
  keeps every mutation's return type, and reaches the pages' existing `onError` toasts unchanged. A
  returned value would have needed a union type on all three mutations.
- *"Nothing is hidden."* The tutor page shows the unavailable notice *in place of* its chat box,
  rather than a disabled chat box. The Projects source editor stays visible.
- *Naming.* The query is `availability.status`, not `features.*`. ADR 0001 retired "features" for
  a per-feature map that reads as a permission set (review finding).

**Code review (two axes) found, and this fixed:** pages treated "not yet known" as available, so
they briefly offered a live button or a Full Access upsell, and kept offering it if the query failed.
They are now pending while loading and unavailable on failure, pinned by `capabilityState` tests.
The certificate page now tells signed-out visitors and not-yet-eligible Learners that issuing is
off. The duplicated page logic and wording moved into `shared/availability.ts`, and the Forge
save/restore moved into one test helper. Not acted on: a procedure builder combining the two
checks; the order is guarded by mutation tests instead.

**Mutation results (all caught).** Removing the check from each route; moving it after the Full
Access check on each route; either Forge variable alone counting as configured; whitespace counting
as set; loading counting as available; failure counting as available.

**What these ticks do not mean.** Client code has no test runner: only the rule in
`capabilityState` is tested. The pages were checked by hand in the browser, against the production
build with no Forge configured: tutor (signed out), the Projects guide, and the certificate page
(signed out). The Full Access-holding and not-yet-eligible views were not seen, because they need a
Supabase session. The dev server (`npm run dev`) hangs while starting Vite locally, before it
listens; Vite in dev mode loads Manus plugins (`vite-plugin-manus-runtime`). Not investigated —
production (`pnpm build`, then `pnpm start`, what Render runs) starts fine.
