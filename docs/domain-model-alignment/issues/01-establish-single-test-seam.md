# 01: Establish the single test seam

**What to build:** Nothing changes for a Learner. This is the prefactor that makes every ticket
after it verifiable.

The module holding almost all of this feature's logic — the Supabase learning service — currently
has no test coverage, because the tests that exercise the routers above it mock the entire service
out. That mock is why the streak arithmetic, the XP counter and the award snapshot have never been
tested.

Remove the wholesale mock of the learning service. Mock only the Supabase REST helper, the single
choke point through which all Supabase I/O passes, and let the real routers, the real learning
service and the real shared logic execute. Tests then read as: *given these stored rows, when the
Learner does this, then these writes happen and this comes back.*

This is an existing seam, already used by the empty-response tests. No new seam is introduced, and
no production code changes.

**Blocked by:** None (can start immediately).

**Status:** done (afdd6bb)

- [x] The access-procedure tests no longer mock the learning service as a whole.
- [x] Only the Supabase REST helper is mocked; routers, learning service and shared logic all run
      for real.
- [x] Every existing assertion in those tests still passes, with stored rows staged through the
      mocked helper rather than through a stubbed service return value.
- [x] The four Full Access gates are still covered: each open with Full Access and closed without.
- [x] No test asserts on the order of internal calls or on private helpers — only on what a
      Learner would observe.
- [x] No production code is modified by this ticket.
- [x] The full test suite passes.
