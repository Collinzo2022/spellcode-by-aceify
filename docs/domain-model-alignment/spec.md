# Spec: Domain Model Alignment

Status: ready-for-agent
Related: `CONTEXT.md`, ADR 0001 (Full Access is a single gate), ADR 0002 (XP is a ledger),
ADR 0003 (The Activity Feed is presentational)

## Problem Statement

SpellCode tells Learners that their recognition is *verified* — that awards unlock only from
real, saved evidence and are never handed out. For most metrics this is true. For three of them
it is not, and a Learner can see the difference.

A Learner who practises every day by completing Lessons, Missions and Projects still sees a
Streak of **1**, because only Daily Tasks advance a Streak. The Daily Rhythm award tells them to
"reach a 3-day learning streak" without mentioning that only one kind of learning counts. A
Learner who built a 12-day Streak and then stopped for two months still sees **12** on their
dashboard today, because a Streak is only recalculated when they complete something — the number
never lapses on its own, so it is wrong on screen for exactly the disengaged Learners a Streak is
meant to pull back.

A Learner's XP total cannot be proven. It is a counter incremented in place with a
read-modify-write, so two completions landing at once silently lose one award, and nothing
records why the total is what it is. The Steady Hand award ("Earn 200 XP") is granted from that
unauditable number inside a catalog whose entire premise is verified evidence.

Two awards — Builder and Launchpad — are counted out of the Activity Feed, a display-only table
with no constraints and no foreign keys, by filtering an unconstrained text column and reading an
untyped JSON blob. Pruning old feed rows, or renaming one string, silently revokes awards a
Learner has already earned.

Alongside this, the language has drifted. The same concept is called an award, an achievement and
a badge, sometimes within one API response. "Mission" means both a Beginner Build Lab step and,
in the Pathfinder award's own text, a Lesson. An API field named `achievementId` carries a
different value from the database column named `achievement_id` one hop away. Paid access is
modelled twice and the two models disagree: the schema describes per-feature entitlements, and
the code ignores the feature argument and checks a single boolean — so an array that looks like
an enforced permission set is computed, shipped to the web and Android clients, and never
consulted.

## Solution

Make the verified claim true everywhere, and give every concept exactly one name.

A Learner's Streak counts any day on which they completed **any** unit of learning — a Lesson,
Challenge, Daily Task, Project or Mission — and is derived from their last activity each time it
is read, so it lapses on its own the moment a day is missed. The dashboard stops showing a
Streak the Learner no longer has. Days are counted in the Learner's own local time, so a Streak
rolls over at their midnight rather than a server's.

Every XP award is recorded as an XP Entry naming the Completion that caused it. A Learner's XP
total becomes the sum of those entries: recomputable, auditable, and impossible to double-award
or lose to a race. Steady Hand can be defended from records like every other award.

Every unit of learning gets a real Completion record. Awards, XP and Streaks read only from
Completions. The Activity Feed goes back to being what it was always described as — a
human-readable history — and can be pruned freely without touching a Learner's standing.

Paid access becomes the one boolean it always was in practice. Full Access is a single gate;
Plans differ only in how a Learner pays for it.

And the vocabulary settles: Award, Earned Award and Award Mark for the three recognition layers;
five distinct words for the five units of learning; Learner for the person. `CONTEXT.md` is the
authority, and where the code disagrees with it, the code is wrong.

## User Stories

### Streaks

1. As a Learner, I want any completed unit of learning to count toward my Streak, so that a day I
   spent on Lessons is not recorded as a day I did nothing.
2. As a Learner, I want my Streak to advance when I complete a Lesson, so that the curriculum
   feels like part of my daily practice rather than a detour from it.
3. As a Learner, I want my Streak to advance when I clear a Mission in the Beginner Build Lab, so
   that my very first day on the product starts my habit.
4. As a Learner, I want my Streak to advance when I pass a Challenge, so that the hardest work I
   do is not the work that counts least.
5. As a Learner, I want my Streak to advance when I complete a Project, so that a long build
   spread over several days is recognised on each of those days.
6. As a Learner, I want completing several things on the same day to advance my Streak once, so
   that the number means consecutive days and not total completions.
7. As a Learner, I want my Streak to survive if I complete something today and something
   tomorrow, so that consecutive practice is what the number rewards.
8. As a Learner, I want my Streak to show as lapsed as soon as I miss a day, so that the number I
   see is the number I actually have.
