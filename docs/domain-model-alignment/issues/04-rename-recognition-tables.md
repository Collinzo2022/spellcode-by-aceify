# 04: Rename the recognition tables

**What to build:** Nothing changes for a Learner. The schema starts speaking the same language as
the rest of the system.

With the vocabulary settled in code, the storage layer is the last place still calling an Award an
achievement. Rename the definition table and the earned-record table to match the glossary.

This ticket touches live Learner data and is deliberately alone, so it can be rolled back without
reverting anything else.

**Blocked by:** 03 (Recognition vocabulary and corrected award text).

**Status:** done (4e60ab3). No longer blocked: the migration will never run (see below).

- [x] The Award definition table and the Earned Award table are renamed to match the glossary.
- [x] The column holding the database UUID is named for an Award, not an achievement.
- [x] Every existing Earned Award survives the rename — no Learner loses recognition they had.
- [x] The migration is reversible, and the reverse has been written and reviewed.
- [x] No other change ships in this ticket.
- [ ] **NOT DONE — needs you.** Verified by hand against a real database: the rename applies cleanly and
      Earned Award counts match before and after.
- [x] The full test suite passes.

**On the box left unticked (2026-09-22).** It can no longer be done, and nothing depends on it. No
environment holding the old names will ever be migrated: the one that existed is being replaced by
a fresh Supabase project, which gets `awards` and `user_awards` straight from the replay order
(handoff.md, "The move off Manus"). Inspecting that environment found `achievements` empty and no
`user_achievements` at all, so there were no Earned Awards to carry across.
