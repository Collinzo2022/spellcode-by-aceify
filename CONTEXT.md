# SpellCode by Aceify — Domain Context

The shared language of this project. Glossary only: no implementation detail, no plans, no
status. If a term here disagrees with the code, the term wins and the code is wrong.

## The learner

**Learner** — a person using SpellCode to learn web development. The canonical domain term for
the human. Preferred over "user" in all learner-facing copy and in domain code.

**Profile** — the persisted record of a Learner: display name, avatar, role, and accumulated
learning state. One per Learner.

**Credential** — the authentication identity that proves a Learner is who they claim to be.
Owned by Supabase Auth, distinct from the Profile. A Learner has exactly one Credential and one
Profile, sharing an identifier.

**Learner ID** — the single identifier for a Learner, shared by Credential and Profile. Never
called `openId`; that name is a retired artifact of a former OAuth provider and refers to
nothing in the current system.

## Units of learning

Five distinct kinds. They are *not* interchangeable and share no umbrella term; each word means
exactly one thing.

**Lesson** — a unit of taught curriculum: theory, worked example, and an exercise. Ordered
within a Track and carries a difficulty. The backbone of the curriculum.

**Challenge** — a graded coding exercise attached to a Lesson. A Challenge can be *failed*; a
failed attempt is still recorded. This is what distinguishes it from a Lesson, which is either
completed or not.

**Daily Task** — one exercise offered per calendar day, the same for every Learner that day.
Expires with the day: it cannot be completed retroactively.

**Project** — a larger multi-step guided build (a landing page, a calculator) completed across
several sittings and optionally published.

**Mission** — one of the three sequential steps of the Beginner Build Lab. This word is
reserved: a Mission is *never* a Lesson, Challenge, Daily Task, or Project. Learner-facing copy
must not use "mission" for anything else.

**Track** — a top-level curriculum subject. Exactly three exist: HTML, CSS, JavaScript.

**Beginner Build Lab** — the introductory hands-on module containing the three Missions. A
Learner's first experience of the product.

## Recognition

Three distinct layers; one word each.

**Award** — the *definition* of something a Learner can earn: its name, description, criterion,
and icon. An Award exists whether or not anyone has earned it. Identified by an **award slug**
(`first-spark`), a stable human-readable string.

**Earned Award** — the record that one Learner satisfied one Award's criterion. Created only
from verified evidence and never seeded, backdated, or granted by hand.

**Award Mark** — the visual representation of an Award in the interface.

"Badge" and "achievement" are retired. "Badge" is reserved for the generic UI pill component and
carries no domain meaning.

**XP** — a monotonically increasing count of verified learning effort. XP is never spent, never
expires, and never decreases. It measures accumulated practice; it is not a currency or balance.
A Learner's XP total is the sum of their XP Entries and is always recomputable from them.

**XP Entry** — the record of one XP award: how much, to whom, and which single Completion caused
it. The system of record for XP. See ADR 0002.

**Streak** — the number of consecutive Local Days, ending today or yesterday, on which a Learner
completed at least one unit of learning. Any Lesson, Challenge, Daily Task, Project or Mission
Completion counts; none is privileged. A Streak is derived from the date of last learning
activity rather than stored as a fact, so it lapses on its own the moment a day is missed.

**Local Day** — a calendar day as the Learner lived it, in their own time. A Streak rolls over at
the Learner's midnight, never a server's. Only their client knows where that midnight falls, so
it tells the server on every request; the server never infers it from a network address or from
stored state, both of which are wrong the moment a Learner travels. A request that says nothing
is read as UTC.

**Longest Streak** — the highest Streak a Learner has ever reached. Unlike a Streak this is a
historical high-water mark, so it is stored: it cannot be derived from current state.

## Access and payment

**Full Access** — the single paid access gate. A Learner either holds Full Access or does not.
There are no partial or per-feature tiers: everything behind the gate unlocks together. See
ADR 0001.

**Plan** — a way to *pay* for Full Access. Plans differ only in payment schedule and total
amount, never in what they grant.

**Subscription** — a Learner's holding of a Plan, with a status and validity period. Full
Access is true when a Learner holds at least one Subscription in good standing.

**Payment** — a single verified money movement against a Subscription, matched to a Paystack
reference.

## Records

**Completion** — the durable record that a Learner finished one unit of learning. Every kind of
unit has its own Completion record. Completions are the evidence that all verification reads
from: XP, Streaks and Earned Awards are derived from them and from nothing else.

**Activity Feed** — the human-readable history shown to a Learner: what they did and when.
Presentational only. Nothing is ever counted, verified, or gated from the Activity Feed, and it
may be pruned at any time without affecting a Learner's XP, Streak, or Earned Awards.
