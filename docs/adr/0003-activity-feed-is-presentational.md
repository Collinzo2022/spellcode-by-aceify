# 3. The Activity Feed is presentational, and Completions live in their own tables

Date: 2026-08-23

## Status

Accepted

## Context

`activity_events` was introduced as a Learner-facing history: a row per notable action, with a
title, a detail string, and free-form `jsonb` metadata. Nothing about its schema suggests
authority — `event_type` is an unconstrained `text` column, there are no foreign keys to the
things it describes, and no uniqueness constraint anywhere.

It nevertheless became the system of record for two of the five units of learning. From
`getAwardSnapshot`:

```ts
supabaseAdminRequest(`/rest/v1/activity_events?user_id=eq.${userId}&event_type=eq.project&select=id`),
supabaseAdminRequest(`/rest/v1/activity_events?user_id=eq.${userId}&event_type=eq.beginner_module&select=id,metadata`),
```

Project completions are counted by filtering a text column. Mission completions are counted by
filtering that column and then reading `metadata.mission_id` out of untyped `jsonb`. The
**Builder** and **Launchpad** awards rest entirely on this. `project_progress` and
`project_steps` tables exist and are not consulted.

The result is that pruning old feed rows, or renaming an `event_type` string, silently revokes
awards a Learner has already earned. Nothing in the type system or the database would catch it,
and the failure is invisible until a Learner notices an award has vanished.

The underlying error is that a feed and a system of record want opposite properties. A feed is
denormalised, cheap, lossy, and prunable. A record wants constraints, uniqueness, referential
integrity, and permanence. One table cannot be both without permanently forfeiting the ability
to prune.

## Decision

Split the two roles.

- Every unit of learning gets its own Completion table. Missions gain a dedicated one; Project
  completion is read from `project_progress`.
- All verification — Awards, XP Entries, Streaks — reads exclusively from Completion tables.
- `activity_events` becomes purely presentational: it is written for display, read only for
  display, and may be pruned at any time with no effect on a Learner's standing.

No count, gate, or award may query `activity_events`.

## Consequences

Completions gain the constraints they always needed: a foreign key to the thing completed, and
uniqueness per Learner per unit, which makes double-completion impossible by construction rather
than by a `Set` in application code.

The feed becomes prunable, which it was not before. This matters as the table grows: it is the
highest-volume table in the system and the only one with no retention story.

Verification stops depending on string literals. `event_type=eq.beginner_module` was a
load-bearing magic string with no compile-time or database-level protection.

The costs: one additional table, and a second write on paths that previously wrote only a feed
row. Existing Mission and Project completions must be backfilled out of `activity_events`
metadata before the feed can be pruned, and that backfill is only as good as the metadata
already written — Missions whose metadata lacks `mission_id` cannot be recovered.

## Alternatives considered

**Make `activity_events` a real event log** — constrain `event_type` to an enum, give metadata a
schema per type, and declare the table append-only and never pruned. Coherent, and the right
choice for a system heading toward event sourcing. Rejected because nothing else in SpellCode is
event-sourced, it forfeits pruning permanently on the largest table, and it makes every future
change to what the feed displays into a data-integrity question.
