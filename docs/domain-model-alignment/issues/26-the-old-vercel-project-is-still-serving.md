# 26: the old Vercel address is still live, running old code against the live database

**Status:** **closed 2026-09-28.** The stale Vercel project was deleted by the operator, having
confirmed its Settings → Git read `Bayospel/spellcode-by-aceify` rather than `Collinzo2022`. Found
2026-09-24, immediately after it cost a real checkout attempt. **Operator work** — the remedy was in
the Vercel dashboard.

Everything below is kept in the present tense as the record of what was wrong. See "Closed" at the
foot for the verification.

This was not the same as "the old address exists". It was serving, it was stale, and it was
authenticated to the current Supabase project.

## The facts

```
GET https://spellcode-by-aceify.vercel.app/
  → 200, 367,903 bytes

GET https://spellcode-by-aceify.vercel.app/api/trpc/billing.accessOptions
  → 500  Supabase request failed (400): {"code":"42703",
         "message":"column plans.paid_features does not exist"}
```

Both halves are stale, and they are stale in different ways:

- **The frontend is the pre-fix build.** 367,903 bytes is the shell from before `d3a3d0b` and
  `5753e04` — it still carries the analytics tag and the inlined Manus runtime. Current production
  serves 615 bytes.
- **The server code predates the alignment work.** `plans.paid_features` was removed by the domain
  model alignment. This deployment still asks for it.

## The part that matters

**Supabase answered `400`, not `401`.** A 42703 "column does not exist" is a response to a request
that was *authorized* and reached the database. So the old deployment holds working credentials for
the **current** Supabase project — and given the query reached a schema without `paid_features`, it
is the new project it is talking to, not the old one still awaiting stage 11.

Read that plainly: a build from before the alignment, with pre-alignment schema assumptions, is
live on the public internet and able to reach the production database. Today it only failed a read.
Nothing about it is limited to reads.

## How it surfaced

The operator ran the stage 10 test checkout against this address on 2026-09-24, believing it was
production. The access page could not load plans, so no checkout began — which is why Paystack
showed `total_transactions: 0` and an empty webhook log, and why `payment_transactions` and
`subscriptions` were both empty. Half an hour went into diagnosing a payment path that was never
reached. The address is a plausible bookmark: it is the *un*suffixed, natural-looking name.

## The fix

Delete, or at minimum disable, the old Vercel project. Removing its environment variables is the
minimum that closes the database access; deleting the project is what stops it serving a stale app.

**Do not treat this as a chance to reclaim the nicer name.** `https://spellcode-by-aceify-two.vercel.app`
is production, permanently and deliberately — see the handoff's "The production address changed".
Supabase Auth redirect URLs, the Paystack callback and `vercel.json` are all configured for `-two`.
Anyone who repoints production at the freed name breaks the sign-in flow. The goal here is removing
a hazard, not renaming anything.

Rotating the Supabase service-role key is worth considering at the same time, since a credential
was deployed somewhere it should no longer live. That is a judgement call for the operator, and it
means updating Render's environment in the same sitting.

## Done when

- [x] `https://spellcode-by-aceify.vercel.app/` no longer serves the application. **404 since
      2026-09-28.**
- [x] Nothing outside the `-two` project and Render holds credentials for the Supabase project. Met
      by deletion — the project that held them no longer exists. **But see "The exposure is not
      undone" below: this box closes the hole, it does not undo the past exposure.**
- [x] The handoff says the old address is **removed**, not merely superseded.

## Closed — verified 2026-09-28

Four probes, before and after, run from the repo:

| | Before | After |
|---|---|---|
| `spellcode-by-aceify.vercel.app/` | 200, 367,903 bytes | **404**, 107 bytes |
| its `/api/trpc/billing.accessOptions` | 500, `42703 column plans.paid_features does not exist` | **404** |
| `spellcode-by-aceify-two.vercel.app/` | 200, 615 bytes | 200, 615 bytes — unchanged |
| production's `/api/trpc/billing.accessOptions` | — | **200**, the three plan rows, served through Render |

The last row matters as much as the first: it proves the delete did not disturb the `/api/*` rewrite
to Render. The freed unsuffixed name was **not** reclaimed.

The 367,903-byte reading taken on 2026-09-28 before the delete was **byte-for-byte identical** to the
one in "The facts" from 2026-09-24, and its API returned the same `42703`. So the deployment sat
unchanged and reachable for four days; nothing had quietly fixed it.

### The exposure is not undone

Deleting the project stops the leak going forward. It does not change the fact that a
Supabase credential lived on a public deployment for at least four days, authorized against the
**current** project — proven by `42703` being a *400 from the database*, the same error the
service-role key returns for that column today.

**Not established, and worth establishing:** whether that project's environment held
`SUPABASE_SERVICE_ROLE_KEY` or only `SUPABASE_ANON_KEY`. The operator was asked to note it before
deleting; it is not recorded here, and once the project is gone Vercel cannot be asked. That
distinction is the whole of how urgent rotation is, so **in its absence, assume the service-role key
was exposed.** Rotating it means updating Render's environment in the same sitting.

## Related

Ticket 20 stage 6 pointed the web at Render and the handoff records the `-two` discovery in detail,
including that the first Vercel project built from `Bayospel/spellcode-by-aceify` rather than
`Collinzo2022`. What neither recorded is that the old project kept **serving** afterwards. That
omission is the whole of this ticket.
