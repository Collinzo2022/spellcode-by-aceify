-- Run in the Supabase SQL Editor after supabase_schema_draft.sql.
-- This is safe to run on an existing project. It provisions a learner profile
-- when a Supabase Auth user is created, making profiles the durable source for
-- XP, streak, learner role, and dashboard statistics.

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'display_name',
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      new.email,
      'Learner'
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_auth_user();

-- Verify after running:
-- select id, display_name, xp, current_streak, longest_streak
-- from public.profiles order by created_at desc limit 10;
