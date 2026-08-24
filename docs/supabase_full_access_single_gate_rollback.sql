-- SpellCode by Aceify: reverse of supabase_full_access_single_gate_migration.sql.
--
-- Restores `plans.paid_features` and the values the three seeded Plans carried
-- before the drop. The restoration is faithful rather than approximate: all
-- three Plans held the same array, seeded by
-- supabase_daily_admin_payments_migration.sql and never edited by the
-- application, which had no write path to this column.
--
-- Run this only alongside rolling the application back to a build that selects
-- the column. Order is the reverse of the forward migration:
--   1. Run this rollback.
--   2. Roll the application back.
-- A rolled-back build against the dropped column fails every entitlement check
-- with a PostgREST 400, so restore the column first.
--
-- Any Plan added after the drop receives the default empty array. Nothing reads
-- it, so that is harmless - but it is the reason this is a restoration of a
-- dead column, not of a behaviour.
--
-- Rolling the application back also restores the previous
-- supabase_daily_admin_payments_migration.sql, whose seed maintained this
-- column; the SQL files are versioned with the code, so a seed replay after a
-- rollback keeps the column populated again without further action here.

begin;

alter table public.plans
  add column paid_features jsonb not null default '[]'::jsonb;

-- `updated_at` is deliberately left alone. The forward migration never touched
-- it, so touching it here would make this more than a reverse.
update public.plans
   set paid_features = '["all_lessons_past_level_1", "project_publishing", "certificate", "unlimited_ai_tutor"]'::jsonb
 where code in ('full-access-one-time', 'full-access-3-month', 'full-access-6-month');

commit;

-- Verification: the column is back and the three seeded Plans carry their array.
--   select code, paid_features from public.plans order by code;
