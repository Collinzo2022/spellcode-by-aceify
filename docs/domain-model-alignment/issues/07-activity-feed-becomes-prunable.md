# 07: The Activity Feed becomes prunable

**What to build:** A Learner's standing survives their Activity Feed being emptied.

This is the safety step that proves the separation actually landed. With Missions and Projects now
counted from Completion records, the feed-reading code paths are dead — but dead code that still
compiles is code someone will copy. Delete them, then demonstrate the property they were blocking.

After this ticket the Activity Feed is what it was always described as: a human-readable history,
written for display, read only for display, prunable at any time.

Choosing *when* to prune is a separate decision and out of scope here. This ticket makes pruning
safe, not scheduled.

**Blocked by:** 05 (Mission Completions become records), 06 (Project Completions read from Project
records).

**Status:** implemented.

- [x] No count, gate, award or XP calculation queries the Activity Feed anywhere in the codebase.
      Held by a test that reads the source itself, not only by behaviour: the feed has no
      constraints and no foreign keys, so nothing else would catch a reintroduction.
- [x] The dead feed-reading code paths are deleted, not merely bypassed. **The premise was
      false**: there were none left. Tickets 05 and 06 deleted them as they switched the evidence
      over, rather than leaving them behind — so this box was already satisfied when the ticket
      was opened. Verified across server, shared, client and SQL. The one surviving read is the
      presentational one this ticket requires to keep.
- [x] Demonstrated end to end: empty a Learner's Activity Feed entirely, and every Earned Award,
      their XP total and their Streak are unchanged. The same fully-verified Learner is run twice,
      once with a populated feed and once with none, and the two standings are compared whole.
      **The Earned Awards are the real demonstration** — every counter is recomputed from
      Completion records on each call, so emptying the feed could change them and does not. The
      XP and Streak arms are weaker and the test says so: both are read straight off the profile
      row, which has no dependency on the feed to lose. What makes those two true is that nothing
      recomputes them from the feed, which the source guard holds instead. They get their teeth
      in ticket 09, when XP becomes a sum of XP Entries.
- [x] The Activity Feed is still written on every notable action, so a Learner's history still
      displays.
- [x] No retention or pruning schedule is introduced by this ticket. The two preconditions that
      bind whoever chooses one are recorded in `docs/production_architecture.md`.
- [x] The full test suite passes — 116 of 120. The 4 failures are the pre-existing
      credential-bound ones, unchanged by this ticket.

**Found while verifying, not fixed here.** `shared/progress.ts` is dead production code: nothing
imports it but tests. It hardcodes XP amounts that now live in the ledger, and
`applyLessonCompletion` models XP as a counter mutated in place — the very thing ADR 0002
abolished. It is exactly the "dead code someone will copy" this ticket worries about, but it is
not a *feed-reading* path, so deleting it is not this ticket's call to make.
