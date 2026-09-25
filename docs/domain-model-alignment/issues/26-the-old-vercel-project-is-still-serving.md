# 26: the old Vercel address is still live, running old code against the live database

**Status:** open. Found 2026-09-24, immediately after it cost a real checkout attempt. **Operator
work** — the remedy is in the Vercel dashboard.

This is not the same as "the old address exists". It is serving, it is stale, and it is
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

- [ ] `https://spellcode-by-aceify.vercel.app/` no longer serves the application.
- [ ] Nothing outside the `-two` project and Render holds credentials for the Supabase project.
- [ ] The handoff says the old address is **removed**, not merely superseded.

## Related

Ticket 20 stage 6 pointed the web at Render and the handoff records the `-two` discovery in detail,
including that the first Vercel project built from `Bayospel/spellcode-by-aceify` rather than
`Collinzo2022`. What neither recorded is that the old project kept **serving** afterwards. That
omission is the whole of this ticket.
