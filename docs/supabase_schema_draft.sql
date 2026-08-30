-- SpellCode by Aceify: Supabase/Postgres starter schema.
-- Run in the Supabase SQL Editor after creating the project.

create extension if not exists pgcrypto;

create type public.user_role as enum ('learner', 'instructor', 'admin');
create type public.lesson_state as enum ('not_started', 'in_progress', 'completed');
create type public.subscription_state as enum ('inactive', 'pending', 'active', 'past_due', 'cancelled', 'expired');
create type public.payment_state as enum ('initialized', 'success', 'failed', 'abandoned', 'refunded', 'disputed');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  role public.user_role not null default 'learner',
  xp integer not null default 0 check (xp >= 0),
  current_streak integer not null default 0 check (current_streak >= 0),
  longest_streak integer not null default 0 check (longest_streak >= 0),
  last_learning_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tracks (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug in ('html', 'css', 'javascript')),
  name text not null unique check (name in ('HTML', 'CSS', 'JavaScript')),
  description text not null,
  color_hex text,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.lessons (
  id uuid primary key default gen_random_uuid(),
  track_id uuid not null references public.tracks(id) on delete cascade,
  slug text not null,
  title text not null,
  description text not null,
  difficulty text not null check (difficulty in ('Beginner', 'Intermediate', 'Advanced')),
  sort_order integer not null check (sort_order > 0),
  duration_minutes integer not null check (duration_minutes > 0),
  xp_reward integer not null default 50 check (xp_reward >= 0),
  theory_markdown text not null,
  example_code jsonb not null default '{}'::jsonb,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(track_id, slug),
  unique(track_id, sort_order)
);

create table public.challenges (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null unique references public.lessons(id) on delete cascade,
  prompt text not null,
  required_fragments jsonb not null default '[]'::jsonb,
  hint_nudge text,
  hint_detail text,
  reference_solution jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.enrollments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  track_id uuid not null references public.tracks(id) on delete cascade,
  enrolled_at timestamptz not null default now(),
  unique(user_id, track_id)
);

create table public.lesson_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  state public.lesson_state not null default 'not_started',
  score integer check (score between 0 and 100),
  xp_earned integer not null default 0 check (xp_earned >= 0),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique(user_id, lesson_id)
);

create table public.challenge_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  score integer not null check (score between 0 and 100),
  passed boolean not null default false,
  submitted_code jsonb not null default '{}'::jsonb,
  feedback jsonb,
  created_at timestamptz not null default now()
);

create table public.coding_workspaces (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  lesson_id uuid references public.lessons(id) on delete set null,
  project_id uuid,
  html_code text not null default '',
  css_code text not null default '',
  javascript_code text not null default '',
  updated_at timestamptz not null default now(),
  unique(user_id, lesson_id)
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  description text not null,
  track_id uuid references public.tracks(id) on delete set null,
  difficulty text not null check (difficulty in ('Beginner', 'Intermediate', 'Advanced')),
  duration_minutes integer not null check (duration_minutes > 0),
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.coding_workspaces
  add constraint coding_workspaces_project_id_fkey
  foreign key (project_id) references public.projects(id) on delete set null;

create table public.project_steps (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null,
  instructions_markdown text not null,
  sort_order integer not null check (sort_order > 0),
  unique(project_id, sort_order)
);

create table public.project_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  completed_step_ids jsonb not null default '[]'::jsonb,
  submission_url text,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique(user_id, project_id)
);

-- The three sequential steps of the Beginner Build Lab. A Mission's teaching
-- content - instruction, starter code, required fragments - is curriculum and
-- lives in shared/beginnerModule.ts. This table exists so a Mission Completion
-- has something to reference.
create table public.missions (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  created_at timestamptz not null default now()
);

-- The three Beginner Build Lab Missions, seeded here rather than by the
-- application: a Mission Completion is written the moment a Learner clears a
-- Mission, so the catalog must exist before the first request, not after it.
-- Ticket 05 made the same choice in supabase_mission_completion_migration.sql
-- and these rows must stay identical to the ones it seeds.
insert into public.missions (slug, title) values
  ('welcome', 'Make a page say hello'),
  ('voice', 'Give it a human voice'),
  ('action', 'Invite an action')
on conflict (slug) do update set title = excluded.title;

create table public.mission_completions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  mission_id uuid not null references public.missions(id) on delete cascade,
  completed_at timestamptz not null default now(),
  unique(user_id, mission_id)
);

-- The system of record for XP (ADR 0002). One row per XP award, naming the
-- Completion that caused it. Append-only: nothing updates or deletes a row.
-- profiles.xp is a cache of the sum of these.
--
-- source_id is the id of the unit of learning completed - the Lesson, Challenge,
-- Daily Task, Project or Mission. Together with user_id it identifies one
-- Learner's Completion of one unit exactly, because every Completion table is
-- itself unique per Learner per unit. The unique constraint below is therefore
-- what makes a double award impossible, rather than application code narrowing a
-- read-modify-write window it cannot close.
--
-- 'opening_balance' is reserved for ticket 09's backfill of pre-ledger totals,
-- which have no Completion to name; it uses the Learner's own id as its source,
-- so the same constraint allows exactly one per Learner.
create table public.xp_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  -- Zero is allowed, not because an earned award is ever zero, but because ticket
  -- 09 must write an opening-balance entry for EVERY existing Learner and some
  -- have no XP yet. Forbidding it here would force a schema change on a table
  -- that is by then append-only and in use. What the constraint exists to
  -- enforce is that XP never decreases (CONTEXT.md), and >= 0 still does that.
  amount integer not null check (amount >= 0),
  source_kind text not null check (source_kind in ('lesson', 'challenge', 'daily_task', 'project', 'mission', 'opening_balance')),
  source_id uuid not null,
  created_at timestamptz not null default now(),
  unique(user_id, source_kind, source_id)
);

