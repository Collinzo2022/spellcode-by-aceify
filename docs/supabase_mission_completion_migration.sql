-- SpellCode by Aceify: give Missions their own Completion record.
-- Run in Supabase SQL Editor BEFORE deploying the application. See DEPLOY ORDER.
--
-- The Launchpad award used to be counted out of the Activity Feed, which ADR
-- 0003 makes presentational: an unconstrained text column, no foreign keys, no
-- uniqueness, prunable at any time. A Mission completion was found by filtering
-- event_type = 'beginner_module' and reading metadata ->> 'mission_id' out of
-- untyped jsonb. Renaming either string, or pruning the feed, silently revoked
-- an award a Learner had already earned.
--
-- This creates public.missions and public.mission_completions, seeds the three
-- Missions of the Beginner Build Lab, and moves the existing history across.
--
-- ============================================================================
-- RUN THIS FIRST, ON ITS OWN, AND HAVE THE ANSWER ACCEPTED
-- ============================================================================
-- This is the only step in the domain-model-alignment effort that can cost a
-- Learner something they earned. A feed row whose metadata carries no usable
-- mission_id cannot be recovered: nothing else in the database records that the
-- Mission was cleared. The migration below reports the count and continues.
-- Read it before running the migration, not after.
--
-- Read-only, and safe to run before the tables below exist - which is why the
-- three Mission slugs are written out here rather than selected from
-- public.missions, as the in-migration report does once that table is created.
--
-- Two buckets, counted differently on purpose.
--
-- A row that NAMES a Mission not in the catalog can be de-duplicated: two rows
-- naming the same unknown slug are one lost Completion. A row that names NO
-- Mission cannot. SQL's `distinct` treats nulls as equal, so counting those as
-- pairs collapses a Learner's three unidentifiable rows into one and reports a
-- loss smaller than it is. They are counted as rows, and the true figure is
-- somewhere between that and the number of Learners - unknowable by
-- construction, which is the point.
--
--   select
--     count(*) filter (where mission_slug is not null) as unrecoverable_named_pairs,
--     (select count(*) from public.activity_events
--       where event_type = 'beginner_module' and metadata ->> 'mission_id' is null)
--       as unidentifiable_rows
--   from (
--     select distinct event.user_id, event.metadata ->> 'mission_id' as mission_slug
--       from public.activity_events event
--      where event.event_type = 'beginner_module'
--        and event.metadata ->> 'mission_id' is not null
--        and event.metadata ->> 'mission_id' not in ('welcome', 'voice', 'action')
--   ) unmatched;
--
-- And who is affected, so the loss can be judged rather than totalled:
--
--   select event.user_id,
--          count(*) as feed_rows,
--          count(*) filter (where event.metadata ->> 'mission_id' is null) as unidentifiable_rows
--     from public.activity_events event
--    where event.event_type = 'beginner_module'
--      and coalesce(event.metadata ->> 'mission_id', '') not in ('welcome', 'voice', 'action')
--    group by event.user_id order by feed_rows desc;
--
-- A Learner who already holds Launchpad keeps it either way - an Earned Award is
-- never withdrawn, and reconciliation only ever adds. What an unrecoverable row
-- costs them is the *evidence*: their Beginner Build Lab progress reads lower
-- than what they did, and a Mission they cleared reopens as if they had not.
-- ============================================================================

begin;

-- The three sequential steps of the Beginner Build Lab. A Mission's teaching
-- content - instruction, starter code, required fragments - is curriculum and
-- lives in shared/beginnerModule.ts. This table exists so a Mission Completion
-- has something to reference.
create table if not exists public.missions (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.mission_completions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  mission_id uuid not null references public.missions(id) on delete cascade,
  completed_at timestamptz not null default now(),
  unique(user_id, mission_id)
);

alter table public.mission_completions enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'mission_completions' and policyname = 'mission_completions_read_own') then
    create policy "mission_completions_read_own" on public.mission_completions for select using (auth.uid() = user_id);
  end if;
end $$;

-- Seeded here rather than left to the application, so the backfill below does
-- not depend on the deploy having happened first. The application upserts the
-- same three rows on conflict (slug), which updates the title and leaves the id
-- alone - so a Completion written now keeps pointing at the same Mission.
-- The order of the three is curriculum, not data: no query sorts by it, so it
-- is not stored. shared/beginnerModule.ts is where the sequence lives.
insert into public.missions (slug, title) values
  ('welcome', 'Make a page say hello'),
  ('voice', 'Give it a human voice'),
  ('action', 'Invite an action')
on conflict (slug) do update set title = excluded.title;

-- Report what cannot be recovered rather than passing over it in silence. Same
-- two buckets as the read-only queries at the top of this file, so a run of the
-- migration carries its own record of the loss, whoever ran it and whenever.
--
-- This raises a warning AND the migration returns the same figures as a result
-- set at the end, because the Supabase SQL Editor does not reliably surface
-- `raise warning` from a do-block. Do not rely on the warning alone.
do $$
declare
  unrecoverable_named bigint;
  unidentifiable_rows bigint;
