-- SpellCode by Aceify: reset an environment to empty so the replay order can run.
-- Run in the Supabase SQL Editor, immediately before supabase_schema_draft.sql.
--
-- THIS DESTROYS EVERY LEARNER RECORD IN THE ENVIRONMENT IT RUNS AGAINST: profiles,
-- XP Entries, Completions, Earned Awards, subscriptions, payments and webhook
-- history. There is no rollback and nothing here can be recovered. Read the
-- inspection queries at the bottom of this header and accept their answers before
-- running a single statement.
--
-- It exists because supabase_schema_draft.sql is NOT idempotent - 21 bare
-- `create table` statements and four bare `create type` - so the replay order can
-- only run against an empty schema, and nothing else in the repo empties one.
--
-- WHAT IT DOES NOT TOUCH, deliberately:
--   - `schema public` itself, and every grant on it. Dropping and recreating the
--     schema takes the postgres/anon/authenticated/service_role grants with it, and
--     a missing grant surfaces later as a PostgREST permission error that looks
--     nothing like its cause. Every object is named individually instead.
--   - `auth.users`. Existing logins survive a reset: the backend provisions a
--     missing profile idempotently on the next authenticated request, so a returning
--     Learner gets a fresh profile row rather than an error. Only the trigger that
--     creates one at signup is dropped here, and the replay order reinstalls it.
--   - Anything created by hand in the SQL Editor. A targeted reset removes only what
--     it names.
--
-- Every statement is `if exists ... cascade`, so this is safe to run against a
-- partially built environment, and safe to run twice.
--
-- INSPECT BEFORE RUNNING. These are read-only and answer "what am I about to
-- destroy?". Run them first and read the numbers:
--
--   select count(*) as learners from public.profiles;
--   select count(*) as paid_subscriptions from public.subscriptions where status = 'active';
--   select count(*) as payments from public.payment_transactions;
--   select count(*) as plans_with_paystack_codes from public.plans where paystack_plan_code is not null;
--
-- If `learners` counts anyone real, or `plans_with_paystack_codes` is non-zero,
-- STOP: those plan codes are hand-entered state that exists nowhere in this repo,
-- and this file will delete them. Capture them first.

begin;

-- The signup trigger depends on public.handle_new_auth_user. Dropped explicitly so
-- the intent is on the record rather than arriving as a cascade.
drop trigger if exists on_auth_user_created on auth.users;

-- Views first: they depend on the tables below.
drop view if exists public.admin_learner_billing_summary cascade;
drop view if exists public.admin_plan_performance_summary cascade;
drop view if exists public.learner_xp_totals cascade;

-- Tables created by supabase_schema_draft.sql.
drop table if exists public.paystack_webhook_events cascade;
drop table if exists public.payment_transactions cascade;
drop table if exists public.subscriptions cascade;
drop table if exists public.plans cascade;
drop table if exists public.activity_events cascade;
drop table if exists public.user_awards cascade;
drop table if exists public.awards cascade;
drop table if exists public.xp_entries cascade;
drop table if exists public.mission_completions cascade;
drop table if exists public.missions cascade;
drop table if exists public.project_progress cascade;
drop table if exists public.project_steps cascade;
drop table if exists public.projects cascade;
drop table if exists public.coding_workspaces cascade;
drop table if exists public.challenge_attempts cascade;
drop table if exists public.lesson_progress cascade;
drop table if exists public.enrollments cascade;
drop table if exists public.challenges cascade;
drop table if exists public.lessons cascade;
drop table if exists public.tracks cascade;
drop table if exists public.profiles cascade;

-- Tables created by the later migrations in the replay order:
-- daily_admin_payments, project_publishing, certificate_issuance.
drop table if exists public.daily_task_completions cascade;
drop table if exists public.daily_tasks cascade;
drop table if exists public.published_projects cascade;
drop table if exists public.certificates cascade;

-- Not objects the replay order creates: these are the award tables under their
-- pre-ticket-04 names, still held by an environment that never ran
-- supabase_award_rename_migration.sql. Dropping public.profiles above removes
-- user_achievements' foreign key to it but neither table, so without these the
-- first verify query at the bottom returns rows.
drop table if exists public.user_achievements cascade;
drop table if exists public.achievements cascade;

-- Functions. recompute_learner_xp is the single-statement XP recompute (ADR 0002);
-- the other three come from the bridge and daily/admin migrations.
drop function if exists public.recompute_learner_xp(uuid) cascade;
drop function if exists public.handle_new_auth_user() cascade;
drop function if exists public.prevent_unauthorized_role_change() cascade;
drop function if exists public.is_admin() cascade;

-- Enum types. No `drop table` removes these, and supabase_schema_draft.sql
-- recreates all four unconditionally - leaving them behind is the most likely way
-- for a replay to fail after the reset appears to have succeeded.
drop type if exists public.payment_state cascade;
drop type if exists public.subscription_state cascade;
drop type if exists public.lesson_state cascade;
drop type if exists public.user_role cascade;

commit;

-- VERIFY BEFORE REPLAYING. Both must return zero rows. A non-empty result means the
-- replay will fail partway through, which is worse than failing at the start.
--
--   select tablename from pg_tables where schemaname = 'public';
--   select typname from pg_type where typnamespace = 'public'::regnamespace and typtype = 'e';
--
-- Then run the replay order from docs/production_architecture.md, beginning with
-- supabase_schema_draft.sql.
