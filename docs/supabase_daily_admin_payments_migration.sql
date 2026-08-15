-- SpellCode by Aceify: daily-learning, installment, and administrator extension.
-- Run this in Supabase SQL Editor after supabase_schema_draft.sql.

alter table public.plans
  add column if not exists max_installments smallint,
  add column if not exists paid_features jsonb not null default '[]'::jsonb,
  add constraint plans_max_installments_check check (max_installments is null or max_installments > 0);

alter table public.subscriptions
  add column if not exists installments_paid smallint not null default 0 check (installments_paid >= 0),
  add column if not exists installments_due smallint,
  add column if not exists last_payment_at timestamptz,
  add column if not exists entitlement_snapshot jsonb not null default '{}'::jsonb;

create table if not exists public.daily_tasks (
  id uuid primary key default gen_random_uuid(),
  task_date date not null unique,
  title text not null,
  description text not null,
  track_id uuid references public.tracks(id) on delete set null,
  lesson_id uuid references public.lessons(id) on delete set null,
  difficulty text not null check (difficulty in ('Beginner', 'Intermediate', 'Advanced')),
  xp_reward integer not null default 25 check (xp_reward >= 0),
  estimated_minutes integer not null default 10 check (estimated_minutes between 1 and 90),
  task_content jsonb not null default '{}'::jsonb,
  required_plan_code text references public.plans(code) on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.daily_task_completions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  daily_task_id uuid not null references public.daily_tasks(id) on delete cascade,
  state public.lesson_state not null default 'not_started',
  score integer check (score between 0 and 100),
  xp_earned integer not null default 0 check (xp_earned >= 0),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique(user_id, daily_task_id)
);

create index if not exists daily_tasks_date_idx on public.daily_tasks(task_date desc);
create index if not exists daily_task_completions_user_idx on public.daily_task_completions(user_id, completed_at desc);

insert into public.plans (code, name, currency, amount_minor, interval, max_installments, paid_features, is_active)
values
  ('full-access-one-time', 'Full Access (One-time)', 'NGN', 12000000, 'one_time', 1, '["all_lessons_past_level_1", "project_publishing", "certificate", "unlimited_ai_tutor"]'::jsonb, false),
  ('full-access-3-month', 'Full Access (3-Month Installment)', 'NGN', 4000000, 'monthly', 3, '["all_lessons_past_level_1", "project_publishing", "certificate", "unlimited_ai_tutor"]'::jsonb, false),
  ('full-access-6-month', 'Full Access (6-Month Installment)', 'NGN', 2000000, 'monthly', 6, '["all_lessons_past_level_1", "project_publishing", "certificate", "unlimited_ai_tutor"]'::jsonb, false)
on conflict (code) do update set
  name = excluded.name,
  currency = excluded.currency,
  amount_minor = excluded.amount_minor,
  interval = excluded.interval,
  max_installments = excluded.max_installments,
  paid_features = excluded.paid_features,
  updated_at = now();

-- Once Paystack plan codes are created, set them and then activate the applicable plan.
-- Example: update public.plans set paystack_plan_code = 'PLN_xxx', is_active = true where code = 'full-access-3-month';

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select role = 'admin' from public.profiles where id = auth.uid()), false);
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

create or replace function public.prevent_unauthorized_role_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role and not public.is_admin() then
    raise exception 'Only an administrator can change a profile role';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_prevent_unauthorized_role_change on public.profiles;
create trigger profiles_prevent_unauthorized_role_change
before update on public.profiles
for each row execute procedure public.prevent_unauthorized_role_change();

alter table public.plans enable row level security;
alter table public.daily_tasks enable row level security;
alter table public.daily_task_completions enable row level security;

drop policy if exists profiles_read_own on public.profiles;
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_read_self_or_admin on public.profiles for select using (auth.uid() = id or public.is_admin());
create policy profiles_update_self_or_admin on public.profiles for update using (auth.uid() = id or public.is_admin()) with check (auth.uid() = id or public.is_admin());

create policy plans_read_active on public.plans for select using (is_active = true or public.is_admin());
create policy plans_admin_manage on public.plans for all using (public.is_admin()) with check (public.is_admin());
create policy daily_tasks_read_published on public.daily_tasks for select using (published_at is not null or public.is_admin());
create policy daily_tasks_admin_manage on public.daily_tasks for all using (public.is_admin()) with check (public.is_admin());
create policy daily_task_completions_manage_own on public.daily_task_completions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists subscriptions_read_own on public.subscriptions;
drop policy if exists payments_read_own on public.payment_transactions;
create policy subscriptions_read_self_or_admin on public.subscriptions for select using (auth.uid() = user_id or public.is_admin());
create policy payments_read_self_or_admin on public.payment_transactions for select using (auth.uid() = user_id or public.is_admin());

-- Server-side checkout and webhook code should use the service role key; clients must not write plans,
-- subscriptions, payment_transactions, or paystack_webhook_events directly.
