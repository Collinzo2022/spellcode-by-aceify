-- SpellCode by Aceify: drop the unenforced per-feature column from Plans.
-- Run in Supabase SQL Editor after the existing SpellCode migrations.
--
-- ADR 0001 is the authority: Full Access is a single gate. `plans.paid_features`
-- described a permission set the application never consulted - the entitlement
-- check computed the union of it across a Learner's active Plans and then
-- answered with a boolean. Keeping the column invites a future contributor to
-- gate a feature on it and believe the check is real.
--
-- No Learner loses access. The three Plans sold carry identical arrays and
-- access has never depended on their contents; what is dropped is a value
-- nothing reads.
--
-- NOT idempotent, and deliberately so. The drop is unguarded, so running it on
-- a database that has no such column aborts loudly rather than reporting a
-- success that means nothing.
--
-- A NEW environment built from the committed replay order never creates this
-- column and must NOT run this file.

begin;

alter table public.plans drop column paid_features;

commit;

-- DEPLOY ORDER MATTERS, AND IS THE REVERSE OF THE AWARD RENAME. The old
-- application selects this column on every entitlement check:
--   1. Deploy the application.
--   2. Run this migration.
--
-- Backwards is a real outage for paying Learners, not a cosmetic one. PostgREST
-- answers a select naming an unknown column with 400, and the server-side
-- Supabase helper throws on any non-2xx, so an old build against the new schema
-- fails `getVerifiedEntitlements` outright - every gate closed for everyone who
-- paid, plus a broken plan list on the access page. Deploy first and the window
-- does not exist: the new application never names the column.
--
-- Verification. Before: confirm nothing but the three seeded Plans carries a
-- value, so nothing unexpected is being discarded.
--   select code, paid_features from public.plans order by code;
--
-- After: the column is gone and every Plan still stands.
--   select column_name from information_schema.columns
--    where table_schema = 'public' and table_name = 'plans' order by column_name;
--   select count(*) from public.plans;
--
-- And confirm access itself is untouched, since that is what a Learner feels:
--   select count(*) from public.subscriptions where status = 'active';
