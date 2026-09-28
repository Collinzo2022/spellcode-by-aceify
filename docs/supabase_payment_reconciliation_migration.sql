-- SpellCode by Aceify: record, on the payment itself, a reconciliation that needs a human.
-- Run in Supabase SQL Editor BEFORE deploying the application. See DEPLOY ORDER.
--
-- Ticket 35 adds a sweep that resolves payments Paystack accepted but the application
-- never heard about. Three of its four outcomes must not grant anything and must not be
-- lost: a success whose amount or currency does not match what was asked for, a reference
-- Paystack does not recognise at all, and a run that could not reach Paystack.
--
-- There is no alerting in this project, and the host keeps logs briefly and loses them on
-- restart. That is the same invisibility that let a paid ₦120,000 sit unrecorded for seven
-- hours on 2026-09-25, found by accident (tickets 28 and 30). A log line is therefore not
-- enough: the failure is written onto the payment row, where a restart cannot take it, and
-- one query over this column finds every payment a human has to look at.
--
-- It follows `paystack_webhook_events.processing_error`, which already does exactly this
-- for webhook delivery: a nullable text column, written truncated, and written in a way
-- that a failure to record the failure cannot fail the run.
--
-- NO BACKFILL, and none is wanted. Null means "nothing is wrong with this payment", which
-- is the honest answer for every row predating the sweep: no run has examined them. The
-- application clears the column when a flagged payment is finally settled, so a non-null
-- value always means a payment still needing attention rather than one that once did.
--
-- NO INDEX. Production holds three payment rows. A partial index on the non-null values
-- would be the right answer at a thousand times that and is noise at this size; add it when
-- the table is big enough for a sequential scan to matter, not before.

begin;

alter table public.payment_transactions
  add column if not exists reconciliation_error text;

comment on column public.payment_transactions.reconciliation_error is
  'Why the reconciliation sweep could not resolve this payment, for a human to act on. Null means nothing is wrong, including for a payment no run has examined yet. The sweep clears it once the payment is resolved either way - recorded or written off - so a non-null value always means a payment still needing attention.';

commit;

-- DEPLOY ORDER
--
-- Run this BEFORE deploying the build that contains ticket 35, and it is safe to run early:
-- adding a nullable column changes nothing for the running build.
--
-- **Only the sweep reads or writes this column**, which is deliberate and bounds what an
-- unrun migration costs. An earlier draft had the shared payment write path clear the column
-- on every settlement, which would have meant that deploying before running this file failed
-- the webhook and the browser return leg as well - PostgREST rejects the whole request when a
-- write names a column that does not exist, so a Learner could have paid and received
-- nothing. The clearing moved into the sweep instead, so getting this order wrong costs the
-- sweep alone, and the paths a Learner's money actually travels keep working.
--
-- In practice the order is easy to hold anyway: the sweep cannot run at all until the
-- operator sets SCHEDULED_TASKS_SECRET, and that step comes after this one.
--
-- The same change is folded into `supabase_schema_draft.sql` so a fresh replay produces an
-- identical schema, and that fold is its own commit whose subject names the file, as
-- AGENTS.md requires of every replay-order edit.

-- Verify, after committing:
--   select column_name, data_type, is_nullable
--     from information_schema.columns
--    where table_schema = 'public' and table_name = 'payment_transactions'
--      and column_name = 'reconciliation_error';
--
-- Expect one row: reconciliation_error, text, YES.
--
-- Then, to see the queue this column exists to make visible:
--   select id, paystack_reference, status, reconciliation_error
--     from public.payment_transactions
--    where reconciliation_error is not null
--    order by updated_at desc;
--
-- Expect no rows on a healthy system.
