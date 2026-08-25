-- SpellCode by Aceify: make the XP ledger the truth and profiles.xp its cache.
-- Run in Supabase SQL Editor BEFORE deploying the application. See DEPLOY ORDER.
--
-- ############################################################################
-- ##  THIS IS THE ONE IRREVERSIBLE STEP IN THE DOMAIN-MODEL-ALIGNMENT WORK.  ##
-- ############################################################################
--
-- Every other migration in this effort can be rolled back or simply ignored by
-- the previous build. This one cannot be undone in the sense that matters:
-- pre-ledger XP has no provenance. Once a Learner's total is decomposed into an
-- opening balance, there is no record anywhere of what that balance was made
-- of, because there never was one. Deleting the opening balances afterwards
-- does not restore anything - it destroys the only account of that XP.
--
-- REHEARSE THIS AGAINST A COPY OF PRODUCTION DATA FIRST. The ticket requires it
-- and so does the shape of the change: the numbers below come out of live rows,
-- and the verification at the bottom only means something on real data. A
-- rehearsal is a restore of a production snapshot into a scratch project, this
-- script, and then the verification block.
--
-- ============================================================================
-- WHY THE OBVIOUS VERSION IS WRONG
-- ============================================================================
-- The instinctive backfill is: opening balance = profiles.xp. That is correct
-- only if no Learner has earned XP since the ticket-08 deploy - and by the time
-- this runs, some will have. Their earned entries are already in the ledger, so
-- an opening balance of their whole current total would COUNT THAT XP TWICE and
-- silently inflate them.
--
-- The opening balance is therefore the part of the total the ledger cannot
-- already account for:
--
--     opening balance = profiles.xp - (sum of that Learner's existing entries)
--
-- Floored at zero, because that subtraction can go negative. Ticket 08 left the
-- cache incremented by a read-modify-write, so two awards landing together
-- could lose one increment: the ENTRIES are right and the cached total fell
-- behind. For those Learners the ledger already exceeds the cache, no opening
-- balance is owed, and the recompute below raises their visible total to the XP
-- they actually earned. That is the only way a Learner's number moves here, and
-- it moves UP. Nobody loses XP in this migration.
--
-- Read the inspection queries in the next block before running anything.

-- ============================================================================
-- RUN THESE FIRST, ON THEIR OWN. READ THE ANSWERS.
-- ============================================================================
-- Read-only. How many Learners are involved, and how much unattributed XP is
-- about to be given an opening balance:
--
--   select count(*) as learners,
--          count(*) filter (where opening > 0) as learners_with_opening_balance,
--          coalesce(sum(opening), 0) as total_opening_xp,
--          count(*) filter (where ledger > cached) as learners_whose_cache_fell_behind,
--          coalesce(sum(ledger - cached) filter (where ledger > cached), 0) as xp_to_be_restored
--     from (
--       select p.id,
--              p.xp as cached,
--              coalesce((select sum(e.amount) from public.xp_entries e where e.user_id = p.id), 0) as ledger,
--              greatest(p.xp - coalesce((select sum(e.amount) from public.xp_entries e where e.user_id = p.id), 0), 0) as opening
--         from public.profiles p
--     ) balances;
--
-- `learners_whose_cache_fell_behind` should be small or zero. If it is large,
-- STOP: it means the ticket-08 race was firing far more often than expected and
-- that is worth understanding before this migration freezes the numbers.
--
-- And the Learners who would be most affected, so the change can be judged
-- rather than totalled:
--
--   select p.id, p.xp as cached,
--          coalesce((select sum(e.amount) from public.xp_entries e where e.user_id = p.id), 0) as ledger
--     from public.profiles p
--    order by abs(p.xp - coalesce((select sum(e.amount) from public.xp_entries e where e.user_id = p.id), 0)) desc
--    limit 25;
-- ============================================================================

begin;

-- The ledger summed per Learner. Every read of a Learner's XP total goes
-- through this, rather than the application summing rows: the ledger grows
-- without bound and PostgREST caps returned rows, so an application-side sum
-- would go quietly wrong for exactly the Learners who have earned the most.
--
-- security_invoker makes the view obey the caller's row-level security instead
-- of the definer's, so it cannot become a way to read another Learner's total.
-- Requires Postgres 15 or later; Supabase is well past it. If this line errors,
-- the environment is too old and the view must instead be revoked from `anon`
-- and `authenticated` - do not simply drop the clause.
create or replace view public.learner_xp_totals
  with (security_invoker = on) as
select user_id, coalesce(sum(amount), 0)::integer as xp
  from public.xp_entries
 group by user_id;

-- Recompute one Learner's cached total from their ledger, atomically.
--
-- This exists because the application cannot do it safely. Reading the sum and
-- then writing it back is still a read-modify-write, however absolute the value
-- written: two awards landing together can both read, then both write, and the
-- later write can carry the earlier sum. A single UPDATE whose new value is a
-- subquery has no such window - it takes the row lock for the whole statement,
-- so concurrent callers serialise and each recomputes from the ledger as it
-- stands when its turn comes.
--
-- security definer so the server can call it with the service role and no
-- Learner can invoke it against another Learner's row; search_path is pinned
-- because a definer function that resolves names through the caller's path is
-- a well-known way to hand someone else's privileges away.
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

-- One opening balance per Learner, for the part of their total the ledger
-- cannot already account for. `source_id` is the Learner's own id, which the
-- unique constraint on (user_id, source_kind, source_id) turns into "exactly
-- one opening balance per Learner" without a second constraint.
--
-- Written for EVERY Learner, including those owed zero. An opening balance of 0
-- is a real statement - "the ledger accounts for all of this Learner's XP" -
-- and having a row for everyone means a missing row is a fault rather than an
-- ambiguity. This is why ticket 08 allowed amount >= 0 rather than > 0.
--
-- do nothing on conflict, so a second run changes not one row.
-- Read through the view, which is the one way a Learner's total is summed -
-- here and in the application both. At this point it holds only earned entries,
-- because the opening balances are what this statement is about to write.
insert into public.xp_entries (user_id, amount, source_kind, source_id)
select p.id,
       greatest(p.xp - coalesce((select t.xp from public.learner_xp_totals t where t.user_id = p.id), 0), 0),
       'opening_balance',
       p.id
  from public.profiles p
on conflict (user_id, source_kind, source_id) do nothing;

-- The cache, rewritten from the ledger - which now includes the opening
-- balances above. For almost every Learner this writes back the number they
-- already had, by construction. It moves only for a Learner whose cached total
-- had fallen behind their entries, and then upward.
update public.profiles p
   set xp = coalesce((select t.xp from public.learner_xp_totals t where t.user_id = p.id), 0),
       updated_at = now()
 where p.xp is distinct from coalesce((select t.xp from public.learner_xp_totals t where t.user_id = p.id), 0);

commit;

-- The state of every Learner after the run, as a result set rather than a
-- warning: the Supabase SQL Editor does not reliably surface `raise` output
-- from a do-block. Both counts must be zero.
select
  (select count(*) from public.profiles p
    where p.xp is distinct from coalesce((select t.xp from public.learner_xp_totals t where t.user_id = p.id), 0)
  ) as learners_whose_total_disagrees_with_their_ledger,
  (select count(*) from public.profiles p
    where not exists (select 1 from public.xp_entries e where e.user_id = p.id and e.source_kind = 'opening_balance')
  ) as learners_without_an_opening_balance;

-- DEPLOY ORDER: run this migration FIRST, then deploy.
--
-- The new build reads public.learner_xp_totals for every XP total and every
-- Steady Hand check, and would error against a database without the view. The
-- live build reads profiles.xp, which this migration leaves correct - so
-- between the migration and the deploy a Learner sees the right number from the
-- old build, and the right number from the new one afterwards.
--
-- ONE HAZARD IN THAT WINDOW, and it is small but real. The live ticket-08 build
-- still increments profiles.xp with a read-modify-write. An award whose read
-- happens before this migration commits and whose write lands after it can
-- carry a pre-migration total and revert the correction - for the floor-case
-- Learners whose total this migration raised, that silently puts them back
-- where they were. This migration does not lock profiles against that, because
-- locking every profile row for the length of the run is worse than the thing
-- it prevents.
--
-- It is self-healing rather than permanent: once the new build is deployed,
-- every award recomputes the total from the ledger through
-- recompute_learner_xp, so the next thing that Learner completes puts the
-- number right. To close it immediately instead, either run the migration when
-- traffic is quiet, or re-run the verification block after the deploy and
-- correct anyone it lists.
--
-- Verification, beyond the two counts above. No Learner should have more than
-- one opening balance - the unique constraint guarantees it, so expect zero
-- rows and treat any result as a corrupted constraint:
--   select user_id, count(*) from public.xp_entries
--    where source_kind = 'opening_balance' group by user_id having count(*) > 1;
--
-- Opening balances are distinguishable from earned XP by source_kind alone,
-- which is what makes "where did my XP come from" answerable:
--   select source_kind, count(*), sum(amount) from public.xp_entries group by source_kind;
--
-- And Steady Hand should now be defensible for everyone holding it - expect
-- zero rows:
--   select ua.user_id
--     from public.user_awards ua
--     join public.awards a on a.id = ua.award_id
--    where a.slug = 'steady-hand'
--      and coalesce((select sum(e.amount) from public.xp_entries e where e.user_id = ua.user_id), 0) < 200;
-- A row here is a Learner who holds Steady Hand without 200 XP of evidence.
-- They keep the award - an Earned Award is never withdrawn - but it means their
-- pre-ledger total was inflated relative to what the ledger can show, and that
-- is worth knowing.
