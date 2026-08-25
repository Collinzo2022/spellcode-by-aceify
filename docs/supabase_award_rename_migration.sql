    -- SpellCode by Aceify: rename the recognition tables to the domain vocabulary.
    -- Run in Supabase SQL Editor after the existing SpellCode migrations.
    --
    -- CONTEXT.md is the authority for these names: an **Award** is the definition,
    -- an **Earned Award** is the record that a Learner satisfied it. "Achievement"
    -- is retired. The code was renamed in ticket 03; this brings storage into line.
    --
    -- Renaming preserves every row, index, constraint and foreign key: the objects
    -- are bound by OID, so nothing is copied and no Earned Award is lost. Their
    -- *names* are not updated automatically, which is why each is renamed below.
    --
    -- NOT idempotent, and deliberately so. Every statement is unguarded, so a
    -- second run - or a database whose objects were created by some path other
    -- than supabase_schema_draft.sql - aborts loudly rather than half-renaming.
    -- The surrounding transaction makes that abort harmless: all or nothing.
    --
    -- A NEW environment built from supabase_schema_draft.sql already has these
    -- names and must NOT run this file.

    begin;

    alter table public.achievements rename to awards;
    alter table public.user_achievements rename to user_awards;

    alter table public.user_awards rename column achievement_id to award_id;

    -- Constraints and their backing indexes keep their generated names through a
    -- table rename. Rename them through the constraint, never through the index,
    -- so pg_constraint.conname and the index name cannot drift apart.
    alter table public.awards rename constraint achievements_pkey to awards_pkey;
    alter table public.awards rename constraint achievements_slug_key to awards_slug_key;
    alter table public.user_awards rename constraint user_achievements_pkey to user_awards_pkey;
    alter table public.user_awards rename constraint user_achievements_achievement_id_fkey to user_awards_award_id_fkey;
    alter table public.user_awards rename constraint user_achievements_user_id_fkey to user_awards_user_id_fkey;

    -- Row level security policies survive the table rename but keep their old names.
    alter policy "user_achievements_read_own" on public.user_awards rename to user_awards_read_own;

    commit;

    -- DEPLOY ORDER MATTERS. The application queries the new names:
    --   1. Run this migration.
    --   2. Deploy the application.
    --
    -- Get it backwards and the damage is loud, not silent. supabaseAdminRequest
    -- throws on any non-2xx, and PostgREST answers an unknown table with 404, so
    -- a build pointed at the wrong schema fails its award reads outright - the
    -- dashboard errors rather than quietly reporting zero Earned Awards. Nobody
    -- loses recognition either way; the window is an outage, so keep it short.

    -- Verification. Run the counts before, then after; both must match.
    --   select count(*) from public.awards;        -- was: select count(*) from public.achievements;
    --   select count(*) from public.user_awards;   -- was: select count(*) from public.user_achievements;
    --
    -- Confirm no Learner lost recognition:
    --   select user_id, count(*) from public.user_awards group by user_id order by user_id;
    --
    -- Confirm the names actually moved, since a silent no-op is the failure this
    -- migration is written to avoid:
    --   select conname from pg_constraint
    --    where conrelid in ('public.awards'::regclass, 'public.user_awards'::regclass)
    --    order by conname;
    --   select policyname from pg_policies where tablename = 'user_awards';
