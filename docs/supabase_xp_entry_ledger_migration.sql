-- SpellCode by Aceify: make XP a ledger.
-- Run in Supabase SQL Editor BEFORE deploying the application. See DEPLOY ORDER.
--
-- XP was a counter mutated in place on profiles.xp by a read-modify-write, from
-- three independent write paths. Two completions landing together lost one
-- award, and nothing recorded why a total was what it was - so Steady Hand
-- ("Earn 200 XP") was granted from a number the system could not defend, inside
-- a catalog whose whole premise is verified evidence. See ADR 0002.
--
-- This creates the XP Entry table. It does NOT backfill existing totals: that is
-- ticket 09, and it is the one genuinely irreversible step in the effort, so it
-- ships on its own. Until it runs, profiles.xp remains the Learner's visible
-- total and the ledger holds only XP earned from this deploy onward. Do not sum
-- the ledger and write it to profiles.xp before ticket 09 has run - every
-- Learner's pre-ledger XP would be erased.

begin;

create table if not exists public.xp_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  -- Zero is allowed, not because an earned award is ever zero, but because ticket
  -- 09 must write an opening-balance entry for EVERY existing Learner and some
  -- have no XP yet. Forbidding it here would force a schema change on a table
  -- that is by then append-only and in use. What the constraint exists to
  -- enforce is that XP never decreases (CONTEXT.md), and >= 0 still does that.
  amount integer not null check (amount >= 0),
  -- 'opening_balance' is reserved for ticket 09's backfill of pre-ledger totals,
  -- which have no Completion to name. Allowed by the constraint now so that
  -- ticket 09 needs no schema change on a table that is by then append-only and
  -- in use.
  source_kind text not null check (source_kind in ('lesson', 'challenge', 'daily_task', 'project', 'mission', 'opening_balance')),
  -- The id of the unit of learning completed. Together with user_id it
  -- identifies one Learner's Completion of one unit exactly, because every
  -- Completion table is itself unique per Learner per unit. No foreign key: the
  -- column points into five different tables by design, which is the price of
  -- one ledger rather than five columns scattered across them (ADR 0002).
  source_id uuid not null,
  created_at timestamptz not null default now(),
  unique(user_id, source_kind, source_id)
);

create index if not exists xp_entries_user_id_idx on public.xp_entries(user_id);

alter table public.xp_entries enable row level security;

-- Read-own only, and no write policy at all. Entries are written by the server
-- with the service role; a Learner must never be able to insert their own XP.
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'xp_entries' and policyname = 'xp_entries_read_own') then
    create policy "xp_entries_read_own" on public.xp_entries for select using (auth.uid() = user_id);
  end if;
end $$;

commit;

-- DEPLOY ORDER: run this migration FIRST, then deploy.
--
-- The new build appends an entry on every XP award and would error against a
-- database without the table. The live build neither reads nor writes it, so
-- running first is safe for it and there is no window in which XP is lost.
--
-- Rolling back: see supabase_xp_entry_ledger_rollback.sql. Nothing needs
-- reversing, and the table must not be dropped while ticket 09 is unshipped.
--
-- Verification. Nothing should ever update or delete an entry, so every row's
-- id should still be the one it was created with and no row should be missing.
-- The ledger cannot prove that about itself; what it can show is that no
-- Learner has two entries for the same Completion, which is the constraint
-- doing its job. Expect zero rows:
--   select user_id, source_kind, source_id, count(*)
--     from public.xp_entries
--    group by user_id, source_kind, source_id
--   having count(*) > 1;
--
-- The constraint rejecting a duplicate, which no mocked test can prove. Run the
-- whole block: the first insert succeeds, the second must fail with a unique
-- violation, and the rollback leaves the ledger exactly as it was.
--
-- Rolled back rather than deleted afterwards, deliberately. This table is
-- append-only; a documented `delete` against it - even to tidy up a probe -
-- is an instruction someone will copy to a row that matters.
--
--   begin;
--     insert into public.xp_entries (user_id, amount, source_kind, source_id)
--     select id, 1, 'lesson', id from public.profiles limit 1;
--     -- expect: ERROR duplicate key value violates unique constraint
--     insert into public.xp_entries (user_id, amount, source_kind, source_id)
--     select id, 1, 'lesson', id from public.profiles limit 1;
--   rollback;
--
-- Divergence between profiles.xp and the ledger is EXPECTED until ticket 09
-- backfills opening balances - every Learner with pre-ledger XP will show a
-- cached total larger than their entries sum.
--
-- A second, smaller source of divergence survives this ticket by design: the
-- application still increments profiles.xp with a read-modify-write, so two
-- awards landing together can lose one increment. The ENTRIES are correct in
-- that case - both are written, because the ledger insert does not read first -
-- so a cached total that has fallen behind is recoverable by recomputing it.
-- That recomputation is ticket 09. Do not attempt it before the opening-balance
-- backfill has run.
--
-- This query is for after ticket 09:
--   select p.id, p.xp as cached, coalesce(sum(e.amount), 0) as ledger
--     from public.profiles p
--     left join public.xp_entries e on e.user_id = p.id
--    group by p.id, p.xp
--   having p.xp <> coalesce(sum(e.amount), 0);
