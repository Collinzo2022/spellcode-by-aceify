# 20: One wizard walks the whole switch off Manus

**What to build:** A script generated with `/wizard` that walks the operator through moving
SpellCode off Manus, step by step, in the order agreed on 2026-09-22 (handoff.md, "The move off
Manus").

It replaces `rebuild-wizard.sh`, which was written to reset the old Supabase project and is now
wrong in ways that matter:
- its stage 2 depends on the Manus host, which can no longer be reached;
- its stage 3 merges ticket 14 and pushes to main, and the local `ticket/14-replay-path-runnable`
  branch still exists, so that stage would actually run;
- it resets a database the switch no longer resets.

The stages, in order:

1. **Pre-flight.** Tickets 15–19 are on main and pushed. `npx tsc --noEmit`, `npx vitest run` and
   `npx vite build` pass.
2. **Paystack.** Roll the test and live secret keys.
3. **New Supabase project.** Create it. Run the six replay files in order —
   `supabase_schema_draft.sql`, `supabase_auth_profile_bridge_migration.sql`,
   `supabase_daily_admin_payments_migration.sql`, `supabase_project_publishing_migration.sql`,
   `supabase_certificate_issuance_migration.sql`, `supabase_admin_reporting_views.sql` — and
   **none** of the five alignment migrations. Then verify: `missions` has 3 rows, `plans` has no
   `paid_features` column, and the `learner_xp_totals` view and `recompute_learner_xp` function
   exist.
4. **Auth settings.** Site URL is the Vercel origin; the redirect list is `<origin>/auth/confirmed`.
   Templates and SMTP stay at their defaults for now: custom SMTP is a launch item.
5. **Render.** A web service from `Collinzo2022/spellcode-by-aceify`, repo root, build
   `pnpm install && pnpm build`, start `pnpm start`, free instance. Environment:
   `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (the new project's),
   `PAYSTACK_SECRET_KEY` and `PAYSTACK_PUBLIC_KEY` (test mode), `NODE_ENV=production`. Capture the
   `*.onrender.com` address, and confirm from the logs that the service is listening.
6. **Point the web at Render.** `vercel.json`'s destination, plus the host references in
   `README.md` and `docs/production_architecture.md`: the Manus address is dead, the webhook
   address, the fresh project, the Forge features off. The wizard stops here while that change is
   made, committed and pushed, then waits for the Vercel deploy.
7. **Seed and check.** Sign up a test account on the site, confirm the email, sign in and load the
   dashboard. Then `projects` and `awards` both have rows.
8. **Paystack webhook.** Test mode → `<render address>/api/paystack/webhook`.
9. **Local checks.** The credential tests (ticket 17) run against the new project, with its keys in
   `.env`. A genuine failure there is a finding, not noise.
   *Added by ticket 17:* Vitest does not load `.env`; only the server's entry point does. Without
   the keys in its environment each gated test **skips**, and the suite reads green having reached
   nothing. So this stage loads `.env` into the shell (`set -a; . ./.env; set +a`) and runs with
   `REQUIRE_CREDENTIALS=1`, which fails a gated test whose keys are missing instead of skipping it.
   Pass means 0 failed **and** 0 skipped. `server/external-config.test.ts` holds the two gated
   tests; they read `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `PAYSTACK_SECRET_KEY`.
10. **Acceptance.** The dashboard with a real signed-in session (`todo.md:66`), and a full
    test-mode checkout with its webhook. `todo.md:48` stays open: it asks for a real-money
    transaction, which is on the launch checklist.
11. **Pause the old Supabase project.**
12. **Done.** Show the launch checklist and what comes next: tickets 13 and 11, then the two Forge
    follow-ups.

**Blocked by:** nothing to write it. Running it needs 15–19 on main.

**Status:** written (2026-09-23) as `docs/domain-model-alignment/switch-wizard.sh`. Not yet
run: running it is the switch itself.

- [x] Generated with `/wizard`, with the stages above in this order.
- [x] It contains no git commands. Where a step needs a commit or a push, it says what to commit
      and waits.
      *One departure:* the `.env` guard below runs `git check-ignore -q`, a read-only query. The
      box guards against a wizard that changes the repository the way the superseded one did
      (merging ticket 14 and pushing to main); a read cannot. The alternative — grepping
      `.gitignore` — misses negations, nested ignore files and the global ignore file, so it
      would weaken the box above it. Stage 6 prints what to commit and waits; it commits nothing.
- [x] Rolling the Paystack keys and pausing the old project each sit behind an explicit confirm.
- [x] Before writing anything to `.env`, it checks that `.env` is gitignored (it is today,
      `.gitignore:11`) and stops if not.
- [x] Its verification SQL is checked against the object names in the replay files, not written
      from memory. `missions` seeds 3 rows at `supabase_schema_draft.sql:163-167`;
      `learner_xp_totals` is created at `:216` and `recompute_learner_xp` at `:228`; no replay
      file creates `plans.paid_features`, which only the excluded
      `supabase_full_access_single_gate_migration.sql` drops.
- [x] `rebuild-wizard.sh` is renamed `rebuild-wizard.superseded.sh` and made to exit immediately
      with a pointer to the new wizard. It was kept rather than deleted because `.scratch/` was
      gitignored and a deletion could not be undone. **That reason expired with the 2026-09-25 move
      into `docs/`** — history now makes a deletion recoverable, so the superseded file can simply
      go whenever someone wants it gone.
- [x] `bash -n` passes on the new wizard.

**Correction to stage 3:** the ticket says "none of the five alignment migrations"; there are
**six**. The wizard names all six rather than a count, so an operator cannot guess which to skip:
`award_rename`, `mission_completion`, `project_completion_backfill`, `xp_entry_ledger`,
`xp_opening_balance`, `full_access_single_gate`.

**Now committed.** This previously read "Not committed", because `.scratch/` was gitignored
(`.gitignore:123`) and both the wizard and this ticket were untracked by design. **The whole effort
directory moved to `docs/domain-model-alignment/` on 2026-09-25 and is tracked**, so the wizard is
in the repo after all. The wizard skill keeps a wizard ephemeral unless the user wants a repeatable
path in the repo; this one runs once, and it is kept as the record of a switch that has already
happened rather than as a path to re-run. **Do not re-run it** — see handoff.md.
