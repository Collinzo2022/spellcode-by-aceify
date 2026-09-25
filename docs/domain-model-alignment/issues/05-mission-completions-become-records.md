# 05: Mission Completions become records

**What to build:** A Learner who clears a Mission in the Beginner Build Lab gets a durable
Completion record, and their Launchpad award is verified from it.

Today Mission completions exist only as rows in the Activity Feed — a display-only table with no
constraints and no foreign keys — found by filtering an unconstrained text column and reading a
mission identifier out of untyped JSON. The Launchpad award rests entirely on that. Pruning old
feed rows, or renaming one string, silently revokes an award a Learner already earned.

Give Missions their own Completion record, unique per Learner per Mission, and migrate the existing
history across before anything is pruned.

**The backfill is the riskiest step in this whole effort** — it is the only one that can silently
cost a Learner something they earned. Inspect real production data before writing the migration.
Feed entries whose metadata lacks a usable mission identifier cannot be recovered; the migration
must report how many such rows exist rather than skipping them silently. If that count is
meaningful, raise it before proceeding rather than absorbing it.

**Blocked by:** 01 (Establish the single test seam), 02 (Introduce learnerId at the framework
boundary).

**Status:** implemented; three boxes below need a real database and are deliberately unticked.

- [x] A Mission Completion record is written when a Learner clears a Mission.
- [x] A Completion references the Learner and the Mission, and is unique per Learner per Mission.
- [x] Clearing the same Mission twice counts once.
- [x] Existing Mission completions are backfilled out of Activity Feed metadata.
- [x] The migration reports the number of feed rows that could not be recovered, rather than
      skipping them silently.
- [ ] Production data has been inspected and the unrecoverable count is known and accepted before
      the migration ships. **Not done — no database credentials in this environment.** The
      read-only inspection queries are at the top of
      `docs/supabase_mission_completion_migration.sql`, marked to be run first and on their own.
      **The migration must not ship until their answer is accepted.**
- [x] The Launchpad award is verified from Mission Completion records, not from the Activity Feed.
- [ ] A Learner who has cleared all three Missions still holds Launchpad after the migration.
      Proven for the application (`server/mission-completions.test.ts`) but not against real data,
      which is what this box asks. An Earned Award already in `user_awards` is never withdrawn, so
      the risk is to the *evidence* and the progress shown, not to the award itself.
- [ ] Verified by hand against a real database: the uniqueness constraint rejects a duplicate
      Completion. A mocked test cannot prove this. **Not done — no database.** The statement to run
      is the last verification query in the migration file.
- [x] The full test suite passes — 91 of 95. The 4 failures are the pre-existing credential-bound
      ones (`external-config` ×2, `supabase-empty-response`, `supabase-profile-provision`),
      unchanged by this ticket.
