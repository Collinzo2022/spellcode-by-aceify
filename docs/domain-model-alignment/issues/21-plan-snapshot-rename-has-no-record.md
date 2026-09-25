# 21: The `plan_snapshot` rename has no record in history

**Status:** done (`d4888ff`, 2026-09-24) and **pushed** — it is an ancestor of `origin/main`, which is
at `703e1cf`. It closed item 4 of the **2026-09-24** revision of handoff.md's "What is left"; that
document was rewritten on 2026-09-25 and its item 4 is now ticket 26, so do not follow that number.

**What happened.** `subscriptions.entitlement_snapshot` was renamed to `subscriptions.plan_snapshot`
by editing a **replay-order** migration file in place:

```
docs/supabase_daily_admin_payments_migration.sql:16
-  add column if not exists entitlement_snapshot jsonb not null default '{}'::jsonb;
+  add column if not exists plan_snapshot        jsonb not null default '{}'::jsonb;
```

It shipped in `2303c58` (2026-09-12), subject **`docs: updated docs for better clarity`**, body
**empty**. That commit is not a docs commit: it touched 11 files, including `server/paystack.ts`,
`server/supabaseLearning.ts`, `server/routers/learning.ts`, `shared/progress.ts` and five test
files. So the single hardest-to-reverse change in it — an in-place edit to a file whose whole
purpose is to be replayed verbatim into a fresh database — is recorded by nothing at all.

This is the loose end ticket 12 named and did not own. `41b7b23`'s body ends: *"The one survivor is
`subscriptions.entitlement_snapshot`, which belongs to the Paystack record rather than to any gate;
no ticket owns it yet."* Ticket 12 renamed functions and modules; it looked at functions rather than
at columns, so the column outlived it and was then renamed off-ticket.

**What is *not* wrong.** The rename itself is right and needs no migration, and
`docs/production_architecture.md:17` already states why: the only environment that ever held the old
name is the pre-alignment one, which is incompatible with this build for a dozen other reasons and
was replaced rather than migrated. An environment reached by the replay order has never seen
`entitlement_snapshot`. Should a pre-alignment environment surface, it needs the reset, not an
`alter table … rename column`. **Do not write that migration.**

So this ticket buys **traceability, not a code change**. The defect is in the history, not the
schema.

**What to build:** nothing in `server/` or `docs/*.sql`. Land the record.

- [x] This ticket file exists and names `2303c58` as the commit, so a future reader grepping
      `entitlement_snapshot` reaches an explanation rather than a dead end.
- [x] `docs/production_architecture.md:17` names the commit hash too. Today it explains the *reason*
      without naming the *change*, so a reader who finds the paragraph cannot find the diff.
- [x] A line in `AGENTS.md` (or wherever the commit conventions live) that a replay-order file under
      `docs/*.sql` is never edited in place under a subject that does not say so. The convention the
      effort already runs — one ticket per commit, subject ending `(ticket NN)`, body explaining
      *why* — would have caught this; it was simply not applied to that commit.

**Verified for this ticket:**

- No source file reads `entitlement_snapshot`. `grep -rn entitlement_snapshot` over `server/`,
  `shared/`, `client/` and `docs/` returns three hits, all prose: `docs/production_architecture.md:17`,
  the comment at `server/fullAccess.test.ts:25`, and this file. No SQL and no executable line.
- The two writers of the column, `server/paystack.ts:53` and `:81`, both send `plan_snapshot`.

**Not verified:** the live column name in project `jttycbhcziffiukpcwvd` was **not probed**. The
inference is from the replay file, which is the file that created the table and which carries the
new name — but it is an inference, not an observation. One PostgREST read with the service-role key
settles it: `subscriptions?select=plan_snapshot&limit=1` returns rows (or an empty array),
`?select=entitlement_snapshot` returns `42703`.

**Blocked by:** nothing.
