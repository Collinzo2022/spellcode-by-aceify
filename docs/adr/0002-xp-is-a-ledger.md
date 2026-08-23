# 2. XP is a ledger, and the profile total is a cache

Date: 2026-08-23

## Status

Accepted

## Context

SpellCode's central product claim is that recognition is *verified*: awards are recalculated
from persisted evidence and never seeded. `getAwardSnapshot` honours this for six metrics,
counting completed Lessons, passed Challenges, Daily Task completions, Projects and Missions
from stored records.

XP was the exception. It was a counter mutated in place on `profiles.xp`:

```ts
async function addXp(userId: string, amount: number) {
  const profiles = await supabaseAdminRequest(/* select=xp */);
  const profile = profiles[0] ?? { xp: 0, current_streak: 0, longest_streak: 0 };
  await supabaseAdminRequest(`/rest/v1/profiles?id=eq.${userId}`, {
    method: "PATCH",
    body: JSON.stringify({ xp: profile.xp + amount, /* ... */ }),
  });
}
```

Two problems followed.

**It cannot be recomputed.** No record says why the total is what it is. If the number drifts —
through a bug, a partial failure, a manual correction — there is no source of truth to restore
it from, and no way to detect the drift in the first place.

**It races.** Read-modify-write with no atomicity: two completions landing together lose one
award. The Daily Task path made this worse by bypassing `addXp` and patching `xp` inline, giving
two independent write paths with the same defect.

The consequence reached the awards themselves. **Steady Hand** ("Earn 200 XP") was granted from
this unauditable number, inside a catalog whose stated premise is verified evidence. Every other
award could be defended from records; this one could not.

Deriving XP from the existing per-record columns (`lesson_progress.xp_earned`,
`daily_task_completions.xp_earned`) was considered and rejected: Missions and Projects have no
dedicated completion rows of their own, so any such sum would be structurally incomplete. See
ADR 0003 on moving those to dedicated tables — even with it, per-record columns leave XP's
provenance scattered across five tables with no single place to look.

## Decision

Introduce an XP Entry: one row per XP award, recording the Learner, the amount, and the single
Completion that caused it.

- The XP Entry table is the system of record for XP. It is append-only.
- `profiles.xp` becomes a derived cache, recomputable at any time by summing a Learner's XP
  Entries.
- Every path that grants XP writes an XP Entry, including the Daily Task path. There is one
  write path, not two.
- An XP Entry is unique per source Completion, so replaying a completion cannot double-award.

## Consequences

XP becomes as verifiable as every other metric, and the "verified" claim holds across the board
rather than for six metrics out of seven. Steady Hand can be defended from records.

The uniqueness constraint on the source Completion removes the race by construction: a duplicate
grant is rejected by the database rather than lost in a read-modify-write window.

XP history — an itemised "where your XP came from" view — becomes available without new
modelling. The dashboard will want this.

The costs are real but small: one extra write per completion, a cache that can in principle
diverge from the ledger, and a reconciliation path to correct it when it does. Divergence is now
*detectable*, which is the entire point; previously it was neither detectable nor correctable.

Existing `profiles.xp` totals have no provenance and cannot be decomposed into entries after the
fact. Backfill must either synthesise opening-balance entries from current totals or accept that
pre-ledger XP is unattributed. This is the one-way part of the decision.

## Alternatives considered

**Atomic increment only** — a Postgres function performing `xp = xp + $1`. Fixes the race and
nothing else. The total stays unauditable and unrecomputable, which was the deeper problem, for
nearly the same implementation cost.

**Derive from existing per-record columns** — sum the `xp_earned` columns already present on
completion rows. No new table, but incomplete for Missions and Projects, and it spreads XP's
provenance across five tables that must each be remembered and joined.