9. As a Learner returning after a long absence, I want to see an honest Streak of zero rather
   than my old total, so that I am not misled about where I stand.
10. As a Learner, I want my Longest Streak preserved even after a current Streak lapses, so that
    my best run remains a record of what I achieved.
11. As a Learner, I want the Daily Rhythm award's wording to describe what actually earns it, so
    that I am not chasing a criterion different from the one being measured.
12. As a Learner, I want my Streak to roll over at midnight where I live, so that practising late
    in the evening counts for the day I experienced, not the day a server experienced.
13. As a Learner who travels, I want my Streak evaluated against my current local time, so that
    changing timezone does not cost me a day I actually practised.
14. As a Learner, I want a day to count once regardless of my timezone, so that moving between
    zones cannot award me two days for one day's work.

### XP

15. As a Learner, I want every XP award recorded individually, so that my total is something the
    product can prove rather than assert.
16. As a Learner, I want to see which completions earned me XP, so that I can understand how I
    reached my total.
17. As a Learner, I want two completions finishing at the same moment to award both amounts, so
    that I never silently lose XP I earned.
18. As a Learner, I want repeating a completion I have already finished to award no further XP,
    so that the total reflects real progress and cannot be farmed.
19. As a Learner, I want a replayed or retried request not to double my XP, so that a flaky
    network cannot inflate my record.
20. As a Learner, I want my XP total to be reconstructible from my history, so that if something
    goes wrong my record can be restored rather than guessed.
21. As a Learner, I want the Steady Hand award granted from verified XP, so that it means the
    same thing as every other award.
22. As a Learner, I want XP from Daily Tasks recorded exactly the same way as XP from everything
    else, so that no part of my total is less trustworthy than the rest.
23. As an operator, I want to detect when a Learner's cached XP total has diverged from their
    entries, so that drift is something I can find rather than something I discover from a
    support ticket.
24. As an operator, I want to correct a diverged XP total by recomputing it, so that fixing the
    problem does not mean inventing a number.

### Completions and the Activity Feed

25. As a Learner, I want my Mission completions stored as records in their own right, so that my
    Launchpad award cannot disappear when unrelated history is cleaned up.
26. As a Learner, I want my Project completions read from Project records, so that my Builder
    award rests on the same evidence as everything else.
27. As a Learner, I want my awards unaffected by changes to my Activity Feed, so that what I have
    earned is never at the mercy of what is displayed.
28. As a Learner, I want completing the same Mission twice to count once, so that my progress
    toward Launchpad reflects distinct work.
29. As an operator, I want to prune the Activity Feed without revoking anyone's awards, so that
    the largest table in the system has a retention story.
30. As a developer, I want verification to read from typed Completion records rather than filtered
    strings and untyped JSON, so that a rename cannot silently break an award.
31. As a developer, I want existing Mission and Project completions migrated out of the Activity
    Feed before it is pruned, so that no Learner loses standing in the transition.
32. As an operator, I want to know which historical completions could not be recovered from feed
    metadata, so that affected Learners can be handled deliberately rather than discovered later.

### Paid access

33. As a Learner, I want Full Access to unlock everything behind the gate, so that what I bought
    is what I get.
34. As a Learner on any Plan, I want identical access, so that choosing to pay in installments
    does not quietly buy me less.
35. As a developer, I want a single access check used everywhere, so that there is one place to
    get right and one place to audit.
36. As a developer, I want the unenforced entitlements array removed from responses, so that no
    future contributor gates a feature on a permission that was never enforced.
37. As an Android user, I want the mobile payload to describe access the same way the web does, so
    that the two clients cannot disagree about what I can do.

### Vocabulary

38. As a developer, I want one word per concept across schema, API and interface, so that reading
    any layer teaches me the same language.
39. As a developer, I want "badge" to refer only to the generic interface component, so that a
    domain term and a UI primitive never share a name.
40. As a developer, I want the identifier of an Award definition and the identifier of its
    database row to have different names, so that two different values one hop apart cannot be
    confused.
41. As a developer, I want "Mission" to mean a Beginner Build Lab step and nothing else, so that
    the word is safe to use in learner-facing copy.
42. As a Learner, I want the Pathfinder award's criterion to describe what it measures, so that
    the text and the requirement agree.
