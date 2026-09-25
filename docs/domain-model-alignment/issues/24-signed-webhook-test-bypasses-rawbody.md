# 24: the signed-webhook test never exercises the raw body it depends on

**Status:** **done 2026-09-24**, the same day it was opened. `server/paystack.webhook.test.ts` now
builds its app with `createSpellCodeApp()` and carries a case that signs a body the `??` fallback
cannot reproduce. Mutation tested: removing `verify` from `server/app.ts:13` fails the new case
with 401 where 200 is expected, while the two existing cases still pass — the failure the old
suite could not see. `app.ts` restored, empty diff. tsc clean, 189 passed / 2 skipped. No
production code changed. Committed as `18b4bd4` and **pushed**.

**The `??` fallback is also gone**, decided immediately after. `server/paystack.ts:130` now
requires the raw body and refuses the request with the same 401 when it is absent. Mutation
tested: reinstating the fallback fails the new case with 200 where 401 is expected. tsc clean,
190 passed / 2 skipped. Committed as `285bdf1` and **pushed**.

Worth recording accurately: **that removal changed no behaviour the deployed app can reach.**
`rawBody` is set by a `verify` option of the same `express.json` that parses the body, so the two
are set together or not at all, and when neither ran the signature over `"{}"` failed anyway. The
fallback's real cost was making a misassembled app look correct — it would have accepted webhooks
for as long as payloads round-tripped, then started refusing them with nothing to blame. Note the
only test that distinguishes the two versions is one that registers the route on a bare
`express.json()` app; a request whose content type stops express parsing returns 401 either way.

**This is not a production defect.** Production is correct. It is a hole in the evidence: the one
test that proves a *signed* webhook is accepted runs through a code path production never uses,
so it would keep passing if the production path broke.

## The facts

`server/paystack.ts:130` reads the body as:

```ts
const raw = req.rawBody ?? Buffer.from(JSON.stringify(req.body));
```

`req.rawBody` is set by the `verify` hook on `server/app.ts:13`, and **only** there. The `??`
fallback exists for an app assembled without it.

Two tests touch the webhook, and between them they miss the intersection that matters:

| Test | App | Signature | Path taken |
|---|---|---|---|
| `server/paystack.webhook.test.ts:36` | hand-built, plain `express.json()` | **valid** | the `??` **fallback** |
| `server/utcOffsetContract.test.ts:73` | real `createSpellCodeApp()` | absent | `rawBody`, but rejected at the signature check before the body is used |

So: the real app is only ever tested with a body it refuses, and the accepted body is only ever
tested on an app that is not the real one. **Nothing covers "signed request against the real
app."** Delete the `verify` hook from `app.ts` today and the whole suite still passes, while
every live Paystack webhook starts returning 401.

It passes because of a coincidence. The test body is `JSON.stringify(event)` at
`paystack.webhook.test.ts:40`, so re-stringifying `req.body` reproduces it byte for byte. Real
Paystack payloads do not have that property — key order, whitespace and `\uXXXX` escaping do not
survive a `JSON.parse` → `JSON.stringify` round trip, and the HMAC is over bytes.

## Why it is worth closing

This is precisely the failure mode that is invisible until money moves. A broken `rawBody` hook
produces no error, no log line and no failing test — just silent 401s in the Paystack dashboard
and subscriptions that never activate. The check that catches it costs a few lines.

## The fix

Build the webhook test's app with `createSpellCodeApp()` instead of hand-rolling it, matching
`utcOffsetContract.test.ts:18-25`. That file is the proof it is mockable: it already stubs
`./supabase`, and `paystack.webhook.test.ts:11-12` already stubs `./_core/env` and `./supabase`
both. If `createSpellCodeApp` turns out to demand more environment than the stub provides (it
also wires `storageProxy`, the mobile routes and tRPC), the fallback is to add the same
`verify` hook to the test app — weaker, since it copies the line under test rather than using
it, so prefer the real seam.

Then add a case that the fallback **cannot** pass: sign a body whose bytes differ from its
re-stringified form. A non-ASCII character written as a `é` escape, or two spaces after a
colon, is enough. Assert 200.

## How to prove it

Mutation test, per the conventions — and here the mutation is the whole point of the ticket:

1. Delete the `verify` option from `server/app.ts:13`.
2. The new case must fail. If it still passes, the test is not testing what it claims and the
   ticket is not done.
3. Restore `app.ts` and confirm the tree is clean.

Note the `??` fallback itself is then worth a second look: with the real app always supplying
`rawBody`, it serves no caller, and silently weakening signature verification is an odd thing
for a fallback to do. Removing it is a separate decision, not part of this ticket.

## Not in scope

`server/mobile-access.test.ts:38` and `server/mobile-lesson-xp.test.ts:27` also build bare apps
with plain `express.json()`. Neither route reads `rawBody`, so neither is affected. Left alone
deliberately — mention them only so the next reader does not re-discover them and assume a
wider problem.

## Where this came from

Found on 2026-09-24 verifying stage 8 of the switch (ticket 20). The live endpoint was confirmed
healthy at the same time — unsigned, malformed and wrong-length signatures all return
`401 {"error":"Invalid Paystack signature"}` on both `spellcode-backend.onrender.com` and
through the Vercel proxy, and `isValidPaystackSignature` was mutation tested (forcing it to
return `true` fails 2 tests). What could not be verified from a terminal is that Paystack is
actually delivering; that is the dashboard's webhook log and the `paystack_webhook_events`
table, both operator-only.
