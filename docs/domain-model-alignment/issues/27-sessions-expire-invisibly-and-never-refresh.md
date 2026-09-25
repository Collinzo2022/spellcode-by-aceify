# 27: sessions expire after an hour, invisibly, and are never refreshed

**Status:** done 2026-09-25, committed as `703e1cf`, **pushed and deployed**. `origin/main` is at that
commit, and both Vercel and Render serve bundle `index-DKKVNU9H.js` containing
`"spellcode-supabase-config"` — the `CONFIG_STORAGE_KEY` this fix introduced, so the deployment is
proven by content and not merely by a changed hash (handoff.md, "Deployment confirmed").
**The browser round trip is still unproven**: the hour boundary is tested against a stubbed clock and
a stubbed `fetch`, never against the real Supabase project. Stage 10 remains its first real
verification. Was a **launch blocker**. Found 2026-09-24 after
it blocked the stage 10 test checkout three times running and consumed most of an evening's
debugging. See the `## Comments` section at the bottom for what was built and what is still unproven.

Every signed-in Learner is silently logged out roughly one hour after signing in, is still shown as
signed in, is told nothing, and cannot recover without clearing browser storage.

## The defect

`client/src/lib/supabaseAuth.ts:1` declares:

```ts
type SupabaseSession = { access_token: string; refresh_token: string; expires_at?: number; user: {...} };
```

`refresh_token` and `expires_at` appear **only on that line**. Nothing in `client/src` reads
either — one grep hit each, both the declaration. Concretely:

1. Sign-in persists the session to `localStorage["spellcode-supabase-session"]`
   (`supabaseAuth.ts:34-36`).
2. The Supabase access token expires after its TTL, an hour by default.
3. `getSupabaseAccessToken()` (`supabaseAuth.ts:20-26`) returns the stored string with **no expiry
   check**, and `client/src/main.tsx` puts it in the `Authorization` header regardless.
4. `client/src/_core/hooks/useAuth.ts:50` derives signed-in state from
   `Boolean(getSupabaseAccessToken())` — the *presence* of a string, not its validity. The UI
   therefore keeps presenting the Learner as signed in.
5. Every authenticated call returns `401 {"message":"Please login (10001)","code":"UNAUTHORIZED"}`.
6. Nothing surfaces it. There is no token refresh anywhere in the client.

The result is a zombie session: authenticated to the UI, rejected by the server, silent to the
user, and unrecoverable except by clearing storage or finding the sign-out control.

## How it presented

The stage 10 checkout was attempted three times and produced **no Paystack transaction, no
`payment_transactions` row, no `subscriptions` row and no webhook** — because `startCheckout` is a
`protectedProcedure` and was refused before reaching any plan guard or Paystack. Reproduced
directly against production:

```
POST /api/trpc/billing.startCheckout → 401 {"message":"Please login (10001)","code":"UNAUTHORIZED"}
```

`last_sign_in_at` for the only account stayed pinned at `16:55:35Z` through attempts at ~18:50,
~19:01 and ~19:02, including one after the operator believed they had signed in again — because the
app never presented a real sign-in, believing a session was already held.

**Compounding defect:** `client/src/pages/Access.tsx:10` registers only `onSuccess` on the
`startCheckout` mutation. No `onError`, no toast — zero matches for either in the file. On failure
the redirect simply never happens and the button appears inert. That is what made this invisible
rather than merely annoying, and it is why three attempts were reported as "checkout done".

## Everything else was ruled out, so do not re-investigate it

- `auth.supabaseConfig` returns the correct project URL and anon key on production.
- Supabase auth is healthy: a deliberately fake login returns `400 invalid_credentials`.
- `full-access-one-time` is active and `/access` renders an enabled "Continue securely".
- The webhook endpoint is verified end to end (see ticket 25).

## The fix

Three parts, and the first two are the blocker:

1. **Refresh the token.** Call `/auth/v1/token?grant_type=refresh_token` with the stored
   `refresh_token` before expiry, or on a 401, and persist the new session. This is the whole
   reason `refresh_token` is being stored.
2. **Stop treating a stored string as a session.** `getSupabaseAccessToken()` should honour
   `expires_at` and return `null` past it, so `useAuth` reports signed-out and the app offers a
   sign-in rather than looping on 401s. Clear the stored session when it cannot be refreshed.
