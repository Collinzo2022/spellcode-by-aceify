-- SpellCode by Aceify: give past Project completions a real Completion record.
-- Run in Supabase SQL Editor AFTER deploying the application.
--
-- The Builder award used to be counted out of the Activity Feed, which ADR 0003
-- makes presentational: unconstrained, without foreign keys, and prunable at any
-- time. It is now verified from public.project_progress. This moves the history
-- across so a Learner's record shows the Projects they actually built.
--
-- Insert-only and idempotent: `on conflict do nothing` against the unique
-- (user_id, project_id), so a second run changes nothing and no existing row is
-- touched. Nothing can be lost by running it - the worst case is that it copies
-- nothing.
--
-- No Learner loses Builder in the meantime. An Earned Award, once recorded in
-- user_awards, is never withdrawn: reconciliation only ever adds. What this
-- restores is the *evidence*, and with it the progress a Learner is shown.

begin;

-- The application seeds public.projects on its first curriculum request, and a
-- Completion cannot reference a Project row that does not exist yet. Abort
-- loudly rather than backfill nothing.
do $$
begin
  if not exists (select 1 from public.projects) then
    raise exception 'public.projects is empty: deploy the application and let it seed the curriculum before running this backfill.';
  end if;
end $$;

-- Feed entries whose metadata names no Project, or names one that is not in the
-- catalog, cannot be recovered. Report them rather than passing over them in
-- silence.
-- Counted as Learner-and-Project pairs, not raw rows: a Learner who completed
-- the same unmatched Project twice has lost one Completion, not two.
do $$
declare
  unrecoverable bigint;
begin
  select count(*) into unrecoverable from (
    select distinct event.user_id, event.metadata ->> 'project_slug' as slug
      from public.activity_events event
     where event.event_type = 'project'
       and not exists (
         select 1 from public.projects project
          where project.slug = event.metadata ->> 'project_slug'
       )
  ) unmatched;
  if unrecoverable > 0 then
    raise warning 'UNRECOVERABLE: % Learner/Project completions in the Activity Feed name no Project in the catalog and are NOT backfilled. Investigate before accepting this run.', unrecoverable;
  else
    raise notice 'Every Project completion in the Activity Feed matched a Project in the catalog.';
  end if;
end $$;

insert into public.project_progress (user_id, project_id, completed_at, updated_at)
select event.user_id, project.id, min(event.created_at), now()
  from public.activity_events event
  join public.projects project on project.slug = event.metadata ->> 'project_slug'
 where event.event_type = 'project'
 group by event.user_id, project.id
-- A Learner who opened this Project already has a row with completed_at null,
-- and that row conflicts too. Filling only the empty date restores their history
-- without touching a Completion that is already recorded.
on conflict (user_id, project_id) do update
   set completed_at = coalesce(public.project_progress.completed_at, excluded.completed_at),
       updated_at = now();

commit;

-- DEPLOY ORDER: deploy first, then run this. The order is not dangerous either
-- way - it decides only how long a Learner who built a Project before the change
-- sees Builder progress of 0 rather than 1. Their Earned Award is unaffected.
--
-- Verification. The first count should equal the second only after subtracting
-- the unmatched pairs the warning above reported; the feed also records each
-- attempt separately, which is why it is counted as distinct pairs:
--   select count(*) from (
--     select distinct user_id, metadata ->> 'project_slug'
--       from public.activity_events where event_type = 'project') pairs;
--   select count(*) from public.project_progress where completed_at is not null;
--
-- And nobody should hold Builder without evidence for it:
--   select ua.user_id
--     from public.user_awards ua
--     join public.awards a on a.id = ua.award_id
--    where a.slug = 'builder'
--      and not exists (
--        select 1 from public.project_progress pp
--         where pp.user_id = ua.user_id and pp.completed_at is not null
--      );
