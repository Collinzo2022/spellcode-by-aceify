# 02: ship "hide inactive plans"

**Type:** task (AFK, with the operator's go-ahead to push)
**Status:** open
**Blocked by:** none

## Question

Is `billing.accessOptions` returning only active plans in production?

The change is written and green on branch `fix/hide-inactive-plans`, but not yet committed: `server/routers/billing.ts` (filter `&is_active=eq.true`) plus `server/access-options.test.ts` (2 tests; the first failed before the fix). Full suite was 289 passed and 2 skipped, and `tsc` was clean (2026-11-12).

Done when: committed alone (no map files in the commit), fast-forwarded to `main` with the operator's go-ahead, `/api/version` shows the commit, and `GET /api/trpc/billing.accessOptions` returns only `full-access-one-time`. Glance at the Access page with a single card.
