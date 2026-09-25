# 14: The replay path is runnable and self-sufficient

**What to build:** An operator can take an environment from any state to one that matches the
application by running the replay order and nothing else.

`docs/production_architecture.md` claims a freshly initialized environment "must run none of" the
five domain-model-alignment migrations. That claim is false in two ways today.

It cannot **seed**. The three Beginner Build Lab Missions are seeded only inside
`supabase_mission_completion_migration.sql`. `supabase_schema_draft.sql` creates `public.missions`
empty, and ticket 05 deliberately moved seeding into SQL rather than leaving it to the application
— so nothing else will ever fill it. A new environment gets a Beginner Build Lab with no Missions.

It cannot be **reached**. `supabase_schema_draft.sql` is not idempotent: 21 bare `create table`
statements and a single `if not exists` in the whole file, on the `pgcrypto` extension. It errors
on the first surviving object, so the replay order can only be run against an empty schema, and
nothing in the repo empties one.

The second gap is not hypothetical. The only environment is being rebuilt rather than migrated,
because it holds test accounts only and nothing in it is worth preserving. That rebuild needs a
reset it can trust, and the reset must name every object the replay order creates — including the
four enum types, which no `drop table` removes and which the draft recreates unconditionally.

Once the rebuild has run, the five alignment migrations will never run anywhere. Their per-migration
instructions in `production_architecture.md` — including "this is the one irreversible step and it
must be rehearsed" — must stop reading as live operating instructions. The files themselves stay:
they are the only written account of why the schema looks the way it does.

**Blocked by:** nothing.

**Status:** done (3d94833, merged in 45efa2d).

- [x] `supabase_schema_draft.sql` seeds the three Beginner Build Lab Missions, with the same slugs
      and titles as `supabase_mission_completion_migration.sql`, and is safe to re-run.
- [x] A committed reset drops every object the replay order creates: tables, views, functions,
      enum types, and the `auth.users` trigger.
- [x] The reset leaves `schema public` and its role grants intact, and does not touch `auth.users`
      rows.
- [x] The reset is safe to run against a partially built or already empty environment.
- [x] `production_architecture.md` no longer claims the replay order is sufficient on its own, and
      names the reset as the way to reach it.
- [x] The per-migration deploy-order instructions are marked historical, with the reason recorded.
- [x] The five alignment migration files and their rollbacks remain committed.

**What these ticks do not mean.** No SQL in this ticket has ever been executed: there are no
database credentials in this environment. The object-for-object parity between the reset and the
six replay-order files was verified by diffing the created set against the dropped set, and the
reset's safety against a partially built environment rests on every statement carrying
`if exists` — both are arguments from reading, not from a run. The first execution will be against
the real environment, destructively. Run the inspection queries in the reset header first.

**Superseded (2026-09-22).** The switch builds a fresh Supabase project instead of resetting the
old one. The reset runs nowhere, and the first execution of anything here is the replay order
running into an empty project, which is the case it was written for. The reset-versus-replay parity
above also turned out to be the wrong check: a pre-alignment environment holds two award tables
under their old names that the reset never drops. Ticket 18 adds them.
