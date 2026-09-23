-- Rollback for supabase_local_day_streak_migration.sql (ticket 11).
--
-- Drops `last_learning_day` and returns `current_streak` to being read as a
-- Streak on its own. Only meaningful alongside a deploy of the application from
-- before ticket 11: the current build derives a Streak from both columns, and
-- against a database without `last_learning_day` every read fails.
--
-- Dropping the column loses which day each run reached. That is not recoverable
-- from Completion history, because no Completion table records the offset it was
-- made under - the same reason the migration does not backfill. After a rollback
-- and a re-run of the migration, every Learner's run reads as zero until they
-- next complete something.

begin;

alter table public.profiles
  drop column if exists last_learning_day;

comment on column public.profiles.current_streak is null;

commit;

-- Verify, after committing:
--   select column_name from information_schema.columns
--    where table_schema = 'public' and table_name = 'profiles'
--      and column_name = 'last_learning_day';
--
-- Expect no rows.
