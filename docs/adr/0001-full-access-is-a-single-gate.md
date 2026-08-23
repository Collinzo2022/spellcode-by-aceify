# 1. Full Access is a single gate, not a set of entitlements

Date: 2026-08-23

## Status

Accepted

## Context

Paid access was modelled twice, in two places that disagreed.

The **data model is granular**. `plans.paid_features` is a `jsonb` array (added in
`supabase_daily_admin_payments_migration.sql`), and `getVerifiedEntitlements` computes the union
of that array across every Plan a Learner holds:

```ts
return { hasFullAccess: plans.length > 0, features: Array.from(new Set(plans.flatMap(plan => plan.paid_features ?? []))) };
```

The **domain logic is all-or-nothing**. `shared/entitlements.ts` accepts a feature argument and
discards it:

```ts
export function canUsePaidFeature(hasFullAccess: boolean, _feature: PaidFeature) {
  return hasFullAccess;
}
```

Every gate in the system — advanced Lessons, Project publishing, the AI tutor, certificates —
consults the boolean alone. No call site has ever read the `features` array.

This is worse than redundant. The array is computed on every entitlement check, serialised into
tRPC responses and the Android payload (`server/mobile.ts`), and looks to any reader like an
enforced permission set. A future contributor could reasonably gate a feature on it and believe
the check was real.

The three Plans currently sold (a one-time NGN 120,000 payment, and monthly installment Plans
capped at three and six charges) grant identical access. They differ only in payment schedule.

## Decision

Full Access is a single boolean gate. A Learner either has it or does not, and everything behind
it unlocks together.

Consequently:

- `plans.paid_features` is dropped from the schema.
- The `PaidFeature` union and `canUsePaidFeature` are removed; call sites check Full Access
  directly.
- The `features` / `entitlements` array is removed from all API and mobile responses.
- "Full Access" names the access gate itself, not a Plan or a bundle.

## Consequences

The permission model becomes honest: one concept, one check, enforced everywhere it appears.
Responses shrink and each entitlement check does less work.

The cost is that selling a narrower tier — a tutor-only subscription, say — requires
reintroducing granularity rather than populating an existing column. That is accepted. The
column existed but was never enforced, so it offered no real head start; a genuine entitlement
model would need enforcement at every gate regardless, which is the actual work. Building it now
for products that do not exist is speculative generality, and it currently masquerades as
security.

If a narrower tier is ever sold, revisit this decision rather than quietly re-adding a features
array: the enforcement, not the storage, is the hard part.

## Alternatives considered

**Make the granular model real** — have `canUsePaidFeature` consult the array and treat "Full
Access" as the name of one bundle among possible others. Rejected: it adds enforcement
complexity at four gates to support product tiers that do not exist and have not been designed.
The decision is cheap to revisit if that changes.
