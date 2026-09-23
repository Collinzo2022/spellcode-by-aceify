-- SpellCode by Aceify: derive a Streak from the Learner's own Local Day.
-- Run in Supabase SQL Editor BEFORE deploying the application. See DEPLOY ORDER.
--
-- A Streak was stored as a fact and only recalculated when the Learner completed
-- something, so a 12-day Streak abandoned two months ago still read 12 on the
-- dashboard - wrong on screen, indefinitely, for exactly the Learners a Streak
-- exists to pull back. Only Daily Tasks advanced it, so a Learner who spent a
-- week on Lessons and Missions saw a Streak of 1. And any XP award floored the
-- stored value at 1, a line that existed to avoid displaying a zero rather than
-- to model anything. See ticket 11.
--
-- After this, `current_streak` is the LENGTH OF A RUN and no longer a Streak on
-- its own: the application derives the Streak on read, showing the run only
-- while `last_learning_day` is today or yesterday in the reading request's Local
-- Day, and zero otherwise. That is what lets a Streak lapse with no job.
--
-- `last_learning_day` is a `date`, not a timestamp, on purpose. It is the
-- Learner's own calendar day, computed from the offset their client sent on the
-- request that completed the unit of learning; an instant would invite a reader
-- to recompute the day in some other frame, which is the drift the ticket is
-- about. `last_learning_at` keeps the real instant and stops being stamped at
-- noon UTC.
--
-- NO BACKFILL, and none is possible. Recovering a run's length from Completion
-- history would need the offset each Completion was made under, which no
-- Completion table records. It is not needed: no real Learner exists before this
-- deploys (a launch rule), and the fresh Supabase project starts with none, so
-- there are no noon-UTC stamps to recover. Every existing row gets a null
-- `last_learning_day`, which reads as a Streak of zero until that Learner next
-- completes something - the honest answer when nothing records which day their
-- run reached.

begin;

alter table public.profiles
  add column if not exists last_learning_day date;

comment on column public.profiles.last_learning_day is
  'The Learner''s own calendar day on which their run was last extended, from the offset their client sent. Null means no run. With current_streak, this is what a Streak is derived from on read; neither column is a Streak by itself.';

comment on column public.profiles.current_streak is
  'The length of the Learner''s run of consecutive Local Days. Not a Streak on its own: a run only counts while last_learning_day is today or yesterday for the reader.';

commit;

-- DEPLOY ORDER
--
-- Run this BEFORE deploying the build that contains ticket 11, and it is safe
-- to run early: adding a nullable column changes nothing for the running build.
-- The build before ticket 11 never selects `last_learning_day` and reads
-- `current_streak` as a Streak on its own, which is what it did before this
-- file existed.
--
-- Deploying the application first is the order that breaks: every read of a
-- profile then asks for a column that does not exist, and PostgREST answers
-- the whole request with an error - so the dashboard, the daily overview and
-- both mobile payloads fail together, not just the Streak on them.
--
-- This is the first schema change after the switch off Manus, and it sets the
-- rule for the ones after it: ship the migration for the live project, and fold
-- the same change into `supabase_schema_draft.sql` so a fresh replay produces an
-- identical schema. That fold is already done.

-- Verify, after committing:
--   select column_name, data_type
--     from information_schema.columns
--    where table_schema = 'public' and table_name = 'profiles'
--      and column_name in ('current_streak', 'last_learning_day', 'last_learning_at')
--    order by column_name;
--
-- Expect three rows: current_streak integer, last_learning_at timestamp with
-- time zone, last_learning_day date.
