-- SpellCode by Aceify: reverse of supabase_award_rename_migration.sql.
--
-- Restores the pre-ticket-04 recognition table names. Run this only alongside
-- reverting the application code, which queries the new names: the running
-- application and the schema must agree, or award reads return 404 and fail.
--
-- Like the forward migration this only renames, so no row is lost either way,
-- and it is unguarded inside a transaction for the same reason: abort loudly
-- rather than half-revert.

begin;

alter policy user_awards_read_own on public.user_awards rename to "user_achievements_read_own";

alter table public.user_awards rename constraint user_awards_user_id_fkey to user_achievements_user_id_fkey;
alter table public.user_awards rename constraint user_awards_award_id_fkey to user_achievements_achievement_id_fkey;
alter table public.user_awards rename constraint user_awards_pkey to user_achievements_pkey;
alter table public.awards rename constraint awards_slug_key to achievements_slug_key;
alter table public.awards rename constraint awards_pkey to achievements_pkey;

alter table public.user_awards rename column award_id to achievement_id;

alter table public.user_awards rename to user_achievements;
alter table public.awards rename to achievements;

commit;

-- Verification: the counts must match what they were before the rollback.
--   select count(*) from public.achievements;
--   select count(*) from public.user_achievements;
