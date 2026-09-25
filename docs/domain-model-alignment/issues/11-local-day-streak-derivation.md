# 11: Local-day Streak derivation

**What to build:** A Learner's Streak counts every day they learned anything, rolls over at their
own midnight, and lapses honestly the moment they miss a day.

Three things are wrong today. Only Daily Tasks advance a Streak, so a Learner who spent a week on
Lessons and Missions sees a Streak of 1. The value is stored and only recalculated when the Learner
completes something, so a 12-day Streak abandoned two months ago still reads 12 on the dashboard —
wrong on screen, indefinitely, for exactly the Learners a Streak is meant to pull back. And any XP
award floors the stored streak at 1, a line that exists to avoid displaying a zero rather than to
model anything.

Make a Streak the number of consecutive days, ending today or yesterday, on which the Learner
completed at least one unit of learning. All five kinds count equally. Derive it on read from the
Learner's last learning activity, using the offset their client sent, so it needs no job to lapse.

The same offset must apply at both ends of the calculation — deciding which local day a Completion
belongs to, and deciding which local day is "today". Stamping in one frame and deriving in another
silently drops days.

The derivation is a pure function of an instant and an offset, so its edge cases belong in
pure-function tests rather than staged scenarios.

**Decided (2026-09-22).**

- **Storage.** `current_streak` stays, as the length of the run. A new `last_learning_day date`
  holds the Local Day the run was last extended, computed with the completing request's offset. On
  read, the Streak is that run if the day is today or yesterday in the reading request's Local
  Day, and 0 otherwise. A single date cannot recover a run's length, and recomputing from
  Completion history would need the offset each Completion was made under, which no Completion
  table stores.
- **`last_learning_at`** is written as the real instant, ending the fabricated noon-UTC stamp.
- **A westward trip changes nothing.** A Completion that lands on a Local Day earlier than the
  stored one neither extends the run nor moves the stored day back.
- **No backfill.** No real Learner exists before this ticket deploys (a launch rule, handoff.md),
  and the fresh Supabase project starts with none, so there are no noon-UTC stamps to recover.
- **Shipped as a migration for the live project, and folded into the replay files.** This is the
  first schema change after the switch, and every one after it follows the same rule.
- **No `CONTEXT.md` edit.** The Streak entry already says what matters at the domain level; storage
  detail stays out of the glossary.
- **Closes when the server side lands.** The Android half is closed with Android; see
  `docs/android_handoff.md` (ticket 19).

**Blocked by:** 05 (Mission Completions become records), 06 (Project Completions read from Project
records), 10 (Clients send their UTC offset) — all done — and the switch (ticket 20), because its
migration is the first against the fresh project.

**Status:** done in code (2026-09-23). The migration has **not** been applied: there is no
Supabase project to apply it to until the switch (ticket 20) runs.

- [x] Completing a Lesson, Challenge, Daily Task, Project or Mission each advance a Streak equally.
      `extendLearningStreak` sits inside `awardXp`, already the single XP write path (ADR 0002),
      so all five reach it without five call sites remembering to. Asserted per kind in
      `server/streak-advances.test.ts`.
- [x] Several completions on the same local day advance a Streak once.
- [x] A Streak is derived on read; it is not stored as a fact.
- [x] A Streak whose last qualifying day is neither today nor yesterday reads zero, with no job
      required to make that happen.
- [x] A Learner returning after a long absence sees zero, not their old total.
- [x] Longest Streak remains stored, survives a lapse, and updates when a derived Streak exceeds it.
      Updated from the run rather than the derived Streak; the two coincide at the moment of a
      write, because the run's last day is then the completing request's today.
- [x] The behaviour that floors a stored streak at 1 on any XP award is removed.
- [x] Days are counted in the Learner's local time using the offset from their request.
- [x] The same offset governs both Completion stamping and "today". `offsetMinutesOf(req)` is
      read once per request and threaded explicitly, so the typechecker names every path that
      needs it rather than an ambient value silently supplying UTC.
- [x] Pure-function tests cover all five named cases, in `server/streak.test.ts`.
- [x] The full test suite passes. 188 passed, 2 skipped, 0 failed across 31 files;
      `npx tsc --noEmit` clean; `npm run build` succeeds.

**/code-review found, and this fixes:**

- **`client/src/pages/Daily.tsx` still rendered `profile.current_streak`** — the raw run, on the
  one page most about Streaks. A Learner who lapsed would have kept seeing their abandoned total
  forever: verbatim the bug this ticket opens with, shipped by the change meant to remove it.
  Both review axes found it independently. The whole web client was missed: only the server and
  `server/mobile.ts` had been changed.
- No guard existed for that class of mistake, which no assertion on a payload can see. Added one
  scanning `client/src` for `current_streak`, and mutation-tested it: injecting the field into
  `Dashboard.tsx` turns it red.
- `registerUtcOffsetContract`'s doc comment had been orphaned by inserting `offsetMinutesOf`
  between it and its function.
- The migration's banner said "See DEPLOY ORDER" with no such section, which the house style
  always pairs it with.
- `completeDailyLearningTask` re-read the profile for a run `awardXp` had just written.
- The "missing offset treated as UTC" test passed `0` explicitly, so it restated the case rather
  than testing it. It now reads through `parseUtcOffsetMinutes(undefined)`.

**Left as it is, with reasons.** `extendLearningStreak` is a read-modify-write and still races;
the cost is one undercounted day, and serialising it is not worth a transaction. The Streak now
inherits XP's idempotency key, so a day spent only revising already-completed Lessons advances
nothing — correct under "completed at least one unit of learning", but worth knowing.

**NOT VERIFIED against a database or a browser.** No `.env` and no Supabase project exist, so
the dev server does not boot. Everything here is verified by the suite, the typechecker and the
production build. The migration's own verify query is written but has never been run.