43. As a developer, I want the Learner identifier named for what it is, so that nobody goes
    looking for a retired OAuth path that no longer exists.
44. As a developer, I want `CONTEXT.md` to be the authority on terminology, so that disagreements
    are settled by reference rather than by argument.

### Continuity

45. As a Learner, I want my existing XP, Streak and Earned Awards to survive this work, so that
    changes behind the scenes do not cost me progress I made.
46. As a Learner, I want to keep every award I have already earned, so that nothing is revoked by
    a stricter rule applied retroactively.
47. As an operator, I want each schema change to be independently reversible, so that a problem
    with one part does not force rolling back all of it.

## Implementation Decisions

### Vocabulary and renames

- `CONTEXT.md` is the authority for all domain terms. Code that disagrees is wrong.
- **Award / Earned Award / Award Mark** replace the mixed use of award, achievement and badge.
  The recognition definition table and the earned-record table are renamed to match. "Badge"
  keeps no domain meaning and remains only the generic interface component.
- The API field carrying an Award's human-readable identifier is renamed to `awardSlug`. The name
  `award_id` is reserved strictly for the database UUID. These are different values and must never
  again share a name.
- The Learner identifier is renamed from `openId` to `learnerId` throughout our code: request
  context, the Supabase learning service, the mobile handler and all test fixtures. It refers to
  the Supabase UUID; no OAuth identity path remains.
- **The vendored scaffold is excluded from this rename.** The name originates in the framework
  core, where it genuinely is that SDK's own session-token field and part of its contract, and that
  directory is generated template code whose edits would be lost on regeneration. The framework's
  field is mapped to `learnerId` once at the boundary where our code takes over, and `learnerId` is
  used everywhere from that point inward. A reader of our code sees one name; the scaffold keeps
  its own.
- The Pathfinder award's criterion text is corrected to say "lessons", matching what it measures.
- The award-unlocked Activity Feed entry stops calling an Award a badge.

### Streaks

- A Streak is the number of consecutive days, ending today or yesterday, on which a Learner
  completed at least one unit of learning. All five kinds count equally.
- A Streak is **derived on read** from the Learner's last learning date. It is not stored as a
  fact. If the last qualifying day is neither today nor yesterday, the current Streak is zero.
- Longest Streak remains stored: it is a historical high-water mark and cannot be derived from
  current state. It is updated whenever a newly derived Streak exceeds it.
- The existing behaviour of flooring a stored streak at 1 on any XP award is removed rather than
  preserved. It existed to avoid displaying a zero, not to model anything.
- Day boundaries are evaluated in the **Learner's local time**, not in UTC and not in a single
  fixed server timezone. A Streak rolls over at midnight where the Learner is.
- The client supplies its **UTC offset in minutes** on every request that either completes a unit
  of learning or reads a Streak. The offset is part of the API contract for those requests.
- The server never infers the offset from the request's IP address or from stored profile state.
  The value on the request is the value used. A request that omits it is treated as offset zero,
  so that a missing offset degrades to UTC rather than failing the request.
- The offset is applied consistently at both ends of the calculation: the same offset determines
  which local day a Completion is stamped with and which local day counts as "today" when a Streak
  is derived. Stamping in one frame and deriving in another would silently drop days.
- Completions continue to be stored as absolute instants. The offset is applied when deriving the
  local day, never baked into the stored timestamp, so that a Learner's history remains
  interpretable from any frame.
- Because a Learner's local day is a function of a client-supplied value, two adjacent Completions
  reported under different offsets may land on the same local day. A day counts once regardless of
  how many Completions fall in it, so this cannot inflate a Streak — it can only, at a timezone
  boundary, merge what a Learner experienced as two days into one.

**Known limitation, accepted.** A numeric UTC offset is weaker than an IANA zone identifier in two
ways, and both are accepted rather than solved here:

- It is client-supplied and therefore spoofable. A Learner who sends a shifting offset can hold a
  Streak open longer than real elapsed time should allow. The exposure is bounded — the worst case
  is a Streak that should have lapsed, and Streaks gate nothing paid — but it is real, and it means
  a Streak is not "verified" in the same strict sense as XP or an Earned Award, which read only
  from server-held records.
- It does not survive daylight saving transitions. The same Learner's offset changes mid-year in a
  DST region, which can merge or split a day at the transition.