create index xp_entries_user_id_idx on public.xp_entries(user_id);

-- A Learner's XP total. Every read of it goes through here rather than the
-- application summing rows: the ledger grows without bound and PostgREST caps
-- returned rows, so an application-side sum would go quietly wrong for exactly
-- the Learners who have earned the most. profiles.xp is a cache of this.
--
-- security_invoker makes the view obey the caller's row-level security rather
-- than the definer's, so it cannot become a way to read another Learner's
-- total. Requires Postgres 15 or later.
create view public.learner_xp_totals
  with (security_invoker = on) as
select user_id, coalesce(sum(amount), 0)::integer as xp
  from public.xp_entries
 group by user_id;

-- Recompute one Learner's cached total from their ledger, atomically. The
-- application calls this rather than reading the sum and writing it back:
-- read-then-write is a lost-update race however absolute the value written,
-- while a single UPDATE whose value is a subquery holds the row lock for the
-- whole statement. security definer with a pinned search_path, and revoked from
-- every role but the service key.
create or replace function public.recompute_learner_xp(learner uuid)
returns integer
language sql
security definer
set search_path = public
as $$
  update public.profiles p
     set xp = coalesce((select xp from public.learner_xp_totals t where t.user_id = learner), 0),
         updated_at = now()
   where p.id = learner
  returning p.xp;
$$;

revoke all on function public.recompute_learner_xp(uuid) from public, anon, authenticated;

create table public.awards (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text not null,
  icon_key text,
  xp_threshold integer check (xp_threshold >= 0),
  created_at timestamptz not null default now()
);

create table public.user_awards (
  user_id uuid not null references public.profiles(id) on delete cascade,
  award_id uuid not null references public.awards(id) on delete cascade,
  earned_at timestamptz not null default now(),
  primary key(user_id, award_id)
);

create table public.activity_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  event_type text not null,
  title text not null,
  detail text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  paystack_plan_code text unique,
  currency text not null,
  amount_minor integer not null check (amount_minor >= 0),
  interval text not null check (interval in ('one_time', 'monthly', 'quarterly', 'annually')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  plan_id uuid not null references public.plans(id) on delete restrict,
  status public.subscription_state not null default 'inactive',
  paystack_customer_code text,
  paystack_subscription_code text unique,
  paystack_email_token text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.payment_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete restrict,
  plan_id uuid references public.plans(id) on delete set null,
  subscription_id uuid references public.subscriptions(id) on delete set null,
  provider text not null default 'paystack',
  paystack_reference text not null unique,
  paystack_transaction_id text unique,
  paystack_authorization_code text,
  amount_minor integer not null check (amount_minor >= 0),
  currency text not null,
  status public.payment_state not null default 'initialized',
  paid_at timestamptz,
  provider_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.paystack_webhook_events (
  id uuid primary key default gen_random_uuid(),
  event_id text not null unique,
  event_type text not null,
  payload jsonb not null,
  processed_at timestamptz,
  processing_error text,
  received_at timestamptz not null default now()
);

create index lesson_progress_user_idx on public.lesson_progress(user_id, state);
create index challenge_attempts_user_idx on public.challenge_attempts(user_id, created_at desc);
create index activity_events_user_idx on public.activity_events(user_id, created_at desc);
create index payment_transactions_user_idx on public.payment_transactions(user_id, created_at desc);
create index subscriptions_user_idx on public.subscriptions(user_id, status);

alter table public.profiles enable row level security;
alter table public.enrollments enable row level security;
alter table public.lesson_progress enable row level security;
alter table public.challenge_attempts enable row level security;
alter table public.coding_workspaces enable row level security;
alter table public.project_progress enable row level security;
alter table public.mission_completions enable row level security;
alter table public.xp_entries enable row level security;
alter table public.user_awards enable row level security;
alter table public.activity_events enable row level security;
alter table public.subscriptions enable row level security;
alter table public.payment_transactions enable row level security;

create policy "profiles_read_own" on public.profiles for select using (auth.uid() = id);
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id);
create policy "enrollments_manage_own" on public.enrollments for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "lesson_progress_manage_own" on public.lesson_progress for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "challenge_attempts_manage_own" on public.challenge_attempts for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "workspaces_manage_own" on public.coding_workspaces for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "project_progress_manage_own" on public.project_progress for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "mission_completions_read_own" on public.mission_completions for select using (auth.uid() = user_id);
create policy "xp_entries_read_own" on public.xp_entries for select using (auth.uid() = user_id);
create policy "user_awards_read_own" on public.user_awards for select using (auth.uid() = user_id);
create policy "activity_events_read_own" on public.activity_events for select using (auth.uid() = user_id);
create policy "subscriptions_read_own" on public.subscriptions for select using (auth.uid() = user_id);
create policy "payments_read_own" on public.payment_transactions for select using (auth.uid() = user_id);

-- Then run supabase_auth_profile_bridge_migration.sql to create profiles from auth.users before enabling self-service signup.
-- Content tables (`tracks`, `lessons`, `challenges`, `projects`, `project_steps`, `missions`, `awards`, and `plans`)
-- should have read-only policies for published records and server/admin-only write access.
