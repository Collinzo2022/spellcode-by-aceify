# 06: Project Completions read from Project records

**What to build:** A Learner's Builder award is verified from their Project records, the same
evidence every other award reads from.

Project completions are currently counted by filtering the Activity Feed for a magic string, even
though Project progress records already exist and are not consulted. The award therefore rests on
display data rather than on the Learner's actual Project history.

Switch Builder's verification to read Project progress records.

**Blocked by:** 01 (Establish the single test seam), 02 (Introduce learnerId at the framework
boundary).

**Status:** done (453b8db).

- [x] Project completion is counted from Project progress records.
- [x] The Builder award is verified from those records, not from the Activity Feed.
- [ ] A Learner who has completed a Project still holds Builder after the change.
- [x] Completing the same Project twice counts once.
- [x] No award, count or gate reads the Activity Feed for Project data.
- [x] The full test suite passes.

**On the one box left unticked.** Nothing verifies that a Learner who completed a Project before
the change still holds Builder, because the backfill that would carry them across
(`supabase_project_completion_backfill_migration.sql`) will now never run: ticket 14 records the
decision to reset and rebuild the one environment rather than migrate it. There are no pre-change
Learners to carry. The box stays unticked because the claim is untested rather than because it is
known false.
