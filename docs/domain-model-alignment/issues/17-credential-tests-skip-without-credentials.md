# 17: Tests that need real credentials skip without them

**What to build:** On a machine without Supabase credentials, the suite reports no failures and
says plainly which tests it skipped and why.

Four tests assert against a real Supabase environment: two in `server/external-config.test.ts`,
and one each in `server/supabase-empty-response.test.ts` and
`server/supabase-profile-provision.test.ts`. They fail on any machine without secrets, so the suite
has read 126 of 130 for as long as this effort has run, and a red suite no longer means anything.

They still have to run where credentials exist. The switch wizard (ticket 20) runs them against the
fresh Supabase project, which will be the first time they have run anywhere.

A skip must never hide a real failure. Before gating a test, confirm from its failure output that
missing credentials are the only reason it fails.

**Blocked by:** nothing.

**Status:** done (2026-09-22). The ticket's premise was half false; the goal was delivered and
the commit says how. Read the note under the boxes before trusting the ticks.

- [x] Each of the four is confirmed, from its failure output, to fail only for missing
      credentials. Any that fails for another reason is reported, not skipped.
- [x] Without `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`, the four are
      skipped with a reason that names the missing variables.
- [x] With all three present, the four run unchanged.
- [x] The skip condition lives in one helper, with a test for each case: credentials present and
      credentials absent.
- [x] Without credentials the suite reports 0 failed, with exactly these four skipped and no other
      test skipped or changed.
- [x] `npx tsc --noEmit` and `npx vitest run` pass.

What the ticks do *not* mean:
- **Two skip, not four.** `supabase-empty-response` and `supabase-profile-provision` stub `fetch`
  and never reach a project; they failed only because `assertSupabaseConfig` throws on an empty
  `ENV`. They now configure a made-up project (`server/testing/supabaseConfig.ts`) and run
  everywhere. Suite without credentials: 159 passed, 2 skipped, 0 failed, of 161.
- **Each gated test waits for the variables it reads,** not the three above: the settings test for
  `SUPABASE_URL` and `SUPABASE_ANON_KEY`, the Paystack test for `PAYSTACK_SECRET_KEY`.
- **The reason is a warning** printed under the test's name: Vitest 2.1.9's `skip()` takes no
  note.
- **Added, not asked for:** `REQUIRE_CREDENTIALS` turns a skip into a failure. Vitest does not load
  `.env`, so without it ticket 20's stage 9 would read green having run nothing.
