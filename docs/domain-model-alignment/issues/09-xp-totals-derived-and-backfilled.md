# 09: XP totals derived and backfilled

**What to build:** A Learner's XP total becomes the sum of their XP Entries — recomputable,
auditable, and restorable if it ever drifts.

With entries being written, the stored total is still the authority and still unexplained. This
ticket inverts that: the ledger becomes the truth and the stored total becomes a cache of it.

Existing totals are the problem. They have no provenance and cannot be decomposed into entries
after the fact. Synthesise a single opening-balance entry per Learner from their current total,
marked plainly as an opening balance, so that no Learner loses XP and every ledger sums correctly
from day one.

**This is the one genuinely irreversible step in the whole effort.** Everything else can be rolled
back; pre-ledger XP has no provenance to recover once this runs. Isolated in its own ticket for
exactly that reason.

**Blocked by:** 08 (XP Entry ledger).

**Status:** implemented in code; **the migration must not ship until it is rehearsed.**

- [x] Every existing Learner has an opening-balance XP Entry matching their total at migration
      time — **but not the total this line implies.** See the correction below: the entry covers
      the part of their total the ledger cannot already account for. Written for every Learner,
      including those owed zero, so a missing row is a fault rather than an ambiguity.
- [x] Opening-balance entries are distinguishable from earned entries, by `source_kind` alone.
- [x] No Learner's visible XP total changes as a result of the backfill — with one disclosed
      exception, in the Learner's favour. A Learner whose cached total had fallen behind their
      entries through the ticket-08 race has it raised to the XP they actually earned. Nobody's
      total goes down.
- [x] A Learner's total equals the sum of their XP Entries, for every Learner. Asserted as a
      result set at the end of the migration; both counts must be zero.
- [x] The stored total is treated as a cache and can be recomputed from entries on demand.
- [x] Divergence between the cached total and the sum of entries is detectable —
      `reconcileXpTotal` in the application, and a query in the migration.
- [x] A diverged total can be corrected by recomputing it, without inventing a number. The
      correction is the ledger's own sum; no adjustment is computed and nothing is guessed.
- [x] The Steady Hand award is granted from the verified total.
- [ ] The migration has been rehearsed against a copy of production data before it ships.
      **NOT DONE — no database credentials in this environment, and this is the irreversible
      step.** Rehearsal means restoring a production snapshot into a scratch project, running
      the migration, and running the verification block. The read-only inspection queries at
      the top of the file must be run and their answers read first. **Do not ship without this.**
- [x] The full test suite passes — 125 of 129. The 4 failures are the pre-existing
      credential-bound ones, unchanged by this ticket.

**The ticket's instruction is unsafe as literally written, and was not followed literally.**
It says to synthesise the opening balance "from their current total". By the time this migration
runs, ticket 08 has been deployed for some time and Learners have earned entries. An opening
balance equal to a Learner's whole current total would count that earned XP twice — once in
their entries, once inside the opening balance — and silently inflate them. The opening balance
is `greatest(profiles.xp - sum(existing entries), 0)`: the part of the total the ledger cannot
already account for. The floor matters too, because the ticket-08 race means the subtraction can
go negative.

**Beyond the ticket, and worth knowing:** the ticket-08 read-modify-write race on the cached
total is now gone. The cache is written from the ledger's own sum rather than incremented, so
there is no window in which an increment can be lost. That was not asked for; it fell out of
"the stored total is a cache of the ledger" being taken seriously.
