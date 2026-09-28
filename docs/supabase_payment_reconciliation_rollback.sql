-- Rollback for supabase_payment_reconciliation_migration.sql (ticket 35).
--
-- Drops `reconciliation_error`. Only the reconciliation sweep reads or writes this column,
-- so against the current build the cost of running this is that the sweep fails: it selects
-- the column when gathering candidates, and PostgREST rejects a request naming a column that
-- does not exist. The webhook and the browser return leg do not name it and keep working, so
-- a Learner paying during the window still gets what they paid for.
--
-- **Still roll the application back first, or at least stop calling the endpoint.** A sweep
-- erroring every ten minutes is a failing workflow nobody reads after the second day, and the
-- whole point of the sweep is to be the thing that is watching.
--
-- Dropping the column discards the queue of payments flagged for a human. Read it before
-- running this, because nothing else records which payments needed attention:
--
--   select id, user_id, paystack_reference, status, reconciliation_error
--     from public.payment_transactions
--    where reconciliation_error is not null
--    order by updated_at desc;
--
-- The flags themselves are recoverable in the sense that the next sweep after a re-run of
-- the migration re-derives them: each one is a conclusion about a payment's state at
-- Paystack, not a fact that only existed locally. Nothing a Learner earned is at stake.

begin;

alter table public.payment_transactions
  drop column if exists reconciliation_error;

commit;

-- Verify, after committing:
--   select column_name from information_schema.columns
--    where table_schema = 'public' and table_name = 'payment_transactions'
--      and column_name = 'reconciliation_error';
--
-- Expect no rows.
