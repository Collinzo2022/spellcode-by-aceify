-- SpellCode by Aceify: administrator reporting views.
-- Run this in Supabase SQL Editor after the daily/admin/payment migration.

create or replace view public.admin_learner_billing_summary
with (security_invoker = true)
as
select
  profile.id as user_id,
  profile.display_name,
  profile.xp,
  subscription.status as subscription_status,
  subscription.current_period_end,
  subscription.installments_paid,
  subscription.installments_due,
  subscription.last_payment_at,
  plan.code as plan_code,
  plan.name as plan_name,
  payment.status as latest_payment_status,
  payment.amount_minor as latest_payment_amount_minor,
  payment.currency as latest_payment_currency,
  payment.created_at as latest_payment_created_at
from public.profiles profile
left join lateral (
  select * from public.subscriptions subscription
  where subscription.user_id = profile.id
  order by subscription.updated_at desc
  limit 1
) subscription on true
left join public.plans plan on plan.id = subscription.plan_id
left join lateral (
  select * from public.payment_transactions payment
  where payment.user_id = profile.id
  order by payment.created_at desc
  limit 1
) payment on true;

create or replace view public.admin_plan_performance_summary
with (security_invoker = true)
as
select
  plan.id as plan_id,
  plan.code as plan_code,
  plan.name as plan_name,
  plan.currency,
  plan.amount_minor,
  plan.interval,
  plan.max_installments,
  plan.is_active,
  count(distinct subscription.id) as subscription_count,
  count(payment.id) filter (where payment.status = 'success') as successful_payment_count,
  coalesce(sum(payment.amount_minor) filter (where payment.status = 'success'), 0) as successful_payment_volume_minor,
  count(payment.id) filter (where payment.status in ('failed', 'abandoned')) as unsuccessful_payment_count
from public.plans plan
left join public.subscriptions subscription on subscription.plan_id = plan.id
left join public.payment_transactions payment on payment.plan_id = plan.id
group by plan.id, plan.code, plan.name, plan.currency, plan.amount_minor, plan.interval, plan.max_installments, plan.is_active;

grant select on public.admin_learner_billing_summary to authenticated;
grant select on public.admin_plan_performance_summary to authenticated;
