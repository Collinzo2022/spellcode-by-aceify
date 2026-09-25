# 18: The reset also drops the pre-alignment award tables

**What to build:** `docs/supabase_reset_environment.sql` empties an environment built before the
alignment work, as well as a current one.

The reset drops every object the replay order creates. That coverage was checked against the
replay files, not against what a real environment holds. An environment built before ticket 04
keeps the award tables under their old names, `public.achievements` and `public.user_achievements`,
and the reset names neither. `drop table public.profiles cascade` removes their foreign keys but
leaves the tables themselves, so a reset against such an environment fails its own "nothing left"
check partway through a destructive run. Across every version of every committed SQL file, these
two are the only objects ever created that the reset does not drop (checked 2026-09-22).

The one real environment turned out to hold `achievements` (0 rows) and no `user_achievements`. It
will not be reset: the switch builds a fresh Supabase project instead (handoff.md). So this ticket
is not needed for the switch. It is committed so the reset is correct if a pre-alignment
environment ever surfaces.

**Blocked by:** nothing.

**Status:** done (e81f107), pushed to `origin/main`.

- [x] The reset drops `public.user_achievements`, then `public.achievements`, each with
      `if exists ... cascade`.
- [x] A comment above the two says they are the pre-ticket-04 names, not objects the replay order
      creates.
- [x] Every statement in the header about what the reset covers is still true after the change.
- [x] `docs/production_architecture.md`, where it describes the reset, also mentions the two old
      names.
- [x] Nothing else in either file changes.
- [x] Nothing is executed. Nothing in the switch runs the reset.

Left alone, because the last-but-one box forbids other changes. Both predate this ticket:
- The reset's header says every statement is `if exists ... cascade`. The
  `drop trigger if exists on_auth_user_created on auth.users` statement has no `cascade`.
- `production_architecture.md`'s historical section says the old environment "was reset" and
  rebuilt. It is being replaced by a fresh project instead. Ticket 20's stage 6 rewrites that
  file's references to the old setup.