If either becomes a problem, the fix is to send an IANA zone identifier instead of an offset and
resolve the local day server-side. That is a contract change, not a redesign; the derivation stays
a pure function of "a Completion instant plus a way to name the Learner's local day".

### XP (ADR 0002)

- An **XP Entry** table becomes the system of record: one row per XP award, recording the Learner,
  the amount, the kind of source, and the identifier of the single Completion that caused it.
  Append-only.
- A uniqueness constraint on (Learner, source kind, source identifier) makes double-award
  impossible at the database level. This replaces the read-modify-write race rather than patching
  it — a duplicate is rejected by the database, not lost in a window.
- The Learner's stored XP total becomes a derived cache, recomputable at any time by summing that
  Learner's XP Entries.
- There is **one** XP write path. The Daily Task path stops patching the total inline and goes
  through the same path as every other completion.
- Backfill: existing totals have no provenance and cannot be decomposed after the fact. A single
  opening-balance XP Entry per Learner is synthesised from their current total, marked as such, so
  that no Learner loses XP and the ledger sums correctly from day one. This is the one-way part of
  the change.

### Completions and the Activity Feed (ADR 0003)

- Every unit of learning has its own Completion record. Missions gain a dedicated Completion table
  with a foreign key to the Learner and uniqueness per Learner per Mission. Project completion is
  read from the existing Project progress records.
- All verification — Awards, XP Entries, Streaks — reads exclusively from Completion records. No
  count, gate or award may query the Activity Feed.
- The Activity Feed becomes purely presentational: written for display, read only for display,
  prunable at any time.
- Migration ordering is load-bearing: Mission and Project Completions must be backfilled out of
  Activity Feed metadata **before** any pruning occurs. Feed entries lacking a mission identifier
  in their metadata cannot be recovered; the migration reports how many such rows exist rather
  than failing silently, and production data is inspected before the migration is written.

### Paid access (ADR 0001)

- Full Access is a single boolean gate. The per-feature column is dropped from the Plans schema.
- The paid-feature union type and the function that accepted a feature argument and discarded it
  are both removed. Call sites — advanced Lessons, Project publishing, the AI tutor, certificates
  — check Full Access directly.
- The features/entitlements array is removed from all tRPC responses and from the mobile payload.
- "Full Access" names the gate, not a Plan and not a bundle.

### Module shape

- Pure domain arithmetic moves into the shared modules: Streak derivation from a last-activity
  date, XP totalling from entries, and the Completion counting that builds an award snapshot.
  These are pure functions over plain data with no I/O.
- The Supabase learning service keeps orchestration and persistence only. This is what makes the
  single test seam viable: the arithmetic is testable directly, and the service is testable
  through its one I/O choke point.

### Sequencing

Steps must be independently reversible and are ordered by dependency:

1. Pure renames and corrected award text (no schema change, no behaviour change).
2. Recognition table renames (live data; reversible; separate from everything else).
3. Mission Completion table added and backfilled from Activity Feed metadata; verification
   switched to read Completions. Feed pruning not yet enabled.
4. XP Entry table added with its uniqueness constraint; write paths unified; opening balances
   synthesised; stored total becomes a cache.
5. Streak derivation switched to read-time; the floor-at-1 behaviour removed.
6. Per-feature access column dropped and the unenforced array removed from responses.

Step 3 gates step 4: the ledger cannot be backfilled correctly until Completions exist.

## Testing Decisions

### What makes a good test here

A good test states an observable outcome for a Learner and nothing about how it was reached.
*Given these stored rows, when the Learner completes a Mission, then these writes occur and this
Streak comes back.* Tests must not assert on the order of internal calls, the shape of private
helpers, or which module performed a step. Renaming an internal function must never break a test;
changing what a Learner sees always should.

### The single seam

All feature-level tests run through **one seam: the Supabase REST helper**, driven via the tRPC
callers. Only that helper is mocked. The real routers, the real learning service and the real
shared logic all execute.

This is an existing seam, already used by the empty-response tests and partially by the access
procedure tests. No new seam is introduced.

**The wholesale mock of the learning service in the access procedure tests is removed.** That mock
is the reason the module holding almost all of this feature's logic currently has no coverage.
Removing it converts those tests onto the single seam.

### Pure-function tests

Streak derivation, XP totalling and Completion counting are pure functions in the shared modules
and are tested directly there, beside the existing award tests. This is the same seam that already
exists for awards and entitlements, not a new one. It is where day-boundary cases, gaps, timezone
edges and empty histories are covered exhaustively, since staging rows for each is wasteful.