3. **Surface mutation failures.** An `onError` on `startCheckout` at minimum; a payment control
   that fails invisibly is worse than one that errors loudly. Worth auditing sibling mutations for
   the same omission rather than fixing this one in isolation.

**Do not paper over this with an interceptor that redirects to /login on any 401.** That would hide
the missing refresh and log Learners out mid-lesson on every expiry, which is the symptom, not the
cure.

## Proving it

Mutation testing applies and is straightforward here:

- With the refresh in place, a session whose `expires_at` is set to the past must still make a
  successful authenticated request. Break the refresh call and that test must fail.
- `getSupabaseAccessToken()` must return `null` for an expired stored session. A test asserting
  that fails if the expiry check is removed.

Note tests live under `server/**` by convention (`AGENTS.md`), so landing client-side tests needs
that convention revisited or the logic placed where the existing seam can reach it. Settle that
before writing them, not after.

## Immediate workaround

`localStorage.removeItem('spellcode-supabase-session')` on the production origin, then reload and
sign in. Clearing site data works equally well. This is what unblocked stage 10.

## Related

Blocks ticket 25 (stage 10). Found while diagnosing why the Paystack webhook log stayed empty,
which ticket 25 records in full so the payment path is not re-investigated.

## Comments

### 2026-09-25 — implemented

All three parts done. `shared/supabaseSession.ts` holds the pure decision (use / refresh / sign-in),
`client/src/lib/supabaseAuth.ts` the refresh, and `client/src/lib/trpcAuth.ts` the request wiring.
Seam decision, settled before any test was written as this ticket asked: the pure logic moved to
`shared/` and is tested from `server/*.test.ts`; `vitest.config.ts` was **not** widened to collect
`client/`. Tests import `client/src` from `server/` instead, which works because the modules pull in
nothing but `@shared`.

Three things this ticket did not ask for, and why they are here anyway:

1. **The refresh is single-flighted.** Supabase rotates the refresh token, so two concurrent
   refreshes mean the second presents a spent token and clears the session the first renewed. tRPC
   batches on page load, exactly when a session is stale. The fix is wrong without it.
2. **`getSupabaseAccessToken` was deleted, not fixed.** Part 2 named it, but once `useAuth` moved to
   `hasSupabaseSession` and the header path to `getFreshSupabaseAccessToken`, it had no production
   caller. The "null past expiry" requirement now lives in `decideSessionUse`.
3. **`sessionToStore` derives the expiry from `expires_in`** when Supabase sends only that, and
   refuses a response with neither. Without it a session could be stored with no expiry and refresh
   on every single request forever.

**The first attempt violated this ticket's own prohibition**, and `/code-review` caught it. The
network-failure branch returned null while keeping the session, so the request went out
unauthenticated, the server answered 401, and the untouched `redirectToLoginIfUnauthorized` threw the
Learner to the sign-in page mid-lesson — the forbidden outcome, reached through the new code.
`classifyRequestError` now marks the token spent and does **not** redirect while a session can be
renewed; only a 401 with nothing left to renew offers a sign-in. That is also the "or on a 401" half
of part 1, which the first attempt had skipped.

Part 3's audit found two more silent mutations beyond `Access.tsx` — `enrollTrack` (Dashboard) and
`submitChallenge` (LessonWorkspace) — both now report. Six others already did. `PaymentComplete`
keeps its own `isError` panel deliberately: the "may still be processing" copy is correct for a
payment a webhook may still be confirming, and rewording it is a product decision, not this ticket's.

**Still unproven, and it matters before stage 10:** no browser has run any of this. The local dev
server never binds on this machine — no output, no port, before the change as after — so the hour
boundary is proven only against a stubbed clock and a stubbed `fetch`, and the round trip against the
real Supabase project is untested. The three `onError` handlers are not test-pinned either; that
needs a DOM environment and would mean widening `vitest.config.ts`, which was declined. Six mutation
tests cover the logic, including the dropped `await` that would restore the whole bug with every
other test green.

Suite: 217 passed, 2 skipped, 0 failed, up 27. `tsc --noEmit` and `vite build` clean.
