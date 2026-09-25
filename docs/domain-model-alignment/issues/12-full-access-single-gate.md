# 12: Full Access becomes a single gate

**What to build:** A Learner with Full Access gets everything behind the gate, and the code says so
once.

Paid access is currently modelled twice, and the two models disagree. The schema describes
per-feature entitlements: Plans carry a feature array, and the entitlement check carefully computes
the union of it across a Learner's active Plans. The domain logic ignores it — the function that
takes a feature argument discards it and returns a single boolean, and all four gates check only
that boolean.

So an array that looks like an enforced permission set is computed on every check, shipped to the
web and Android clients, and never consulted. That is worse than redundant: a future contributor
could gate a feature on it and believe the check was real.

The three Plans sold differ only in payment schedule and grant identical access. Make the code say
that. See ADR 0001 for the reasoning and the exit if a narrower tier is ever sold.

Independent of every other ticket except the rename it builds on.

**Blocked by:** 02 (Introduce learnerId at the framework boundary).

**Status:** done (41b7b23).

- [x] The per-feature column is dropped from the Plans schema.
- [x] The paid-feature type and the function that accepted a feature argument and discarded it are
      both removed.
- [x] All four gates — advanced Lessons, Project publishing, the AI tutor, certificates — check
      Full Access directly.
- [x] Each gate is open with Full Access and closed without it.
- [x] No tRPC response carries a features or entitlements array.
- [x] The mobile payload carries no features or entitlements array.
- [x] A Learner on any Plan gets identical access.
- [x] The migration is reversible, and the reverse has been written and reviewed.
- [x] The full test suite passes.

**On the schema box.** `plans.paid_features` is dropped for a pre-alignment environment by
`supabase_full_access_single_gate_migration.sql`, which — per ticket 14 — will never run. It is
satisfied for a rebuilt environment by `supabase_schema_draft.sql` never creating the column;
verified by reading the `create table public.plans` statement, not by running it.
