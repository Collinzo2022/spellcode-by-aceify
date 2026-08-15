-- SpellCode by Aceify: Full Access project publishing.
-- Run in Supabase SQL Editor after the existing SpellCode migrations.

create table if not exists public.published_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  project_slug text not null,
  title text not null,
  storage_key text not null,
  public_url text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, project_slug)
);

create index if not exists published_projects_user_idx on public.published_projects(user_id, updated_at desc);

alter table public.published_projects enable row level security;
create policy published_projects_read_own on public.published_projects for select using (auth.uid() = user_id or public.is_admin());

-- Publishing writes are server-side only, after Full Access entitlement verification.