begin
  select count(*) into unrecoverable_named from (
    select distinct event.user_id, event.metadata ->> 'mission_id' as mission_slug
      from public.activity_events event
     where event.event_type = 'beginner_module'
       and event.metadata ->> 'mission_id' is not null
       and not exists (
         select 1 from public.missions mission
          where mission.slug = event.metadata ->> 'mission_id'
       )
  ) unmatched;
  select count(*) into unidentifiable_rows
    from public.activity_events event
   where event.event_type = 'beginner_module'
     and event.metadata ->> 'mission_id' is null;
  if unrecoverable_named + unidentifiable_rows > 0 then
    raise warning 'UNRECOVERABLE: % Learner/Mission pairs name a Mission not in the catalog, and % feed rows name no Mission at all (counted as rows - they cannot be de-duplicated). None are backfilled. Investigate and accept this before treating the run as complete.', unrecoverable_named, unidentifiable_rows;
  else
    raise notice 'Every Mission completion in the Activity Feed matched a Mission in the catalog.';
  end if;
end $$;

-- Matched on mission_id alone. The old build additionally required
-- metadata ->> 'module' = 'beginner-build'; a row with a valid mission_id but a
-- different module was never counted, so recovering it can only restore
-- evidence, never invent it.
insert into public.mission_completions (user_id, mission_id, completed_at)
select event.user_id, mission.id, min(event.created_at)
  from public.activity_events event
  join public.missions mission on mission.slug = event.metadata ->> 'mission_id'
 where event.event_type = 'beginner_module'
 group by event.user_id, mission.id
-- The date a Learner first cleared the Mission is the Completion. Do nothing on
-- conflict so a re-run, or a Completion written by the deployed application,
-- cannot be overwritten by a later feed row.
on conflict (user_id, mission_id) do nothing;

commit;

-- The report as a result set, because a `raise warning` inside a do-block can go
-- unseen in the Supabase SQL Editor and this is the only self-recording account
-- of an irreversible loss. Read it. Both numbers should be 0; if either is not,
-- that is the count the ticket requires be accepted before this run counts as
-- complete.
select
  (select count(*) from (
     select distinct event.user_id, event.metadata ->> 'mission_id' as mission_slug
       from public.activity_events event
      where event.event_type = 'beginner_module'
        and event.metadata ->> 'mission_id' is not null
        and not exists (select 1 from public.missions mission where mission.slug = event.metadata ->> 'mission_id')
   ) unmatched) as unrecoverable_named_pairs,
  (select count(*) from public.activity_events
    where event_type = 'beginner_module' and metadata ->> 'mission_id' is null) as unidentifiable_rows;

-- DEPLOY ORDER: run this migration FIRST, then deploy.
--
-- The order matters here, unlike the Project backfill of ticket 06. The
-- deployed application writes to public.mission_completions the moment a Learner
-- clears a Mission, and would fail against a database where the table does not
-- exist yet. Running first is also safe for the build already live: it reads
-- neither table and is unaffected by both.
--
-- AFTER the deploy, re-run the backfill statement above on its own. It is
-- idempotent, and it recovers any Mission a Learner cleared in the window
-- between the migration and the deploy, when only a feed row was written.
--
-- Verification. Every recoverable Mission completion in the feed should now have
-- a Completion record. Expect zero rows - and unlike a pair of totals, this
-- still holds after the post-deploy re-run and after Learners have cleared new
-- Missions, both of which only ever add records:
--   select feed.user_id, feed.mission_id
--     from (
--       select distinct event.user_id, mission.id as mission_id
--         from public.activity_events event
--         join public.missions mission on mission.slug = event.metadata ->> 'mission_id'
--        where event.event_type = 'beginner_module'
--     ) feed
--    where not exists (
--      select 1 from public.mission_completions mc
--       where mc.user_id = feed.user_id and mc.mission_id = feed.mission_id
--    );
--
-- Every Learner who holds Launchpad should still have three Completions:
--   select ua.user_id, count(mc.id) as completions
--     from public.user_awards ua
--     join public.awards a on a.id = ua.award_id
--     left join public.mission_completions mc on mc.user_id = ua.user_id
--    where a.slug = 'launchpad'
--    group by ua.user_id
--   having count(mc.id) < 3;
-- Rows returned here are Learners whose Launchpad evidence is incomplete - the
-- unrecoverable count above, seen from the Learner's side.
--
-- And the constraint that makes double-completion impossible by construction,
-- which no mocked test can prove. Expect a unique-violation error:
--   insert into public.mission_completions (user_id, mission_id)
--   select user_id, mission_id from public.mission_completions limit 1;