### Coverage expected

- **Streak**: consecutive days, a single gap, a long absence, several completions on one day, each
  of the five unit kinds advancing it, and Longest Streak surviving a lapse.
- **Streak, local time**: a Completion just before local midnight and one just after counting as
  two days; a Learner at a positive offset and one at a negative offset given the same instants
  reaching different Streaks; a missing offset treated as UTC; an offset that changes between two
  Completions; and the boundary case where a westward offset change merges two Completions onto one
  local day. These are pure-function tests — the derivation takes an instant and an offset and
  returns a local day, so every case above is a table of inputs and expected days rather than a
  staged scenario.
- **XP**: one entry per completion, repeat completion awarding nothing, replay awarding nothing,
  concurrent completions both recorded, total equalling the sum of entries, opening balance
  included.
- **Completions**: Missions counted from Completion records, Projects counted from Project
  records, awards unaffected by an emptied Activity Feed, duplicate Mission completion counted
  once.
- **Access**: each of the four gates open with Full Access and closed without it; no features
  array present in any response or in the mobile payload.
- **Renames**: no response carries the retired field names.

### Prior art

The access procedure tests are the closest model for caller-driven tests. The signed webhook tests
are the model for idempotency and replay assertions, which the XP Entry uniqueness tests should
mirror. The award and entitlement tests are the model for pure-function coverage.

### Explicitly not covered by automated tests

Database constraints and migrations cannot be verified through a mocked REST helper. The XP Entry
uniqueness constraint, the Mission Completion uniqueness constraint, and the Activity Feed
backfill require a live Supabase project or acceptance by inspection. **A mocked test will let a
double-write through**, so the constraint that ADR 0002 relies on to remove the XP race is exactly
the thing the test suite cannot prove. This is accepted and must be checked by hand before each
schema step ships.

## Out of Scope

- Any new Award, Plan, unit of learning or learner-facing feature. This work changes how existing
  things are named, recorded and verified; it adds nothing to the product.
- Granular or tiered paid access. ADR 0001 settles this as a single gate; revisit that decision
  before building tiers.
- Event sourcing. ADR 0003 considered and rejected turning the Activity Feed into a real event log.
- An XP history interface. The ledger makes it possible; building the view is separate work.
- Streak recovery, freezes or grace periods. A Streak lapses when a day is missed; softening that
  is a product decision not taken here.
- Visual redesign of the dashboard or profile. Copy changes required by the renames are in scope;
  layout is not.
- The outstanding live Paystack transaction and webhook acceptance test, which is unrelated
  operational work.
- Retention policy for the Activity Feed. This work makes pruning *safe*; choosing when to prune is
  a later decision.

## Further Notes

The Pathfinder award is the clearest illustration of why this work matters: its text promises one
thing and its predicate measures another, and both have shipped. Every item here is a variation on
that — a place where what the product says and what it does have drifted apart.

Nothing in this spec adds a feature. The value is that the word "verified" becomes true for all
seven metrics rather than six, and that the next person reading any layer of the system learns the
same vocabulary from it.

The riskiest step by a wide margin is the Activity Feed backfill, because it is the only one that
can silently cost a Learner something they earned. Inspect production data before writing that
migration, and confirm how many feed rows carry a usable mission identifier. If a meaningful number
do not, that is worth raising before proceeding rather than absorbing quietly.

The XP opening-balance backfill is the only genuinely irreversible part of this work. Everything
else can be rolled back; pre-ledger XP has no provenance to recover.

Local-time Streaks are the one place this spec knowingly accepts a weaker guarantee than the rest.
Everything else here moves *toward* server-verified evidence; the Streak offset moves one input in
the other direction, because a Learner's midnight is genuinely not something a server can know. The
trade is deliberate: a Streak that is honest about the day the Learner lived, at the cost of a
value the Learner could lie about. It is worth being explicit that this makes a Streak the one
metric on the dashboard that is not strictly verifiable, and worth revisiting if Streaks ever gate
anything of value.

Both clients must send the offset — the web application and the Android companion. If one is
updated and the other is not, the un-updated client silently falls back to UTC and its Learners
get subtly different Streaks from the same behaviour. Ship the contract change to both, or ship
the server change only once both can send it.
