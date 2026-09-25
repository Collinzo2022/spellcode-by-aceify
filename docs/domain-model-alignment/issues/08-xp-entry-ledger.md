# 08: XP Entry ledger

**What to build:** Every XP award a Learner receives is recorded individually, naming the
Completion that caused it.

XP is currently a counter incremented in place with a read-modify-write. Two completions landing at
the same moment silently lose one award, and nothing records why a total is what it is — so the
Steady Hand award is granted from a number the system cannot defend, inside a catalog whose entire
premise is verified evidence.

Introduce the XP Entry as the system of record: one append-only row per XP award, holding the
Learner, the amount, the kind of source and the identifier of the single Completion that caused it.
A uniqueness constraint on the Learner and the source Completion makes double-award impossible at
the database level — the race is removed by construction rather than narrowed.

There must be exactly **one** XP write path. The Daily Task path currently patches the total inline,
bypassing the shared path entirely; fold it in.

The Learner's visible total still comes from the cached column in this ticket. Deriving it is
ticket 09.

**Blocked by:** 05 (Mission Completions become records), 06 (Project Completions read from Project
records).

**Status:** implemented; two boxes below need a real database and are deliberately unticked.

- [x] An XP Entry is written for every XP award, from every one of the five units of learning.
- [x] Each entry records the Learner, the amount, the source kind and the source Completion.
      The source is named as (kind, unit id) rather than the Completion row's own id: every
      Completion table is unique per Learner per unit, so the pair maps one-to-one onto a
      Completion without a round-trip to fetch its row id.
- [x] Entries are append-only; nothing updates or deletes one.
- [x] A uniqueness constraint on Learner plus source Completion rejects a duplicate.
- [x] Repeating a completion already finished writes no new entry and awards no XP.
- [x] A replayed or retried request awards no additional XP. **This required a behaviour change
      for Challenges**: the entry names the Challenge, not the attempt. A new attempt row is
      written on every submission, so keying on it would have paid a Learner again for
      resubmitting work they had already passed — which is XP farming against the total Steady
      Hand is granted from. Passing a Challenge is now paid once.
- [x] The Daily Task path writes an entry through the same single path as every other completion,
      and no longer patches the total inline.
- [x] Two completions recorded at the same moment produce two entries; neither is lost — by
      construction, since the entries have different source ids and neither write reads the
      other. Not demonstrated against a real database; see the box below.
- [ ] Verified by hand against a real database: the uniqueness constraint rejects a concurrent
      duplicate write. A mocked test will let a double-write through and cannot prove this.
      **Not done — no database credentials in this environment.** The statements to run are in
      the verification block of `docs/supabase_xp_entry_ledger_migration.sql`.
- [x] The full test suite passes — 111 of 115. The 4 failures are the pre-existing
      credential-bound ones, unchanged by this ticket.

**Beyond the ticket, and deliberately.** The ticket says the Daily Task path is the one that
bypasses the shared path. There was a **third**: `POST /api/mobile/lesson/complete` in
`server/mobile.ts` did its own read-modify-write on `profiles.xp`. It also reimplemented Lesson
completion badly — no Activity Feed row and no Earned Award reconciliation, so a Learner working
on the phone never earned First Spark. The ticket's stated goal is exactly one XP write path, so
it is folded into `completeSupabaseLesson` too. The route's response keys are unchanged, because
the Android client is a separate codebase that cannot be changed from here.
